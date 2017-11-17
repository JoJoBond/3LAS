/*
	OGG-Audio-Format-Reader is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

// WARNING, this is OGG Vorbis and OGG Opus
// Most of the stuff here is not trivial and trying to understand is beyond human.
// There might also be lot of dead code here, so don't wonder.
// Abandon all hope, ye who enter here.

function AudioFormatReader_OGG (ErrorCallback, DataReadyCallback)
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
        throw new Error('AudioFormatReader_OGG: Browser does not support "AudioContext".');


	// Internal variables:
	// ===================

    // Decoding queue
    this._isDecoding = false;
    this._DecodeQueue = new Array();
	
	// Stores the complete vorbis/opus header
	this._FullVorbisHeader = new Uint8Array(0);
	this._HeaderComplete = false;
	this._IsOpus = false;
	this._IsVorbis = false;
		
	// Data buffer for "raw" pagedata
	this._DataBuffer = new Uint8Array(0);
	
	// Array for individual pages
	this._Pages = new Array();
	
	// Array for individual bunches of samples
	this._Samples = new Array();
	
	// Page related variables
	this._PageStartIdx = -1;
	this._PageEndIdx = -1;
	this._ContinuingPage = false;
	this._MightBeHeader = false;
	this._LastAGPosition = 0;
	this._PageSampleLength = 0;
}


// Constants:
// ==========

// Number of pages to decode together
// For vorbis I do not recommend to change this, EVER!
AudioFormatReader_OGG.prototype._WindowSize = 2;


// Pubic methods (external functions):
// ===================================

// Pushes page data into the buffer
AudioFormatReader_OGG.prototype.PushData = function (data) {
    // Append data to pagedata buffer
    this._DataBuffer = appendBuffer(this._DataBuffer, new Uint8Array(data));
    // Try to extract pages
    this._ExtractAllPages();
};

// Check if there are any samples ready for playback
AudioFormatReader_OGG.prototype.SamplesAvailable = function () {
    return (this._Samples.length > 0);
};

// Returns a bunch of samples for playback and removes the from the array
AudioFormatReader_OGG.prototype.PopSamples = function () {
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

// Used to force page extraction externaly
AudioFormatReader_OGG.prototype.Poke = function () {
    this._ExtractAllPages();
};

// Deletes all pages from the databuffer and page array and all samples from the samplearray
AudioFormatReader_OGG.prototype.PurgeData = function () {
    this._DataBuffer = new Uint8Array(0);

    this._Pages = new Array();
    this._Samples = new Array();

    this._PageStartIdx = -1;
    this._PageEndIdx = -1;
};


// Private methods (Internal functions):
// =====================================

// Extracts all currently possible pages
AudioFormatReader_OGG.prototype._ExtractAllPages = function () {
    // Look for pages
    this._FindPage();
    // Repeat as long as we can extract pages
    while (this._CanExtractPage()) {
        // Extract page
        var tmpPage = this._ExtractPage();

        // Check if we look at a header
        if (!this._IsHeader) {
            // Push page into array
            this._Pages.push(tmpPage);

            // Note:
            // =====
            // Vorbis and Opus have an overlapping between segments.
            // To compensate for that, we decode 3 segments together, 
            // but only use the samples from the middle one.
            // This adds a delay of [segment length] samples to the stream.
            // The segment length can be up to 8192 samples for Vorbis (!) (170ms @ 48kHz)

            // TODO: Depending on if Opus or Vorbis is used, minimize the number of unused samples
            //       by using the segment length in the ogg header (for vorbis)
            //       or by using a fixed offset (for opus)
            //       See these documents for reference:
            //       - Vorbis overlap: http://www.xiph.org/vorbis/doc/Vorbis_I_spec.pdf
            //                         On Page 11
            //       - Opus overlap:   http://jmvalin.ca/slides/opus_celt_aes135.pdf
            //                         On Page 6 (for CELT)
            //                         Find some source if SILK has an overlap aswell...
            //                         (Maybe here: www.opus-codec.org/docs/draft-ietf-codec-opus-00.html ??)

            // Check if last pushed page is not a continuing page
            if (this._Pages[this._Pages.length - 1]["continuing"] === false && this._Pages.length >= this._WindowSize) {
                // Sum the bytelengths of the individuall pages, also store individual samplelengths in array
                var bufferlength = 0;
                var sample_lengths = new Array();
                for (var i = 0; i < this._Pages.length; i++) {
                    bufferlength += this._Pages[i]["data"].length;
                    sample_lengths.push(this._Pages[i]["samplelength"]);
                }

                // Create a buffer long enough to hold everything
                var pagesbuffer = new Uint8Array(this._FullVorbisHeader.length + bufferlength);

                var offset = 0;

                // Add head to window
                pagesbuffer.set(this._FullVorbisHeader, offset);
                offset += this._FullVorbisHeader.length;

                // Add the pages to the window
                for (var i = 0; i < this._Pages.length; i++) {
                    pagesbuffer.set(this._Pages[i]["data"], offset);
                    offset += this._Pages[i]["data"].length;
                }

                // Remove first page from the array
                this._Pages.shift();

                if (this._isDecoding) {
                    this._DecodeQueue.push({ "data": pagesbuffer.buffer, "lengths": sample_lengths });
                }
                else {
                    this._isDecoding = true;

                    // Push pages to the decoder
                    this._SoundContext.decodeAudioData(pagesbuffer.buffer,
                        (function (buffer) { this.__decodeSuccess(buffer, sample_lengths).bind(this); }).bind(this),
                        this.__decodeError.bind(this)
                    );
                }
            }
        }
        else {
            // Add page to header buffer
            this._FullVorbisHeader = appendBuffer(this._FullVorbisHeader, tmpPage["data"]);
        }
        // Look for pages
        this._FindPage();
    }
};

AudioFormatReader_OGG.prototype._DecodeFromQueue = function () {
    if (this._DecodeQueue.length > 0) {
        this._isDecoding = true;
        var sample_lengths = this._DecodeQueue[0]["lengths"];
        var pagedata = this._DecodeQueue[0]["data"];

        // Push pages to the decoder
        this._SoundContext.decodeAudioData(pagedata,
            (function (buffer) { this.__decodeSuccess(buffer, sample_lengths).bind(this); }).bind(this),
            this.__decodeError.bind(this)
        );
        this._DecodeQueue.shift();
    }
};

// Finds page boundries within the data buffer
AudioFormatReader_OGG.prototype._FindPage = function () {
    // Find page start
    if (this._PageStartIdx < 0) {
        var i = 0;
        // Make sure we don't exceed array bounds
        while ((i + 3) < this._DataBuffer.length) {
            // Look for the ogg capture pattern
            if (this._DataBuffer[i] == 0x4f && this._DataBuffer[i + 1] == 0x67 && this._DataBuffer[i + 2] == 0x67 && this._DataBuffer[i + 3] == 0x53) {
                // Capture pattern found, set page start
                this._PageStartIdx = i;
                break;
            }
            i++;
        }
    }

    // Find page end
    if (this._PageStartIdx >= 0 && this._PageEndIdx < 0) {
        // Check if we have enough data to process the static part of the header
        if ((this._PageStartIdx + 26) < this._DataBuffer.length) {
            // Get header data

            var absolute_granule_position = this._DataBuffer[this._PageStartIdx + 6] | this._DataBuffer[this._PageStartIdx + 7] << 8 | this._DataBuffer[this._PageStartIdx + 8] << 16 | this._DataBuffer[this._PageStartIdx + 9] << 24 |
                this._DataBuffer[this._PageStartIdx + 10] << 32 | this._DataBuffer[this._PageStartIdx + 11] << 40 | this._DataBuffer[this._PageStartIdx + 12] << 48 | this._DataBuffer[this._PageStartIdx + 13] << 56;

            var page_segments = this._DataBuffer[this._PageStartIdx + 26];

            this._IsHeader = false;

            // Get length of page in samples
            if (this._LastAGPosition > 0)
                this._PageSampleLength = absolute_granule_position - this._LastAGPosition;
            else
                this._PageSampleLength = 0;

            // Store total sample length if AGP is not -1
            if (absolute_granule_position !== 0xFFFFFFFFFFFFFFFF)
                this._LastAGPosition = absolute_granule_position;

            // Check if page is a header candidate
            if (absolute_granule_position === 0x0000000000000000) {
                var content_start = this._PageStartIdx + 27 + page_segments;

                // Check if magic number of headers match

                if (((content_start + 3) < this._DataBuffer.length) && // 'Opus'
                    (this._DataBuffer[content_start] == 0x4F && this._DataBuffer[content_start + 1] == 0x70 &&
                        this._DataBuffer[content_start + 2] == 0x75 && this._DataBuffer[content_start + 3] == 0x73)) {
                    this._IsHeader = true;
                    this._IsOpus = true;
                }
                else if (((content_start + 6) < this._DataBuffer.length) && // 'vorbis'
                    (this._DataBuffer[content_start + 1] == 0x76 && this._DataBuffer[content_start + 2] == 0x6f && this._DataBuffer[content_start + 3] == 0x72 &&
                        this._DataBuffer[content_start + 4] == 0x62 && this._DataBuffer[content_start + 5] == 0x69 && this._DataBuffer[content_start + 6] == 0x73)) {
                    this._IsHeader = true;
                    this._IsVorbis = true;
                }
            }

            // Check if we have enough data to process the segment table
            if ((this._PageStartIdx + 26 + page_segments) < this._DataBuffer.length) {
                // Sum up segments of the segment table
                var total_segments_size = 0;
                for (var i = 0; i < page_segments; i++) {
                    total_segments_size += this._DataBuffer[this._PageStartIdx + 27 + i];
                }

                // Check if a package in the page will be continued in the next page
                this._ContinuingPage = this._DataBuffer[this._PageStartIdx + 26 + page_segments] == 0xFF;
                if (this._ContinuingPage)
                    console.log("Continued ogg page found, check encoder settings.");

                // Set end page boundry
                this._PageEndIdx = this._PageStartIdx + 27 + page_segments + total_segments_size;
            }
        }
    }
};

// Checks if there is a page ready to be extracted
AudioFormatReader_OGG.prototype._CanExtractPage = function () {
    if (this._PageStartIdx < 0 || this._PageEndIdx < 0)
        return false;
    else if (this._PageEndIdx < this._DataBuffer.length)
        return true;
    else
        return false;
};

// Extract a single page from the buffer
AudioFormatReader_OGG.prototype._ExtractPage = function () {
    // Extract page data from buffer
    var pagearray = new Uint8Array(this._DataBuffer.buffer.slice(this._PageStartIdx, this._PageEndIdx));

    // Remove page from buffer
    if ((this._PageEndIdx + 1) < this._DataBuffer.length)
        this._DataBuffer = new Uint8Array(this._DataBuffer.buffer.slice(this._PageEndIdx));
    else
        this._DataBuffer = new Uint8Array(0);

    // Reset Start/End indices
    this._PageStartIdx = 0;
    this._PageEndIdx = -1;

    return { "data": pagearray, "continuing": this._ContinuingPage, "samplelength": this._PageSampleLength };
};


// Internal callback functions
// ===========================

// Is called if the decoding of the pages succeeded
AudioFormatReader_OGG.prototype.__decodeSuccess = function (buffer, sample_lengths) {
    // For opus we need to make some corrections due to the fixed overlapping
    if (this._IsOpus) {
        // Calculate size of the part we are interested in		
        var partlength = Math.ceil((sample_lengths[sample_lengths.length - 1]) * buffer.sampleRate / 48000);

        // Create a buffer that can hold the part
        var audioBuffer = this._SoundContext.createBuffer(buffer.numberOfChannels, partlength, buffer.sampleRate);

        // Fill buffer with the last part of the decoded pages
        for (var i = 0; i < buffer.numberOfChannels; i++)
            audioBuffer.getChannelData(i).set(buffer.getChannelData(i).subarray(buffer.length - partlength, buffer.length));

        // Push samples into arrray
        this._Samples.push(audioBuffer);
    }
    else {
        // Push samples into arrray
        this._Samples.push(buffer);
    }

    // Callback to tell that data is ready
    this._DataReadyCallback();

    // Check if there was data to decode meanwhile
    this._isDecoding = false;
    this._DecodeFromQueue();
};

// Is called in case the decoding of the pages fails
AudioFormatReader_OGG.prototype.__decodeError = function () {
    this._ErrorCallback();
    this._isDecoding = false;
    this._DecodeFromQueue();
};


// Used to append two Uint8Array (buffer2 comes BEHIND buffer1)
function appendBuffer (buffer1, buffer2)
{
	var tmp = new Uint8Array(buffer1.length + buffer2.length);
	tmp.set(buffer1, 0);
	tmp.set(buffer2, buffer1.length);
	return tmp;
}
