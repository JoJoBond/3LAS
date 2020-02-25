/*
    MPEG audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
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
    function AudioFormatReader_MPEG(audio, logger, errorCallback, dataReadyCallback, addId3Tag, windowSize, useFrames) {
        var _this = _super.call(this, audio, logger, errorCallback, dataReadyCallback) || this;
        _this._OnDecodeSuccess = _this.OnDecodeSuccess.bind(_this);
        _this._OnDecodeError = _this.OnDecodeError.bind(_this);
        _this.AddId3Tag = addId3Tag;
        _this.WindowSize = windowSize;
        _this.UseFrames = useFrames;
        _this.DataBuffer = new Uint8Array(0);
        _this.Frames = new Array();
        _this.Samples = new Array();
        _this.BufferStore = {};
        _this.FrameStartIdx = -1;
        _this.FrameEndIdx = -1;
        _this.FrameSamples = 0;
        _this.FrameSampleRate = 0;
        _this.TimeBudget = 0;
        _this.Id = 0;
        _this.LastPushedId = -1;
        return _this;
    }
    // Pushes frame data into the buffer
    AudioFormatReader_MPEG.prototype.PushData = function (data) {
        // Append data to framedata buffer
        this.DataBuffer = this.ConcatUint8Array(this.DataBuffer, data);
        // Try to extract frames
        this.ExtractAllFrames();
    };
    // Check if there are any samples ready for playback
    AudioFormatReader_MPEG.prototype.SamplesAvailable = function () {
        return (this.Samples.length > 0);
    };
    // Returns a bunch of samples for playback and removes the from the array
    AudioFormatReader_MPEG.prototype.PopSamples = function () {
        if (this.Samples.length > 0) {
            // Get first bunch of samples, remove said bunch from the array and hand it back to callee
            return this.Samples.shift();
        }
        else
            return null;
    };
    // Used to force frame extraction externaly
    AudioFormatReader_MPEG.prototype.Poke = function () {
        this.ExtractAllFrames();
    };
    // Deletes all frames from the databuffer and framearray and all samples from the samplearray
    AudioFormatReader_MPEG.prototype.PurgeData = function () {
        this.DataBuffer = new Uint8Array(0);
        this.Frames = new Array();
        this.Samples = new Array();
        this.FrameStartIdx = -1;
        this.FrameEndIdx = -1;
    };
    // Extracts all currently possible frames
    AudioFormatReader_MPEG.prototype.ExtractAllFrames = function () {
        // Look for frames
        this.FindFrame();
        var _loop_1 = function () {
            // Extract frame and push into array
            this_1.Frames.push(this_1.ExtractFrame());
            // Check if we have enough frames to decode
            if (this_1.Frames.length >= this_1.WindowSize) {
                var sampleRates_1 = new Array();
                var sampleCount_1 = new Array();
                // Sum the lengths of the individuall frames
                var bufferlength = 0;
                for (var i = 0; i < this_1.WindowSize; i++) {
                    sampleRates_1.push(this_1.Frames[i].SampleRate);
                    sampleCount_1.push(this_1.Frames[i].SampleCount);
                    bufferlength += this_1.Frames[i].Data.length;
                }
                // If needed, add some space for the ID3v2 tag
                if (this_1.AddId3Tag)
                    bufferlength += AudioFormatReader_MPEG.Id3v2Tag.length;
                // Create a buffer long enough to hold everything
                var windowbuffer = new Uint8Array(bufferlength);
                var offset = 0;
                // If needed, add ID3v2 tag to beginning of buffer
                if (this_1.AddId3Tag) {
                    windowbuffer.set(AudioFormatReader_MPEG.Id3v2Tag, offset);
                    offset += AudioFormatReader_MPEG.Id3v2Tag.length;
                }
                // Add the frames to the window
                for (var i = 0; i < this_1.WindowSize; i++) {
                    windowbuffer.set(this_1.Frames[i].Data, offset);
                    offset += this_1.Frames[i].Data.length;
                }
                // Remove the used frames from the array
                for (var i = 0; i < (this_1.UseFrames - 1); i++)
                    this_1.Frames.shift();
                // Increment Id
                var id_1 = this_1.Id++;
                // Push window to the decoder
                this_1.Audio.decodeAudioData(windowbuffer.buffer, (function (decodedData) {
                    var _id = id_1;
                    var _sampleRates = sampleRates_1;
                    var _sampleCount = sampleCount_1;
                    this._OnDecodeSuccess(decodedData, _id, _sampleRates, _sampleCount);
                }).bind(this_1), this_1._OnDecodeError.bind(this_1));
            }
            // Look for frames
            this_1.FindFrame();
        };
        var this_1 = this;
        // Repeat as long as we can extract frames
        while (this.CanExtractFrame()) {
            _loop_1();
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
                var brx = (this.DataBuffer[this.FrameStartIdx + 2] & 0xf0) >>> 4;
                // SampRate index
                var srx = (this.DataBuffer[this.FrameStartIdx + 2] & 0x0c) >>> 2;
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
        else if (this.FrameEndIdx < this.DataBuffer.length)
            return true;
        else
            return false;
    };
    // Extract a single frame from the buffer
    AudioFormatReader_MPEG.prototype.ExtractFrame = function () {
        // Extract frame data from buffer
        var framearray = this.DataBuffer.buffer.slice(this.FrameStartIdx, this.FrameEndIdx);
        // Remove frame from buffer
        if ((this.FrameEndIdx + 1) < this.DataBuffer.length)
            this.DataBuffer = new Uint8Array(this.DataBuffer.buffer.slice(this.FrameEndIdx));
        else
            this.DataBuffer = new Uint8Array(0);
        // Reset Start/End indices
        this.FrameStartIdx = 0;
        this.FrameEndIdx = -1;
        return new MPEGFrameInfo(new Uint8Array(framearray), this.FrameSamples, this.FrameSampleRate);
    };
    // Is called if the decoding of the window succeeded
    AudioFormatReader_MPEG.prototype.OnDecodeSuccess = function (decodedData, id, sampleRates, sampleCount) {
        /*
        // Get sample rate from first frame
        var CalcSampleRate = SampleRates[0];
        
        // Sum up the sample count of each decoded frame
        var CalcSampleCount = 0;
        for (var i = 0; i < SampleCount.length; i++)
            CalcSampleCount += SampleCount[i];
        
        // Calculate the expected number of samples
        CalcSampleCount = Math.ceil(CalcSampleCount * buffer.sampleRate / CalcSampleRate);
        */
        // Sum up the playback time of each decoded frame
        // Note: Since mp3-Frames overlap by half of their sample-length we expect the
        // first and last frame to be only half as long. Some decoders will still output
        // the full frame length by adding zeros.
        var calcTotalPlayTime = 0;
        calcTotalPlayTime += sampleCount[0] / sampleRates[0] / 2.0;
        for (var i = 1; i < (sampleCount.length - 1); i++)
            calcTotalPlayTime += sampleCount[i] / sampleRates[i];
        calcTotalPlayTime += sampleCount[sampleCount.length - 1] / sampleRates[sampleCount.length - 1] / 2.0;
        // Calculate the expected number of samples
        var calcSampleCount = calcTotalPlayTime * decodedData.sampleRate;
        var decoderOffset;
        // Check if we got the expected number of samples
        if (calcTotalPlayTime > decodedData.duration) {
            // We got less samples than expect, we suspect that they were truncated equally at start and end.
            var offsetTime = (calcTotalPlayTime - decodedData.duration) / 2.0;
            decoderOffset = Math.ceil(offsetTime * decodedData.sampleRate);
        }
        else if (calcTotalPlayTime < decodedData.duration) {
            // We got more samples than expect, we suspect that zeros were added equally at start and end.
            var offsetTime = (decodedData.duration - calcTotalPlayTime) / 2.0;
            decoderOffset = -1.0 * Math.ceil(offsetTime * decodedData.sampleRate);
        }
        else {
            // We got the expected number of samples, no adaption needed
            decoderOffset = 0;
        }
        // Note:
        // =====
        //	mp3 frames have an overlap of [granule size] so we can't use the first or last [granule size] samples
        // [granule size] is equal to half of a [frame size] in samples (using the mp3's sample rate)
        // Calculate the size and offset of the frame to extract
        //var OffsetRight = Math.ceil(Math.ceil(SampleCount[SampleCount.length - 1] / 2 * buffer.sampleRate / CalcSampleRate) * this._OffsetRightFactor);
        var extractTimeSum = 0;
        extractTimeSum += sampleCount[sampleCount.length - 1] / sampleRates[sampleCount.length - 1] / 2.0;
        for (var i = 1; i < (this.UseFrames - 1); i++)
            extractTimeSum += sampleCount[sampleCount.length - 1 - i] / sampleRates[sampleCount.length - 1 - i];
        extractTimeSum += sampleCount[sampleCount.length - this.UseFrames] / sampleRates[sampleCount.length - this.UseFrames] / 2.0;
        var extractSampleNum = extractTimeSum * decodedData.sampleRate;
        this.TimeBudget += (extractSampleNum - Math.floor(extractSampleNum)) / decodedData.sampleRate;
        var budgetSamples = 0;
        if (this.TimeBudget * decodedData.sampleRate > 1.0) {
            budgetSamples = Math.floor(this.TimeBudget * decodedData.sampleRate);
            this.TimeBudget -= budgetSamples / decodedData.sampleRate;
        }
        else if (this.TimeBudget * decodedData.sampleRate < -1.0) {
            budgetSamples = -1.0 * Math.floor(Math.abs(this.TimeBudget * decodedData.sampleRate));
            this.TimeBudget -= budgetSamples / decodedData.sampleRate;
        }
        extractSampleNum = Math.floor(extractSampleNum) + budgetSamples;
        var offsetRight = 0; //Math.ceil((SampleCount[SampleCount.length - 1] / SampleRates[SampleCount.length - 1] / 2.0) * buffer.sampleRate * this._OffsetRightFactor);
        // Create a buffer that can hold the frame to extract
        var audioBuffer = this.Audio.createBuffer(decodedData.numberOfChannels, extractSampleNum, decodedData.sampleRate);
        // Fill buffer with the last part of the decoded frame leave out last granule
        for (var i = 0; i < decodedData.numberOfChannels; i++)
            audioBuffer.getChannelData(i).set(decodedData.getChannelData(i).subarray(decodedData.length - offsetRight + decoderOffset - extractSampleNum, decodedData.length - offsetRight + decoderOffset));
        if (this.LastPushedId + 1 == id) {
            // Push samples into array
            this.Samples.push(audioBuffer);
            this.LastPushedId++;
            while (this.BufferStore[this.LastPushedId + 1]) {
                // Push samples we decoded earlier in correct oder
                this.Samples.push(this.BufferStore[this.LastPushedId + 1]);
                delete this.BufferStore[this.LastPushedId + 1];
                this.LastPushedId++;
            }
            // Callback to tell that data is ready
            this.DataReadyCallback();
        }
        else {
            // Is out of order, will be pushed later
            this.BufferStore[id] = audioBuffer;
        }
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