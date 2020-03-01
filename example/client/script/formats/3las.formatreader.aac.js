/*
    AAC audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var AudioFormatReader_AAC = /** @class */ (function (_super) {
    __extends(AudioFormatReader_AAC, _super);
    function AudioFormatReader_AAC(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback, minDecodeFrames) {
        var _this = _super.call(this, audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback) || this;
        _this._OnDecodeSuccess = _this.OnDecodeSuccess.bind(_this);
        _this._OnDecodeError = _this.OnDecodeError.bind(_this);
        _this.MinDecodeFrames = minDecodeFrames;
        _this.Frames = new Array();
        _this.FrameStartIdx = -1;
        _this.FrameEndIdx = -1;
        _this.TimeBudget = 0;
        return _this;
    }
    // Deletes all frames from the databuffer and framearray and all samples from the samplearray
    AudioFormatReader_AAC.prototype.PurgeData = function () {
        _super.prototype.PurgeData.call(this);
        this.Frames = new Array();
        this.FrameStartIdx = -1;
        this.FrameEndIdx = -1;
        this.TimeBudget = 0;
    };
    // Extracts all currently possible frames
    AudioFormatReader_AAC.prototype.ExtractAll = function () {
        // Look for frames
        this.FindFrame();
        // Repeat as long as we can extract frames
        while (this.CanExtractFrame()) {
            // Extract frame and push into array
            this.Frames.push(this.ExtractFrame());
            // Look for frames
            this.FindFrame();
        }
        // Check if we have enough frames to decode
        if (this.Frames.length >= this.MinDecodeFrames) {
            // Sum raw data length
            var bufferLength = 0;
            for (var i = 0; i < this.Frames.length; i++) {
                bufferLength += this.Frames[i].length;
            }
            // Create a buffer long enough to hold everything
            var decodeBuffer = new Uint8Array(bufferLength);
            var offset = 0;
            // Add the frames to the window
            for (var i = 0; i < this.Frames.length; i++) {
                decodeBuffer.set(this.Frames[i], offset);
                offset += this.Frames[i].length;
            }
            // Remove the used frames from the array
            this.Frames.splice(0, this.Frames.length - 1);
            // Increment Id
            var id_1 = this.Id++;
            // Push window to the decoder
            this.Audio.decodeAudioData(decodeBuffer.buffer, (function (decodedData) {
                var _id = id_1;
                this._OnDecodeSuccess(decodedData, _id);
            }).bind(this), this._OnDecodeError.bind(this));
        }
    };
    // Finds frame boundries within the data buffer
    AudioFormatReader_AAC.prototype.FindFrame = function () {
        // Find frame start
        if (this.FrameStartIdx < 0) {
            var i = 0;
            // Make sure we don't exceed array bounds
            while ((i + 1) < this.DataBuffer.length) {
                // Look for ADTS sync word
                if (this.DataBuffer[i] == 0xFF && (this.DataBuffer[i + 1] & 0xF0) == 0xF0) {
                    // Sync found, set frame start
                    this.FrameStartIdx = i;
                    break;
                }
                i++;
            }
        }
        // Find frame end
        if (this.FrameStartIdx >= 0 && this.FrameEndIdx < 0) {
            // Check if we have enough data to process the header
            if ((this.FrameStartIdx + 7) < this.DataBuffer.length) {
                // Get header data
                // Version index
                var ver = (this.DataBuffer[this.FrameStartIdx + 1] & 0x08) >>> 3;
                // Layer index
                var lyr = (this.DataBuffer[this.FrameStartIdx + 1] & 0x06) >>> 1;
                // CRC absent
                var xrc = (this.DataBuffer[this.FrameStartIdx + 1] & 0x01) == 0x01;
                if (xrc || (this.FrameStartIdx + 9) < this.DataBuffer.length) {
                    // Profile index
                    var prf = (this.DataBuffer[this.FrameStartIdx + 2] & 0xC0) >>> 6;
                    // SampRate index
                    var srx = (this.DataBuffer[this.FrameStartIdx + 2] & 0x3C) >>> 2;
                    // Channels
                    var chn = ((this.DataBuffer[this.FrameStartIdx + 2] & 0x01) << 2) |
                        ((this.DataBuffer[this.FrameStartIdx + 3] & 0xC0) >>> 6);
                    // Frame length
                    var len = ((this.DataBuffer[this.FrameStartIdx + 3] & 0x03) << 11) |
                        (this.DataBuffer[this.FrameStartIdx + 4] << 3) |
                        ((this.DataBuffer[this.FrameStartIdx + 5] & 0xE0) >>> 5);
                    // Buffer fullness
                    var bfn = ((this.DataBuffer[this.FrameStartIdx + 5] & 0x1F) << 6) |
                        ((this.DataBuffer[this.FrameStartIdx + 6] & 0xFC) >>> 2);
                    // Number of AAC frames 
                    var fnm = (this.DataBuffer[this.FrameStartIdx + 6] & 0x03);
                    if (!xrc) {
                        var crc = (this.DataBuffer[this.FrameStartIdx + 7] << 8) | this.DataBuffer[this.FrameStartIdx + 8];
                    }
                    // Resolve flags to real values
                    var samprate = AudioFormatReader_AAC.AAC_srates[srx];
                    if (chn == 7)
                        chn = 8;
                    // Set end frame boundry
                    this.FrameEndIdx = this.FrameStartIdx + len;
                }
            }
        }
    };
    // Checks if there is a frame ready to be extracted
    AudioFormatReader_AAC.prototype.CanExtractFrame = function () {
        if (this.FrameStartIdx < 0 || this.FrameEndIdx < 0)
            return false;
        else if (this.FrameEndIdx <= this.DataBuffer.length)
            return true;
        else
            return false;
    };
    // Extract a single frame from the buffer
    AudioFormatReader_AAC.prototype.ExtractFrame = function () {
        // Extract frame data from buffer
        var frameArray = this.DataBuffer.buffer.slice(this.FrameStartIdx, this.FrameEndIdx);
        // Remove frame from buffer
        if ((this.FrameEndIdx + 1) < this.DataBuffer.length)
            this.DataBuffer = new Uint8Array(this.DataBuffer.buffer.slice(this.FrameEndIdx));
        else
            this.DataBuffer = new Uint8Array(0);
        // Reset Start/End indices
        this.FrameStartIdx = 0;
        this.FrameEndIdx = -1;
        return new Uint8Array(frameArray);
    };
    // Is called if the decoding of the window succeeded
    AudioFormatReader_AAC.prototype.OnDecodeSuccess = function (decodedData, id) {
        this.OnDataReady(id, decodedData);
    };
    // Is called in case the decoding of the window fails
    AudioFormatReader_AAC.prototype.OnDecodeError = function (_error) {
        this.ErrorCallback();
    };
    // Sample rates - use [version][srate]
    AudioFormatReader_AAC.AAC_srates = new Array(96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350, -1, // Reserved
    -1);
    return AudioFormatReader_AAC;
}(AudioFormatReader));
//# sourceMappingURL=3las.formatreader.aac.js.map