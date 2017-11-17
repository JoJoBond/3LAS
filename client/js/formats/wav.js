/*
	WAV-Audio-Format-Reader is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

function AudioFormatReader_WAV (ErrorCallback, DataReadyCallback)
{
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
		throw new Error('AudioFormatReader_WAV: Browser does not support "AudioContext".');
	
	// Internal variables:
	// ===================
	
	// Stores if we have a header already
	this._GotHeader = false;
	
	// Stores the RIFF header
	this._RiffHeader = null;
	
	// Stores sample rate from RIFF header
	this._WaveSampleRate = 0;
	
	// Stores bit depth from RIFF header
	this._WaveBitsPerSample = 0;
	this._WaveBytesPerSample = 0;
	
	// Stores the size of a single datablock
	this._WaveBlockAlign = 0;
	
	// Stores number of channels from RIFF header
	this._WaveChannels = 0;
	
	// Data buffer for "raw" samples
	this._DataBuffer = new Uint8Array(0);
	
	// Array for individual bunches of converted (float) samples
	this._FloatSamples = new Array();
	
	// Stores the actual size of each batch in samples
	this._BatchSamples = 0;
	
	// Stores the actual size of each batch in bytes
	this._BatchBytes = 0;
	
	// Stores the actual size of the edge samples
	this._ExtraEdgeSamples = 0;
	
	// Stores the total batch size in samples
	this._TotalBatchSampleSize = 0;
	
	// Stores the total batch size in bytes (without the header)
	this._TotalBatchByteSize = 0;
	
	// Stores lost/missing samples over time to correct when a sample rate conversion is happening
	this._SampleBudget = 0;
}


// Constants:
// ==========

// Length of wave samples to decode together
if (isAndroid && isNativeChrome)
    AudioFormatReader_WAV.prototype._BatchLength = 96 / 375;
else if (isAndroid && isFirefox)
    AudioFormatReader_WAV.prototype._BatchLength = 96 / 375;
else
    AudioFormatReader_WAV.prototype._BatchLength = 6 / 375;

// Length of addtional samples to decode to account for edge effects
if (isAndroid && isNativeChrome)
    AudioFormatReader_WAV.prototype._ExtraEdgeLength = 1 / 1000;
else if (isAndroid && isFirefox)
    AudioFormatReader_WAV.prototype._ExtraEdgeLength = 1 / 1000;
else
    AudioFormatReader_WAV.prototype._ExtraEdgeLength = 1 / 1000;


// Pubic methods (external functions):
// ===================================

// Pushes int sample data into the buffer
AudioFormatReader_WAV.prototype.PushData = function (data) {
    // Append data to pagedata buffer
    this._DataBuffer = appendBuffer(this._DataBuffer, new Uint8Array(data));
    // Try to extract pages
    this._ExtractAllIntSamples();
};

// Check if there are any samples ready for playback
AudioFormatReader_WAV.prototype.SamplesAvailable = function () {
    return (this._FloatSamples.length > 0);
};

// Returns a bunch of samples for playback and removes the from the array
AudioFormatReader_WAV.prototype.PopSamples = function () {
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
AudioFormatReader_WAV.prototype.Poke = function () {
    this._ExtractAllIntSamples();
};

// Deletes all samples from the databuffer and the samplearray
AudioFormatReader_WAV.prototype.PurgeData = function () {
    this._DataBuffer = new Uint8Array(0);
    this._FloatSamples = new Array();
};


// Private methods (Internal functions):
// =====================================

// Extracts all currently possible samples
AudioFormatReader_WAV.prototype._ExtractAllIntSamples = function () {
    if (!this._GotHeader)
        this._FindAndExtractHeader();
    else {
        while (this._CanExtractSamples()) {
            // Extract samples
            var tmpSamples = this._ExtractIntSamples();

            // Note:
            // =====
            // When audio data is resampled we get edge-effects at beginnging and end.
            // We should be able to compensate for that by keeping the last sample of the
            // previous batch and adding it to the beginning of the current one, but then
            // cutting it out AFTER the resampling (since the same effects apply to it)
            // The effects at the end can be compensated by cutting the resampled samples shorter
            // This is not trivial for non-natural ratios (e.g. 16kHz -> 44.1kHz). Because we would have
            // to cut out a non-natural number of samples at beginning and end.

            // TODO: All of the above...

            // Create a buffer long enough to hold everything
            var samplesbuffer = new Uint8Array(this._RiffHeader.length + tmpSamples.length);

            var offset = 0;

            // Add header
            samplesbuffer.set(this._RiffHeader, offset);
            offset += this._RiffHeader.length;

            // Add samples
            samplesbuffer.set(tmpSamples, offset);

            // Push pages to the decoder
            this._SoundContext.decodeAudioData(samplesbuffer.buffer,
                this.__decodeSuccess.bind(this),
                this.__decodeError.bind(this)
            );
        }
    }
};

// Finds riff header within the data buffer and extracts it
AudioFormatReader_WAV.prototype._FindAndExtractHeader = function () {
    var curpos = 0;
    // Make sure a whole header can fit
    if (!((curpos + 4) < this._DataBuffer.length))
        return;

    // Check chunkID, should be "RIFF"
    if (!(this._DataBuffer[curpos] == 0x52 && this._DataBuffer[curpos + 1] == 0x49 && this._DataBuffer[curpos + 2] == 0x46 && this._DataBuffer[curpos + 3] == 0x46))
        return;

    curpos += 8;

    if (!((curpos + 4) < this._DataBuffer.length))
        return;

    // Check riffType, should be "WAVE"
    if (!(this._DataBuffer[curpos] == 0x57 && this._DataBuffer[curpos + 1] == 0x41 && this._DataBuffer[curpos + 2] == 0x56 && this._DataBuffer[curpos + 3] == 0x45))
        return;

    curpos += 4;

    if (!((curpos + 4) < this._DataBuffer.length))
        return;

    // Check for format subchunk, should be "fmt "
    if (!(this._DataBuffer[curpos] == 0x66 && this._DataBuffer[curpos + 1] == 0x6d && this._DataBuffer[curpos + 2] == 0x74 && this._DataBuffer[curpos + 3] == 0x20))
        return;

    curpos += 4;

    if (!((curpos + 4) < this._DataBuffer.length))
        return;

    var SubchunkSize = this._DataBuffer[curpos] | this._DataBuffer[curpos + 1] << 8 | this._DataBuffer[curpos + 2] << 16 | this._DataBuffer[curpos + 3] << 24;

    if (!((curpos + 4 + SubchunkSize) < this._DataBuffer.length))
        return;

    curpos += 6;

    this._WaveChannels = this._DataBuffer[curpos] | this._DataBuffer[curpos + 1] << 8;

    curpos += 2;

    this._WaveSampleRate = this._DataBuffer[curpos] | this._DataBuffer[curpos + 1] << 8 | this._DataBuffer[curpos + 2] << 16 | this._DataBuffer[curpos + 3] << 24;

    curpos += 8;

    this._WaveBlockAlign = this._DataBuffer[curpos] | this._DataBuffer[curpos + 1] << 8;

    curpos += 2;

    this._WaveBitsPerSample = this._DataBuffer[curpos] | this._DataBuffer[curpos + 1] << 8;

    this._WaveBytesPerSample = this._WaveBitsPerSample / 8;

    curpos += SubchunkSize - 14;

    while (true) {
        if ((curpos + 8) < this._DataBuffer.length) {
            var SubchunkSize = this._DataBuffer[curpos + 4] | this._DataBuffer[curpos + 5] << 8 | this._DataBuffer[curpos + 6] << 16 | this._DataBuffer[curpos + 7] << 24;
            // Check for data subchunk, should be "data"
            if (this._DataBuffer[curpos] == 0x64 && this._DataBuffer[curpos + 1] == 0x61 && this._DataBuffer[curpos + 2] == 0x74 && this._DataBuffer[curpos + 3] == 0x61) // Data chunk found
                break;
            else
                curpos += 8 + SubchunkSize;
        }
        else
            return;
    }
    curpos += 8;

    this._RiffHeader = new Uint8Array(this._DataBuffer.buffer.slice(0, curpos));

    this._BatchSamples = Math.ceil(this._BatchLength * this._WaveSampleRate);
    this._ExtraEdgeSamples = Math.ceil(this._ExtraEdgeLength * this._WaveSampleRate);

    this._BatchBytes = this._BatchSamples * this._WaveBlockAlign;

    this._TotalBatchSampleSize = (this._BatchSamples + this._ExtraEdgeSamples);
    this._TotalBatchByteSize = this._TotalBatchSampleSize * this._WaveBlockAlign;

    var ChunkSize = this._RiffHeader.length + this._TotalBatchByteSize - 8;

    // Fix header chunksizes

    this._RiffHeader[4] = ChunkSize & 0xFF;
    this._RiffHeader[5] = (ChunkSize & 0xFF00) >>> 8;
    this._RiffHeader[6] = (ChunkSize & 0xFF0000) >>> 16;
    this._RiffHeader[7] = (ChunkSize & 0xFF000000) >>> 24;

    this._RiffHeader[this._RiffHeader.length - 4] = (this._TotalBatchByteSize & 0xFF);
    this._RiffHeader[this._RiffHeader.length - 3] = (this._TotalBatchByteSize & 0xFF00) >>> 8;
    this._RiffHeader[this._RiffHeader.length - 2] = (this._TotalBatchByteSize & 0xFF0000) >>> 16;
    this._RiffHeader[this._RiffHeader.length - 1] = (this._TotalBatchByteSize & 0xFF000000) >>> 24;

    this._GotHeader = true;
};

// Checks if there is a samples ready to be extracted
AudioFormatReader_WAV.prototype._CanExtractSamples = function () {
    if (this._DataBuffer.length >= this._TotalBatchByteSize)
        return true;
    else
        return false;
};

// Extract a single batch of samples from the buffer
AudioFormatReader_WAV.prototype._ExtractIntSamples = function () {
    // Extract sample data from buffer
    var intsamplearray = new Uint8Array(this._DataBuffer.buffer.slice(0, this._TotalBatchByteSize));

    // Remove samples from buffer
    this._DataBuffer = new Uint8Array(this._DataBuffer.buffer.slice(this._BatchBytes));

    return intsamplearray;
};


// Internal callback functions
// ===========================

// Is called if the decoding of the samples succeeded
AudioFormatReader_WAV.prototype.__decodeSuccess = function (buffer) {
    // Calculate the length of the parts
    var PickSize = this._BatchLength * buffer.sampleRate;

    this._SampleBudget += (PickSize - Math.ceil(PickSize));

    var PickSize = Math.ceil(PickSize);

    var PickOffset = (buffer.length - PickSize) / 2.0;

    if (PickOffset < 0)
        PickOffset = 0; // This should never happen!
    else
        PickOffset = Math.floor(PickOffset);

    if (this._SampleBudget < -1.0) {
        var Correction = -1.0 * Math.floor(Math.abs(this._SampleBudget));
        this._SampleBudget -= Correction;
        PickSize += Correction;
    }
    else if (this._SampleBudget > 1.0) {
        var Correction = Math.floor(this._SampleBudget);
        this._SampleBudget -= Correction;
        PickSize += Correction;
    }

    // Create a buffer that can hold a single part
    var audioBuffer = this._SoundContext.createBuffer(buffer.numberOfChannels, PickSize, buffer.sampleRate);

    // Fill buffer with the last part of the decoded frame
    for (var i = 0; i < buffer.numberOfChannels; i++)
        audioBuffer.getChannelData(i).set(buffer.getChannelData(i).subarray(PickOffset, PickOffset + PickSize));

    // Push samples into arrray
    this._FloatSamples.push(audioBuffer);

    // Callback to tell that data is ready
    this._DataReadyCallback();
};

// Is called in case the decoding of the samples fails
AudioFormatReader_WAV.prototype.__decodeError = function () {
    this._ErrorCallback();
};


// Used to append two Uint8Array (buffer2 comes BEHIND buffer1)
function appendBuffer (buffer1, buffer2)
{
	var tmp = new Uint8Array(buffer1.length + buffer2.length);
	tmp.set(buffer1, 0);
	tmp.set(buffer2, buffer1.length);
	return tmp;
}
