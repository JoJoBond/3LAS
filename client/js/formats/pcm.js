/*
	PCM-Audio-Format-Reader is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

function AudioFormatReader_PCM(ErrorCallback, DataReadyCallback, SampleRate, BitDepth) {
    AudioFormatReader.call(this, ErrorCallback, DataReadyCallback);

    // Dependencies:
    // =============

    // Create audio context
    if (typeof AudioContext !== "undefined")
        this._SoundContext = new AudioContext();
    else if (typeof webkitAudioContext !== "undefined")
        this._SoundContext = new webkitAudioContext();
    else if (typeof mozAudioContext !== "undefined")
        this._SoundContext = new mozAudioContext();
    else
        throw new Error('AudioFormatReader_PCM: Browser does not support "AudioContext".');

    // Internal variables:
    // ===================

    // Stores sample rate
    this._SampleRate = SampleRate;

    // Stores bit depth
    this._BitDepth = BitDepth;

    // Stores denominator
    this._Denominator = Math.pow(2, BitDepth - 1);

    // Data buffer for "raw" samples
    this._DataBuffer = new Uint8Array(0);

    // Array for individual bunches of converted (float) samples
    this._FloatSamples = new Array();
}


// Constants:
// ==========

// Number of PCM samples to convert together
if (isAndroid && isNativeChrome)
    AudioFormatReader_PCM.prototype._BatchLength = 1000;
else if (isAndroid && isFirefox)
    AudioFormatReader_PCM.prototype._BatchLength = 1000;
else
    AudioFormatReader_PCM.prototype._BatchLength = 500;


// Pubic methods (external functions):
// ===================================

// Pushes int sample data into the buffer
AudioFormatReader_PCM.prototype.PushData = function (data) {
    // Append data to pagedata buffer
    this._DataBuffer = appendBuffer(this._DataBuffer, new Uint8Array(data));
    // Try to extract pages
    this._ConvertSamples();
};

// Check if there are any samples ready for playback
AudioFormatReader_PCM.prototype.SamplesAvailable = function () {
    return (this._FloatSamples.length > 0);
};

// Returns a bunch of samples for playback and removes the from the array
AudioFormatReader_PCM.prototype.PopSamples = function () {
    if (this._FloatSamples.length > 0) {
        // Get first bunch of samples
        var audioBuffer = this._FloatSamples[0];
        // Remove said bunch from the array
        this._FloatSamples.shift();
        // Hand it back to callee
        return audioBuffer;
    }
    else
        return null;
};

// Used to force sample extraction externaly
AudioFormatReader_PCM.prototype.Poke = function () {
    this._ConvertSamples();
};

// Deletes all samples from the databuffer and the samplearray
AudioFormatReader_PCM.prototype.PurgeData = function () {
    this._DataBuffer = new Uint8Array(0);
    this._FloatSamples = new Array();
};


// Private methods (Internal functions):
// =====================================

// Extracts all currently possible samples
AudioFormatReader_PCM.prototype._ConvertSamples = function () {

    
    while (this._CanExtractSamples()) {
        var audioBuffer;

        try {
            // Extract samples
            var tmpSamples = this._ExtractPCMSamples();

            audioBuffer = Float32Array.from(tmpSamples, n => n / this._Denominator);

        }
        catch (e) {
            this._ErrorCallback();
            return;
        }

        // Push samples into arrray
        this._FloatSamples.push(audioBuffer);

        // Callback to tell that data is ready
        this._DataReadyCallback();
    }
};

// Checks if there is a samples ready to be extracted
AudioFormatReader_PCM.prototype._CanExtractSamples = function () {
    if (this._DataBuffer.length >= this._BitDepth * this._BatchLength)
        return true;
    else
        return false;
};

// Extract a single batch of samples from the buffer
AudioFormatReader_PCM.prototype._ExtractPCMSamples = function () {
    // Extract sample data from buffer
    var intsamplearray = new Uint8Array(this._DataBuffer.buffer.slice(0, this._TotalBatchByteSize));

    // Remove samples from buffer
    this._DataBuffer = new Uint8Array(this._DataBuffer.buffer.slice(this._BatchBytes));

    return intsamplearray;
};

// Used to append two Uint8Array (buffer2 comes BEHIND buffer1)
function appendBuffer(buffer1, buffer2) {
    var tmp = new Uint8Array(buffer1.length + buffer2.length);
    tmp.set(buffer1, 0);
    tmp.set(buffer2, buffer1.length);
    return tmp;
}
