/*
    MPEG audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var MPEGFrameInfo = /** @class */ (function () {
    function MPEGFrameInfo(data, sampleCount, sampleRate) {
        this.Data = data;
        this.SampleCount = sampleCount;
        this.SampleRate = sampleRate;
    }
    return MPEGFrameInfo;
}());
var AudioFormatReader_MPEG = /** @class */ (function (_super) {
    __extends(AudioFormatReader_MPEG, _super);
    function AudioFormatReader_MPEG(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback, addId3Tag, minDecodeFrames) {
        var _this = _super.call(this, audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback) || this;
        _this._OnDecodeSuccess = _this.OnDecodeSuccess.bind(_this);
        _this._OnDecodeError = _this.OnDecodeError.bind(_this);
        _this.AddId3Tag = addId3Tag;
        _this.MinDecodeFrames = minDecodeFrames;
        _this.Frames = new Array();
        _this.FrameStartIdx = -1;
        _this.FrameEndIdx = -1;
        _this.FrameSamples = 0;
        _this.FrameSampleRate = 0;
        _this.TimeBudget = 0;
        return _this;
    }
    // Deletes all frames from the databuffer and framearray and all samples from the samplearray
    AudioFormatReader_MPEG.prototype.PurgeData = function () {
        _super.prototype.PurgeData.call(this);
        this.Frames = new Array();
        this.FrameStartIdx = -1;
        this.FrameEndIdx = -1;
        this.FrameSamples = 0;
        this.FrameSampleRate = 0;
        this.TimeBudget = 0;
    };
    // Extracts all currently possible frames
    AudioFormatReader_MPEG.prototype.ExtractAll = function () {
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
            // Note:
            // =====
            // mp3 frames have an overlap of [granule size] so we can't use the first or last [granule size] samples.
            // [granule size] is equal to half of a [frame size] in samples (using the mp3's sample rate).
            // Sum up the playback time of each decoded frame and data buffer lengths
            // Note: Since mp3-Frames overlap by half of their sample-length we expect the
            // first and last frame to be only half as long. Some decoders will still output
            // the full frame length by adding zeros.
            var bufferLength = 0;
            var expectedTotalPlayTime_1 = 0;
            expectedTotalPlayTime_1 += this.Frames[0].SampleCount / this.Frames[0].SampleRate / 2.0; // Only half of data is usable due to overlap
            bufferLength += this.Frames[0].Data.length;
            for (var i = 1; i < this.Frames.length - 1; i++) {
                expectedTotalPlayTime_1 += this.Frames[i].SampleCount / this.Frames[i].SampleRate;
                bufferLength += this.Frames[i].Data.length;
            }
            expectedTotalPlayTime_1 += this.Frames[this.Frames.length - 1].SampleCount / this.Frames[this.Frames.length - 1].SampleRate / 2.0; // Only half of data is usable due to overlap
            bufferLength += this.Frames[this.Frames.length - 1].Data.length;
            // If needed, add some space for the ID3v2 tag
            if (this.AddId3Tag) {
                bufferLength += AudioFormatReader_MPEG.Id3v2Tag.length;
            }
            // Create a buffer long enough to hold everything
            var decodeBuffer = new Uint8Array(bufferLength);
            var offset = 0;
            // If needed, add ID3v2 tag to beginning of buffer
            if (this.AddId3Tag) {
                decodeBuffer.set(AudioFormatReader_MPEG.Id3v2Tag, offset);
                offset += AudioFormatReader_MPEG.Id3v2Tag.length;
            }
            // Add the frames to the window
            for (var i = 0; i < this.Frames.length; i++) {
                decodeBuffer.set(this.Frames[i].Data, offset);
                offset += this.Frames[i].Data.length;
            }
            // Remove the used frames from the array
            this.Frames.splice(0, this.Frames.length - 1);
            // Increment Id
            var id_1 = this.Id++;
            // Check if decoded frames might be too far back in the past
            if (!this.OnBeforeDecode(id_1, expectedTotalPlayTime_1))
                return;
            // Push window to the decoder
            this.Audio.decodeAudioData(decodeBuffer.buffer, (function (decodedData) {
                var _id = id_1;
                var _expectedTotalPlayTime = expectedTotalPlayTime_1;
                this._OnDecodeSuccess(decodedData, _id, _expectedTotalPlayTime);
            }).bind(this), this._OnDecodeError.bind(this));
        }
    };
    // Finds frame boundries within the data buffer
    AudioFormatReader_MPEG.prototype.FindFrame = function () {
        // Find frame start
        if (this.FrameStartIdx < 0) {
            var i = 0;
            // Make sure we don't exceed array bounds
            while ((i + 1) < this.DataBuffer.length) {
                // Look for MPEG sync word
                if (this.DataBuffer[i] == 0xFF && (this.DataBuffer[i + 1] & 0xE0) == 0xE0) {
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
            if ((this.FrameStartIdx + 2) < this.DataBuffer.length) {
                // Get header data
                // Version index
                var ver = (this.DataBuffer[this.FrameStartIdx + 1] & 0x18) >>> 3;
                // Layer index
                var lyr = (this.DataBuffer[this.FrameStartIdx + 1] & 0x06) >>> 1;
                // Padding? 0/1
                var pad = (this.DataBuffer[this.FrameStartIdx + 2] & 0x02) >>> 1;
                // Bitrate index
                var brx = (this.DataBuffer[this.FrameStartIdx + 2] & 0xF0) >>> 4;
                // SampRate index
                var srx = (this.DataBuffer[this.FrameStartIdx + 2] & 0x0C) >>> 2;
                // Resolve flags to real values
                var bitrate = AudioFormatReader_MPEG.MPEG_bitrates[ver][lyr][brx] * 1000;
                var samprate = AudioFormatReader_MPEG.MPEG_srates[ver][srx];
                var samples = AudioFormatReader_MPEG.MPEG_frame_samples[ver][lyr];
                var slot_size = AudioFormatReader_MPEG.MPEG_slot_size[lyr];
                // In-between calculations
                var bps = samples / 8.0;
                var fsize = ((bps * bitrate) / samprate) + ((pad == 1) ? slot_size : 0);
                // Truncate to integer
                var frameSize = Math.floor(fsize);
                // Store number of samples and samplerate for frame
                this.FrameSamples = samples;
                this.FrameSampleRate = samprate;
                // Set end frame boundry
                this.FrameEndIdx = this.FrameStartIdx + frameSize;
            }
        }
    };
    // Checks if there is a frame ready to be extracted
    AudioFormatReader_MPEG.prototype.CanExtractFrame = function () {
        if (this.FrameStartIdx < 0 || this.FrameEndIdx < 0)
            return false;
        else if (this.FrameEndIdx <= this.DataBuffer.length)
            return true;
        else
            return false;
    };
    // Extract a single frame from the buffer
    AudioFormatReader_MPEG.prototype.ExtractFrame = function () {
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
        return new MPEGFrameInfo(new Uint8Array(frameArray), this.FrameSamples, this.FrameSampleRate);
    };
    // Is called if the decoding of the window succeeded
    AudioFormatReader_MPEG.prototype.OnDecodeSuccess = function (decodedData, id, expectedTotalPlayTime) {
        var extractSampleCount;
        var extractSampleOffset;
        // Check if we got the expected number of samples
        if (expectedTotalPlayTime > decodedData.duration) {
            // We got less samples than expect, we suspect that they were truncated equally at start and end.
            // This can happen in case of sample rate conversions.
            extractSampleCount = decodedData.length;
            extractSampleOffset = 0;
            this.TimeBudget += (expectedTotalPlayTime - decodedData.duration);
        }
        else if (expectedTotalPlayTime < decodedData.duration) {
            // We got more samples than expect, we suspect that zeros were added equally at start and end.
            // This can happen in case of sample rate conversions or edge frame handling.
            extractSampleCount = Math.ceil(expectedTotalPlayTime * decodedData.sampleRate);
            var budgetSamples = this.TimeBudget * decodedData.sampleRate;
            if (budgetSamples > 1.0) {
                if (budgetSamples > decodedData.length - extractSampleCount) {
                    budgetSamples = decodedData.length - extractSampleCount;
                }
                extractSampleCount += budgetSamples;
                this.TimeBudget -= (budgetSamples / decodedData.sampleRate);
            }
            extractSampleOffset = Math.floor((decodedData.length - extractSampleCount) / 2);
        }
        else {
            // We got the expected number of samples, no adaption needed
            extractSampleCount = decodedData.length;
            extractSampleOffset = 0;
        }
        // Create a buffer that can hold the frame to extract
        var audioBuffer = this.Audio.createBuffer(decodedData.numberOfChannels, extractSampleCount, decodedData.sampleRate);
        // Fill buffer with the last part of the decoded frame leave out last granule
        for (var i = 0; i < decodedData.numberOfChannels; i++)
            audioBuffer.getChannelData(i).set(decodedData.getChannelData(i).subarray(extractSampleOffset, extractSampleOffset + extractSampleCount));
        this.OnDataReady(id, audioBuffer);
    };
    // Is called in case the decoding of the window fails
    AudioFormatReader_MPEG.prototype.OnDecodeError = function (_error) {
        this.ErrorCallback();
    };
    // MPEG versions - use [version]
    AudioFormatReader_MPEG.MPEG_versions = new Array(25, 0, 2, 1);
    // Layers - use [layer]
    AudioFormatReader_MPEG.MPEG_layers = new Array(0, 3, 2, 1);
    // Bitrates - use [version][layer][bitrate]
    AudioFormatReader_MPEG.MPEG_bitrates = new Array(new Array(// Version 2.5
    new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // Reserved
    new Array(0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0), // Layer 3
    new Array(0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0), // Layer 2
    new Array(0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0) // Layer 1
    ), new Array(// Reserved
    new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // Invalid
    new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // Invalid
    new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // Invalid
    new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0) // Invalid
    ), new Array(// Version 2
    new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // Reserved
    new Array(0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0), // Layer 3
    new Array(0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0), // Layer 2
    new Array(0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0) // Layer 1
    ), new Array(// Version 1
    new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // Reserved
    new Array(0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0), // Layer 3
    new Array(0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0), // Layer 2
    new Array(0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0) // Layer 1
    ));
    // Sample rates - use [version][srate]
    AudioFormatReader_MPEG.MPEG_srates = new Array(new Array(11025, 12000, 8000, 0), // MPEG 2.5
    new Array(0, 0, 0, 0), // Reserved
    new Array(22050, 24000, 16000, 0), // MPEG 2
    new Array(44100, 48000, 32000, 0) // MPEG 1
    );
    // Samples per frame - use [version][layer]
    AudioFormatReader_MPEG.MPEG_frame_samples = new Array(
    //             Rsvd     3     2     1  < Layer  v Version
    new Array(0, 576, 1152, 384), //       2.5
    new Array(0, 0, 0, 0), //       Reserved
    new Array(0, 576, 1152, 384), //       2
    new Array(0, 1152, 1152, 384) //       1
    );
    AudioFormatReader_MPEG.Id3v2Tag = new Uint8Array(new Array(0x49, 0x44, 0x33, // File identifier: "ID3"
    0x03, 0x00, // Version 2.3
    0x00, // Flags: no unsynchronisation, no extended header, no experimental indicator
    0x00, 0x00, 0x00, 0x0D, // Size of the (tag-)frames, extended header and padding
    0x54, 0x49, 0x54, 0x32, // Title frame: "TIT2"
    0x00, 0x00, 0x00, 0x02, // Size of the frame data
    0x00, 0x00, // Frame Flags
    0x00, 0x20, 0x00 // Frame data (space character) and padding 
    ));
    // Slot size (MPEG unit of measurement) - use [layer]
    AudioFormatReader_MPEG.MPEG_slot_size = new Array(0, 1, 1, 4); // Rsvd, 3, 2, 1
    return AudioFormatReader_MPEG;
}(AudioFormatReader));
//# sourceMappingURL=3las.formatreader.mpeg.js.map