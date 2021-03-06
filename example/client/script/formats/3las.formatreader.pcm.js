/*
    PCM audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
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
var AudioFormatReader_PCM = /** @class */ (function (_super) {
    __extends(AudioFormatReader_PCM, _super);
    function AudioFormatReader_PCM(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback, sampleRate, bitDepth, channels, batchDuration) {
        var _this = _super.call(this, audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback) || this;
        _this.SampleRate = sampleRate;
        _this.BitDepth = bitDepth;
        _this.Channels = channels;
        _this.BatchDuration = batchDuration;
        _this.BatchSize = Math.ceil(_this.BatchDuration * _this.SampleRate);
        _this.BatchByteSize = _this.BatchSize * _this.Channels * Math.ceil(_this.BitDepth / 8);
        _this.Denominator = Math.pow(2, _this.BitDepth - 1);
        return _this;
    }
    AudioFormatReader_PCM.prototype.ExtractAll = function () {
        while (this.CanExtractSamples()) {
            var tmpSamples = this.ExtractPCMSamples();
            var audioBuffer = this.Audio.createBuffer(this.Channels, this.BatchSize, this.SampleRate);
            if (!this.BeforeDecodeCheck(this.BatchDuration)) {
                // Push empty samples into arrray
                this.Samples.push(audioBuffer);
                // Callback to tell that data is ready
                this.DataReadyCallback();
                continue;
            }
            try {
                // Extract samples
                var dataView = new DataView(tmpSamples.buffer);
                var floatBuffer = void 0;
                if (this.BitDepth == 8) {
                    floatBuffer = new Float32Array(tmpSamples.length);
                    for (var i = 0; i < tmpSamples.length; i++) {
                        floatBuffer[i] = dataView.getInt8(i) / this.Denominator;
                    }
                }
                else if (this.BitDepth == 16) {
                    floatBuffer = new Float32Array(tmpSamples.length / 2);
                    for (var i = 0, j = 0; i < tmpSamples.length; i += 2, j++) {
                        floatBuffer[j] = dataView.getInt16(i, true) / this.Denominator;
                    }
                }
                else if (this.BitDepth == 24) {
                    floatBuffer = new Float32Array(tmpSamples.length / 3);
                    for (var i = 0, j = 0; i < tmpSamples.length; i += 3, j++) {
                        floatBuffer[j] = (dataView.getUint8(i) | (dataView.getInt16(i + 1, true) << 8)) / this.Denominator;
                    }
                }
                else if (this.BitDepth == 32) {
                    floatBuffer = new Float32Array(tmpSamples.length / 4);
                    for (var i = 0, j = 0; i < tmpSamples.length; i += 4, j++) {
                        floatBuffer[j] = dataView.getInt32(i, true) / this.Denominator;
                    }
                }
                // Copy samples into AudioBuffer
                if (this.Channels == 1) {
                    audioBuffer.copyToChannel(floatBuffer, 0, 0);
                }
                else {
                    var floatBuffers = new Array();
                    for (var i = 0; i < this.Channels; i++) {
                        floatBuffers.push(new Float32Array(floatBuffer.length / this.Channels));
                    }
                    for (var i = 0, j = 0, k = 0; i < floatBuffer.length; i++) {
                        floatBuffers[j][k] = floatBuffer[i];
                        if (++j >= this.Channels) {
                            j = 0;
                            k++;
                        }
                    }
                    floatBuffer = null;
                    for (var i = 0; i < this.Channels; i++) {
                        audioBuffer.copyToChannel(floatBuffers[i], i, 0);
                    }
                }
            }
            catch (e) {
                this.ErrorCallback();
                return;
            }
            // Push samples into arrray
            this.Samples.push(audioBuffer);
            // Callback to tell that data is ready
            this.DataReadyCallback();
        }
    };
    // Checks if there is a samples ready to be extracted
    AudioFormatReader_PCM.prototype.CanExtractSamples = function () {
        return this.DataBuffer.length >= this.BatchByteSize;
    };
    // Extract a single batch of samples from the buffer
    AudioFormatReader_PCM.prototype.ExtractPCMSamples = function () {
        // Extract sample data from buffer
        var intSampleArray = new Uint8Array(this.DataBuffer.buffer.slice(0, this.BatchByteSize));
        // Remove samples from buffer
        this.DataBuffer = new Uint8Array(this.DataBuffer.buffer.slice(this.BatchByteSize));
        return intSampleArray;
    };
    return AudioFormatReader_PCM;
}(AudioFormatReader));
//# sourceMappingURL=3las.formatreader.pcm.js.map