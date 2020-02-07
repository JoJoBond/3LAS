/*
    OGG audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
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
// WARNING, this is OGG Vorbis and OGG Opus
// Most of the stuff here is not trivial and trying to understand is beyond human.
// There might also be lot of dead code here, so don't wonder.
// Abandon all hope, ye who enter here.
var OGGPageInfo = /** @class */ (function () {
    function OGGPageInfo(data, continuingPage, sampleLength) {
        this.Data = data;
        this.ContinuingPage = continuingPage;
        this.SampleLength = sampleLength;
    }
    return OGGPageInfo;
}());
var DecodeQueueItem = /** @class */ (function () {
    function DecodeQueueItem(data, sampleLengths) {
        this.Data = data;
        this.SampleLengths = sampleLengths;
    }
    return DecodeQueueItem;
}());
var AudioFormatReader_OGG = /** @class */ (function (_super) {
    __extends(AudioFormatReader_OGG, _super);
    function AudioFormatReader_OGG(audio, logger, errorCallback, dataReadyCallback, windowSize) {
        var _this = _super.call(this, audio, logger, errorCallback, dataReadyCallback) || this;
        _this._OnDecodeSuccess = _this.OnDecodeSuccess.bind(_this);
        _this._OnDecodeError = _this.OnDecodeError.bind(_this);
        _this.WindowSize = windowSize;
        _this.FullVorbisHeader = new Uint8Array(0);
        _this.HeaderComplete = false;
        _this.IsOpus = false;
        _this.IsVorbis = false;
        _this.DataBuffer = new Uint8Array(0);
        _this.Pages = new Array();
        _this.Samples = new Array();
        _this.BufferStore = {};
        _this.PageStartIdx = -1;
        _this.PageEndIdx = -1;
        _this.ContinuingPage = false;
        _this.IsHeader = false;
        _this.LastAGPosition = 0;
        _this.PageSampleLength = 0;
        _this.Id = 0;
        _this.LastPushedId = -1;
        return _this;
    }
    // Pushes page data into the buffer
    AudioFormatReader_OGG.prototype.PushData = function (data) {
        // Append data to pagedata buffer
        this.DataBuffer = this.ConcatUint8Array(this.DataBuffer, data);
        // Try to extract pages
        this.ExtractAllPages();
    };
    // Check if there are any samples ready for playback
    AudioFormatReader_OGG.prototype.SamplesAvailable = function () {
        return (this.Samples.length > 0);
    };
    // Returns a bunch of samples for playback and removes the from the array
    AudioFormatReader_OGG.prototype.PopSamples = function () {
        if (this.Samples.length > 0) {
            // Get first bunch of samples, remove said bunch from the array and hand it back to callee
            return this.Samples.shift();
        }
        else
            return null;
    };
    // Used to force page extraction externaly
    AudioFormatReader_OGG.prototype.Poke = function () {
        this.ExtractAllPages();
    };
    // Deletes all pages from the databuffer and page array and all samples from the samplearray
    AudioFormatReader_OGG.prototype.PurgeData = function () {
        this.DataBuffer = new Uint8Array(0);
        this.Pages = new Array();
        this.Samples = new Array();
        this.PageStartIdx = -1;
        this.PageEndIdx = -1;
    };
    // Extracts all currently possible pages
    AudioFormatReader_OGG.prototype.ExtractAllPages = function () {
        // Look for pages
        this.FindPage();
        var _loop_1 = function () {
            // Extract page
            var tmpPage = this_1.ExtractPage();
            // Check if we look at a header
            if (!this_1.IsHeader) {
                // Push page into array
                this_1.Pages.push(tmpPage);
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
                if (!this_1.Pages[this_1.Pages.length - 1].ContinuingPage && this_1.Pages.length >= this_1.WindowSize) {
                    // Sum the bytelengths of the individual pages, also store individual samplelengths in array
                    var bufferlength = 0;
                    var sampleLengths_1 = new Array();
                    for (var i = 0; i < this_1.Pages.length; i++) {
                        bufferlength += this_1.Pages[i].Data.length;
                        sampleLengths_1.push(this_1.Pages[i].SampleLength);
                    }
                    // Create a buffer long enough to hold everything
                    var pagesBuffer = new Uint8Array(this_1.FullVorbisHeader.length + bufferlength);
                    var offset = 0;
                    // Add head to window
                    pagesBuffer.set(this_1.FullVorbisHeader, offset);
                    offset += this_1.FullVorbisHeader.length;
                    // Add the pages to the window
                    for (var i = 0; i < this_1.Pages.length; i++) {
                        pagesBuffer.set(this_1.Pages[i].Data, offset);
                        offset += this_1.Pages[i].Data.length;
                    }
                    // Remove all but the last page from the array
                    this_1.Pages.splice(0, this_1.Pages.length - 1);
                    // Increment Id
                    var id_1 = this_1.Id++;
                    // Push pages to the decoder
                    this_1.Audio.decodeAudioData(pagesBuffer.buffer, (function (decodedData) {
                        var _id = id_1;
                        var _sampleLengths = sampleLengths_1;
                        this._OnDecodeSuccess(decodedData, _id, _sampleLengths);
                    }).bind(this_1), this_1._OnDecodeError);
                }
            }
            else {
                // Add page to header buffer
                this_1.FullVorbisHeader = this_1.ConcatUint8Array(this_1.FullVorbisHeader, tmpPage.Data);
            }
            // Look for pages
            this_1.FindPage();
        };
        var this_1 = this;
        // Repeat as long as we can extract pages
        while (this.CanExtractPage()) {
            _loop_1();
        }
    };
    // Finds page boundries within the data buffer
    AudioFormatReader_OGG.prototype.FindPage = function () {
        // Find page start
        if (this.PageStartIdx < 0) {
            var i = 0;
            // Make sure we don't exceed array bounds
            while ((i + 3) < this.DataBuffer.length) {
                // Look for the ogg capture pattern
                if (this.DataBuffer[i] == 0x4f && this.DataBuffer[i + 1] == 0x67 && this.DataBuffer[i + 2] == 0x67 && this.DataBuffer[i + 3] == 0x53) {
                    // Capture pattern found, set page start
                    this.PageStartIdx = i;
                    break;
                }
                i++;
            }
        }
        // Find page end
        if (this.PageStartIdx >= 0 && this.PageEndIdx < 0) {
            // Check if we have enough data to process the static part of the header
            if ((this.PageStartIdx + 26) < this.DataBuffer.length) {
                // Get header data
                var absolute_granule_position = this.DataBuffer[this.PageStartIdx + 6] | this.DataBuffer[this.PageStartIdx + 7] << 8 | this.DataBuffer[this.PageStartIdx + 8] << 16 | this.DataBuffer[this.PageStartIdx + 9] << 24 |
                    this.DataBuffer[this.PageStartIdx + 10] << 32 | this.DataBuffer[this.PageStartIdx + 11] << 40 | this.DataBuffer[this.PageStartIdx + 12] << 48 | this.DataBuffer[this.PageStartIdx + 13] << 56;
                var page_segments = this.DataBuffer[this.PageStartIdx + 26];
                this.IsHeader = false;
                // Get length of page in samples
                if (this.LastAGPosition > 0)
                    this.PageSampleLength = absolute_granule_position - this.LastAGPosition;
                else
                    this.PageSampleLength = 0;
                // Store total sample length if AGP is not -1
                if (absolute_granule_position !== 0xFFFFFFFFFFFFFFFF)
                    this.LastAGPosition = absolute_granule_position;
                // Check if page is a header candidate
                if (absolute_granule_position === 0x0000000000000000) {
                    var content_start = this.PageStartIdx + 27 + page_segments;
                    // Check if magic number of headers match
                    if (((content_start + 3) < this.DataBuffer.length) && // 'Opus'
                        (this.DataBuffer[content_start] == 0x4F && this.DataBuffer[content_start + 1] == 0x70 &&
                            this.DataBuffer[content_start + 2] == 0x75 && this.DataBuffer[content_start + 3] == 0x73)) {
                        this.IsHeader = true;
                        this.IsOpus = true;
                    }
                    else if (((content_start + 6) < this.DataBuffer.length) && // 'vorbis'
                        (this.DataBuffer[content_start + 1] == 0x76 && this.DataBuffer[content_start + 2] == 0x6f && this.DataBuffer[content_start + 3] == 0x72 &&
                            this.DataBuffer[content_start + 4] == 0x62 && this.DataBuffer[content_start + 5] == 0x69 && this.DataBuffer[content_start + 6] == 0x73)) {
                        this.IsHeader = true;
                        this.IsVorbis = true;
                    }
                }
                // Check if we have enough data to process the segment table
                if ((this.PageStartIdx + 26 + page_segments) < this.DataBuffer.length) {
                    // Sum up segments of the segment table
                    var total_segments_size = 0;
                    for (var i = 0; i < page_segments; i++) {
                        total_segments_size += this.DataBuffer[this.PageStartIdx + 27 + i];
                    }
                    // Check if a package in the page will be continued in the next page
                    this.ContinuingPage = this.DataBuffer[this.PageStartIdx + 26 + page_segments] == 0xFF;
                    if (this.ContinuingPage)
                        console.log("Continued ogg page found, check encoder settings.");
                    // Set end page boundry
                    this.PageEndIdx = this.PageStartIdx + 27 + page_segments + total_segments_size;
                }
            }
        }
    };
    // Checks if there is a page ready to be extracted
    AudioFormatReader_OGG.prototype.CanExtractPage = function () {
        if (this.PageStartIdx < 0 || this.PageEndIdx < 0)
            return false;
        else if (this.PageEndIdx < this.DataBuffer.length)
            return true;
        else
            return false;
    };
    // Extract a single page from the buffer
    AudioFormatReader_OGG.prototype.ExtractPage = function () {
        // Extract page data from buffer
        var pagearray = new Uint8Array(this.DataBuffer.buffer.slice(this.PageStartIdx, this.PageEndIdx));
        // Remove page from buffer
        if ((this.PageEndIdx + 1) < this.DataBuffer.length)
            this.DataBuffer = new Uint8Array(this.DataBuffer.buffer.slice(this.PageEndIdx));
        else
            this.DataBuffer = new Uint8Array(0);
        // Reset Start/End indices
        this.PageStartIdx = 0;
        this.PageEndIdx = -1;
        return new OGGPageInfo(pagearray, this.ContinuingPage, this.PageSampleLength);
    };
    // Is called if the decoding of the pages succeeded
    AudioFormatReader_OGG.prototype.OnDecodeSuccess = function (decodedData, id, sampleLengths) {
        var audioBuffer;
        if (this.IsOpus) {
            // For opus we need to make some corrections due to the fixed overlapping
            // Calculate size of the part we are interested in		
            var partlength = Math.ceil((sampleLengths[sampleLengths.length - 1]) * decodedData.sampleRate / 48000);
            if (partlength <= 0) {
                this.LastPushedId++;
                return;
            }
            // Create a buffer that can hold the part
            audioBuffer = this.Audio.createBuffer(decodedData.numberOfChannels, partlength, decodedData.sampleRate);
            // Fill buffer with the last part of the decoded pages
            for (var i = 0; i < decodedData.numberOfChannels; i++)
                audioBuffer.getChannelData(i).set(decodedData.getChannelData(i).subarray(decodedData.length - partlength, decodedData.length));
        }
        else {
            // For vorbis we just take the data
            audioBuffer = decodedData;
        }
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
    // Is called in case the decoding of the pages fails
    AudioFormatReader_OGG.prototype.OnDecodeError = function (_error) {
        this.ErrorCallback();
    };
    return AudioFormatReader_OGG;
}(AudioFormatReader));
//# sourceMappingURL=3las.formatreader.ogg.js.map