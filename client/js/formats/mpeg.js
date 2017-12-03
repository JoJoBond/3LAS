/*
	MPEG-Audio-Format-Reader is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

function AudioFormatReader_MPEG(ErrorCallback, DataReadyCallback)
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
        throw new Error('AudioFormatReader_MPEG: Browser does not support "AudioContext".');	


	// Internal variables:
	// ===================
	
	// Data buffer for "raw" framedata
	this._DataBuffer = new Uint8Array(0);
	
	// Array for individual frames
	this._Frames = new Array();
	
	// Array for individual bunches of samples
	this._Samples = new Array();
	
	// Indices that mark frame borders
	this._FrameStartIdx = -1;
	this._FrameEndIdx = -1;
	
	this._FrameSamples = 0;
	this._FrameSampleRate = 0;
	
	this._TimeBudget = 0;
}


// Settings:
// =========

// Adds a minimal ID3v2 tag to each frame
AudioFormatReader_MPEG.prototype._AddID3Tag = true;

// Number of frames to decode together (keyword: byte-reservoir)
// For live streaming this means that you can push the minimum number of frames
// on connection to the client to reduce waiting time without effecting the latency.
if (isAndroid && isFirefox)
    AudioFormatReader_MPEG.prototype._WindowSize = 50;
else if (isAndroid && isNativeChrome)
    AudioFormatReader_MPEG.prototype._WindowSize = 30;
else if (isAndroid)
    AudioFormatReader_MPEG.prototype._WindowSize = 30;
else
    AudioFormatReader_MPEG.prototype._WindowSize = 25;

// Number of frames to use from one decoded window
if (isAndroid && isFirefox)
    AudioFormatReader_MPEG.prototype._UseFrames = 40;
else if (isAndroid && isNativeChrome)
    AudioFormatReader_MPEG.prototype._UseFrames = 20;
else if (isAndroid)
    AudioFormatReader_MPEG.prototype._UseFrames = 5;
else
    AudioFormatReader_MPEG.prototype._UseFrames = 2;


// Constants:
// ==========

// MPEG versions - use [version]
AudioFormatReader_MPEG.prototype._mpeg_versions = new Array(25, 0, 2, 1);

// Layers - use [layer]
AudioFormatReader_MPEG.prototype._mpeg_layers = new Array(0, 3, 2, 1);

// Bitrates - use [version][layer][bitrate]
AudioFormatReader_MPEG.prototype._mpeg_bitrates = new Array(
    new Array( // Version 2.5
        new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // Reserved
        new Array(0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0), // Layer 3
        new Array(0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0), // Layer 2
        new Array(0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0)  // Layer 1
    ),
    new Array( // Reserved
        new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // Invalid
        new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // Invalid
        new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // Invalid
        new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)  // Invalid
    ),
    new Array( // Version 2
        new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // Reserved
        new Array(0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0), // Layer 3
        new Array(0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0), // Layer 2
        new Array(0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0)  // Layer 1
    ),
    new Array( // Version 1
        new Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // Reserved
        new Array(0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0), // Layer 3
        new Array(0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0), // Layer 2
        new Array(0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0) // Layer 1
    )
);

// Sample rates - use [version][srate]
AudioFormatReader_MPEG.prototype._mpeg_srates = new Array(
    new Array(11025, 12000, 8000, 0), // MPEG 2.5
    new Array(0, 0, 0, 0), // Reserved
    new Array(22050, 24000, 16000, 0), // MPEG 2
    new Array(44100, 48000, 32000, 0)  // MPEG 1
);

// Samples per frame - use [version][layer]
AudioFormatReader_MPEG.prototype._mpeg_frame_samples = new Array(
    //             Rsvd     3     2     1  < Layer  v Version
    new Array(0, 576, 1152, 384), //       2.5
    new Array(0, 0, 0, 0), //       Reserved
    new Array(0, 576, 1152, 384), //       2
    new Array(0, 1152, 1152, 384)  //       1
);

// Slot size (MPEG unit of measurement) - use [layer]
AudioFormatReader_MPEG.prototype._mpeg_slot_size = new Array(0, 1, 1, 4); // Rsvd, 3, 2, 1

// Minimalistic ID3v2 tag
if (AudioFormatReader_MPEG.prototype._AddID3Tag) {
    AudioFormatReader_MPEG.prototype._ID3v2Tag = new Uint8Array(new Array(
        0x49, 0x44, 0x33,       // File identifier: "ID3"
        0x03, 0x00,             // Version 2.3
        0x00,                   // Flags: no unsynchronisation, no extended header, no experimental indicator
        0x00, 0x00, 0x00, 0x0D, // Size of the (tag-)frames, extended header and padding
        0x54, 0x49, 0x54, 0x32, // Title frame: "TIT2"
        0x00, 0x00, 0x00, 0x02, // Size of the frame data
        0x00, 0x00,				// Frame Flags
        0x00, 0x20, 0x00		// Frame data (space character) and padding 
    ));
}


// Pubic methods (external functions):
// ===================================

// Pushes frame data into the buffer
AudioFormatReader_MPEG.prototype.PushData = function (data) {
    // Append data to framedata buffer
    this._DataBuffer = appendBuffer(this._DataBuffer, new Uint8Array(data));
    // Try to extract frames
    this._ExtractAllFrames();
};

// Check if there are any samples ready for playback
AudioFormatReader_MPEG.prototype.SamplesAvailable = function () {
    return (this._Samples.length > 0);
};

// Returns a bunch of samples for playback and removes the from the array
AudioFormatReader_MPEG.prototype.PopSamples = function () {
    if (this._Samples.length > 0) {
        // Get first bunch of samples
        var audioBuffer = this._Samples[0];
        // Remove said bunch from the array
        this._Samples.shift();
        // Hand it back to callee
        return audioBuffer;
    }
    else
        return null;
};

// Used to force frame extraction externaly
AudioFormatReader_MPEG.prototype.Poke = function () {
    this._ExtractAllFrames();
};

// Deletes all frames from the databuffer and framearray and all samples from the samplearray
AudioFormatReader_MPEG.prototype.PurgeData = function () {
    this._DataBuffer = new Uint8Array(0);

    this._Frames = new Array();

    this._Samples = new Array();

    this._FrameStartIdx = -1;
    this._FrameEndIdx = -1;
};


// Private methods (Internal functions):
// =====================================

// Extracts all currently possible frames
AudioFormatReader_MPEG.prototype._ExtractAllFrames = function () {
    // Look for frames
    this._FindFrame();
    // Repeat as long as we can extract frames
    while (this._CanExtractFrame()) {
        // Extract frame and push into array
        this._Frames.push(this._ExtractFrame());

        // Check if we have enough frames to decode
        if (this._Frames.length >= this._WindowSize) {
            var SampleRates = new Array();
            var SampleCount = new Array();

            // Sum the lengths of the individuall frames
            var bufferlength = 0;
            for (var i = 0; i < this._WindowSize; i++) {
                SampleRates.push(this._Frames[i].rate);
                SampleCount.push(this._Frames[i].samples);
                bufferlength += this._Frames[i].data.length;
            }

            // If needed, add some space for the ID3v2 tag
            if (this._AddID3Tag)
                bufferlength += this._ID3v2Tag.length;

            // Create a buffer long enough to hold everything
            var windowbuffer = new Uint8Array(bufferlength);

            var offset = 0;

            // If needed, add ID3v2 tag to beginning of buffer
            if (this._AddID3Tag) {
                windowbuffer.set(this._ID3v2Tag, offset);
                offset += this._ID3v2Tag.length;
            }

            // Add the frames to the window
            for (var i = 0; i < this._WindowSize; i++) {
                windowbuffer.set(this._Frames[i].data, offset);
                offset += this._Frames[i].data.length;
            }

            // Remove the used frames from the array
            for (var i = 0; i < (this._UseFrames - 1); i++)
                this._Frames.shift();

            // Push window to the decoder
            this._SoundContext.decodeAudioData(
                windowbuffer.buffer,
                (function (buffer) {
                    var srates = SampleRates;
                    var scount = SampleCount;
                    (this.__decodeSuccess.bind(this))(buffer, srates, scount);
                }).bind(this),
                this.__decodeError.bind(this)
            );
        }

        // Look for frames
        this._FindFrame();
    }
};

// Finds frame boundries within the data buffer
AudioFormatReader_MPEG.prototype._FindFrame = function () {
    // Find frame start
    if (this._FrameStartIdx < 0) {
        var i = 0;
        // Make sure we don't exceed array bounds
        while ((i + 1) < this._DataBuffer.length) {
            // Look for MPEG sync word
            if (this._DataBuffer[i] == 0xFF && (this._DataBuffer[i + 1] & 0xE0) == 0xE0) {
                // Sync found, set frame start
                this._FrameStartIdx = i;
                break;
            }
            i++;
        }
    }

    // Find frame end
    if (this._FrameStartIdx >= 0 && this._FrameEndIdx < 0) {
        // Check if we have enough data to process the header
        if ((this._FrameStartIdx + 2) < this._DataBuffer.length) {
            // Get header data

            // Version index
            var ver = (this._DataBuffer[this._FrameStartIdx + 1] & 0x18) >>> 3;
            // Layer index
            var lyr = (this._DataBuffer[this._FrameStartIdx + 1] & 0x06) >>> 1;
            // Padding? 0/1
            var pad = (this._DataBuffer[this._FrameStartIdx + 2] & 0x02) >>> 1;
            // Bitrate index
            var brx = (this._DataBuffer[this._FrameStartIdx + 2] & 0xf0) >>> 4;
            // SampRate index
            var srx = (this._DataBuffer[this._FrameStartIdx + 2] & 0x0c) >>> 2;

            // Resolve flags to real values
            var bitrate = this._mpeg_bitrates[ver][lyr][brx] * 1000;
            var samprate = this._mpeg_srates[ver][srx];
            var samples = this._mpeg_frame_samples[ver][lyr];
            var slot_size = this._mpeg_slot_size[lyr];

            // In-between calculations
            var bps = samples / 8.0;
            var fsize = ((bps * bitrate) / samprate) + ((pad == 1) ? slot_size : 0);

            // Truncate to integer
            var FrameSize = Math.floor(fsize)

            // Store number of samples and samplerate for frame
            this._FrameSamples = samples;
            this._FrameSampleRate = samprate;

            // Set end frame boundry
            this._FrameEndIdx = this._FrameStartIdx + FrameSize;
        }
    }
};

// Checks if there is a frame ready to be extracted
AudioFormatReader_MPEG.prototype._CanExtractFrame = function () {
    if (this._FrameStartIdx < 0 || this._FrameEndIdx < 0)
        return false;
    else if (this._FrameEndIdx < this._DataBuffer.length)
        return true;
    else
        return false;
};

// Extract a single frame from the buffer
AudioFormatReader_MPEG.prototype._ExtractFrame = function () {
    // Extract frame data from buffer
    var framearray = this._DataBuffer.buffer.slice(this._FrameStartIdx, this._FrameEndIdx);

    // Remove frame from buffer
    if ((this._FrameEndIdx + 1) < this._DataBuffer.length)
        this._DataBuffer = new Uint8Array(this._DataBuffer.buffer.slice(this._FrameEndIdx));
    else
        this._DataBuffer = new Uint8Array(0);

    // Reset Start/End indices
    this._FrameStartIdx = 0;
    this._FrameEndIdx = -1;

    return { 'data': new Uint8Array(framearray), 'samples': this._FrameSamples, 'rate': this._FrameSampleRate };
};


// Internal callback functions
// ===========================

// Is called if the decoding of the window succeeded
AudioFormatReader_MPEG.prototype.__decodeSuccess = function (buffer, SampleRates, SampleCount) {
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

    var CalcTotalPlayTime = 0;
    CalcTotalPlayTime += SampleCount[0] / SampleRates[0] / 2.0;
    for (var i = 1; i < (SampleCount.length - 1); i++)
        CalcTotalPlayTime += SampleCount[i] / SampleRates[i];
    CalcTotalPlayTime += SampleCount[SampleCount.length - 1] / SampleRates[SampleCount.length - 1] / 2.0;

    // Calculate the expected number of samples
    var CalcSampleCount = CalcTotalPlayTime * buffer.sampleRate;

    //console.log(CalcTotalPlayTime, buffer.duration);

    var DecoderOffset;

    // Check if we got the expected number of samples
    if (CalcTotalPlayTime > buffer.duration) {
        // We got less samples than expect, we suspect that they were truncated equally at start and end.
        var OffsetTime = (CalcTotalPlayTime - buffer.duration) / 2.0;

        DecoderOffset = Math.ceil(OffsetTime * buffer.sampleRate);
    }
    else if (CalcTotalPlayTime < buffer.duration) {
        // We got more samples than expect, we suspect that zeros were added equally at start and end.
        var OffsetTime = (buffer.duration - CalcTotalPlayTime) / 2.0;

        DecoderOffset = -1.0 * Math.ceil(OffsetTime * buffer.sampleRate);
    }
    else {
        // We got the expected number of samples, no adaption needed
        DecoderOffset = 0;
    }

    // Note:
    // =====
    //	mp3 frames have an overlap of [granule size] so we can't use the first or last [granule size] samples
    // [granule size] is equal to half of a [frame size] in samples (using the mp3's sample rate)

    // Calculate the size and offset of the frame to extract
    //var OffsetRight = Math.ceil(Math.ceil(SampleCount[SampleCount.length - 1] / 2 * buffer.sampleRate / CalcSampleRate) * this._OffsetRightFactor);

    var ExtractTimeSum = 0;

    ExtractTimeSum += SampleCount[SampleCount.length - 1] / SampleRates[SampleCount.length - 1] / 2.0;

    for (var i = 1; i < (this._UseFrames - 1); i++)
        ExtractTimeSum += SampleCount[SampleCount.length - 1 - i] / SampleRates[SampleCount.length - 1 - i];

    ExtractTimeSum += SampleCount[SampleCount.length - this._UseFrames] / SampleRates[SampleCount.length - this._UseFrames] / 2.0

    var ExtractSampleNum = ExtractTimeSum * buffer.sampleRate;

    this._TimeBudget += (ExtractSampleNum - Math.floor(ExtractSampleNum)) / buffer.sampleRate;

    var BudgetSamples = 0;
    if (this._TimeBudget * buffer.sampleRate > 1.0) {
        BudgetSamples = Math.floor(this._TimeBudget * buffer.sampleRate);
        this._TimeBudget -= BudgetSamples / buffer.sampleRate;
    }
    else if (this._TimeBudget * buffer.sampleRate < -1.0) {
        BudgetSamples = -1.0 * Math.floor(Math.abs(this._TimeBudget * buffer.sampleRate));
        this._TimeBudget -= BudgetSamples / buffer.sampleRate;
    }

    ExtractSampleNum = Math.floor(ExtractSampleNum) + BudgetSamples;

    var OffsetRight = 0; //Math.ceil((SampleCount[SampleCount.length - 1] / SampleRates[SampleCount.length - 1] / 2.0) * buffer.sampleRate * this._OffsetRightFactor);

    // Create a buffer that can hold the frame to extract
    var audioBuffer = this._SoundContext.createBuffer(buffer.numberOfChannels, ExtractSampleNum, buffer.sampleRate);

    // Fill buffer with the last part of the decoded frame leave out last granule
    for (var i = 0; i < buffer.numberOfChannels; i++)
        audioBuffer.getChannelData(i).set(buffer.getChannelData(i).subarray(
            buffer.length - OffsetRight + DecoderOffset - ExtractSampleNum,
            buffer.length - OffsetRight + DecoderOffset
        ));

    // Push samples into array

    this._Samples.push(audioBuffer);
    //this._Samples.push(buffer);

    // Callback to tell that data is ready
    this._DataReadyCallback();
};

// Is called in case the decoding of the window fails
AudioFormatReader_MPEG.prototype.__decodeError = function () {
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
