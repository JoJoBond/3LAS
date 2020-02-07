/*
	OGG audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

// WARNING, this is OGG Vorbis and OGG Opus
// Most of the stuff here is not trivial and trying to understand is beyond human.
// There might also be lot of dead code here, so don't wonder.
// Abandon all hope, ye who enter here.

class OGGPageInfo {
    public readonly Data: Uint8Array;
    public readonly ContinuingPage: boolean;
    public readonly SampleLength: number;

    constructor(data: Uint8Array, continuingPage: boolean, sampleLength: number) {
        this.Data = data;
        this.ContinuingPage = continuingPage;
        this.SampleLength = sampleLength;
    }
}

class DecodeQueueItem {
    public readonly Data: ArrayBuffer;
    public readonly SampleLengths: Array<number>;

    constructor(data: ArrayBuffer, sampleLengths: Array<number>) {
        this.Data = data;
        this.SampleLengths = sampleLengths;
    }
}

class AudioFormatReader_OGG extends AudioFormatReader implements IAudioFormatReader {
    private readonly WindowSize: number;

	// Stores the complete vorbis/opus header
	private FullVorbisHeader: Uint8Array;
	private HeaderComplete: boolean;
	private IsOpus: boolean;
	private IsVorbis: boolean;
		
	// Data buffer for "raw" pagedata
	private DataBuffer: Uint8Array;
	
	// Array for individual pages
	private Pages: Array<OGGPageInfo>;
	
	// Array for individual bunches of samples
	private Samples: Array<AudioBuffer>;
	
    // Storage for individual bunches of decoded samples that where decoded out of order
    private BufferStore: Record<number, AudioBuffer>;
    
	// Page related variables
	private PageStartIdx: number;
	private PageEndIdx: number;
	private ContinuingPage: boolean;
	private IsHeader: boolean;
	private LastAGPosition: number;
	private PageSampleLength: number;

    // Unique ID for decoded buffers
    private Id: number;

    // ID of the last inserted decoded samples buffer
    private LastPushedId: number;

    constructor(audio: AudioContext, logger: Logging, errorCallback: () => void, dataReadyCallback: () => void, windowSize: number)
    {
        super(audio, logger, errorCallback, dataReadyCallback);

        this._OnDecodeSuccess = this.OnDecodeSuccess.bind(this);
        this._OnDecodeError = this.OnDecodeError.bind(this);

        this.WindowSize = windowSize;

        this.FullVorbisHeader = new Uint8Array(0);
        this.HeaderComplete = false;
        this.IsOpus = false;
        this.IsVorbis = false;
        this.DataBuffer = new Uint8Array(0);
        this.Pages = new Array();
        this.Samples = new Array();
        this.BufferStore = {};
        this.PageStartIdx = -1;
        this.PageEndIdx = -1;
        this.ContinuingPage = false;
        this.IsHeader = false;
        this.LastAGPosition = 0;
        this.PageSampleLength = 0;
        this.Id = 0;
        this.LastPushedId = -1;
    }

    // Pushes page data into the buffer
    public PushData (data: Uint8Array): void {
        // Append data to pagedata buffer
        this.DataBuffer = this.ConcatUint8Array(this.DataBuffer, data);

        // Try to extract pages
        this.ExtractAllPages();
    }

    // Check if there are any samples ready for playback
    public SamplesAvailable(): boolean {
        return (this.Samples.length > 0);
    }

    // Returns a bunch of samples for playback and removes the from the array
    public PopSamples(): AudioBuffer {
        if (this.Samples.length > 0) {
            // Get first bunch of samples, remove said bunch from the array and hand it back to callee
            return this.Samples.shift();
        }
        else
            return null;
    }

    // Used to force page extraction externaly
    public Poke(): void {
        this.ExtractAllPages();
    }

    // Deletes all pages from the databuffer and page array and all samples from the samplearray
    public PurgeData(): void {
        this.DataBuffer = new Uint8Array(0);

        this.Pages = new Array();
        this.Samples = new Array();

        this.PageStartIdx = -1;
        this.PageEndIdx = -1;
    }

    // Extracts all currently possible pages
    private ExtractAllPages(): void {
        // Look for pages
        this.FindPage();
        // Repeat as long as we can extract pages
        while (this.CanExtractPage()) {
            // Extract page
            let tmpPage: OGGPageInfo = this.ExtractPage();

            // Check if we look at a header
            if (!this.IsHeader) {
                // Push page into array
                this.Pages.push(tmpPage);

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
                if (!this.Pages[this.Pages.length - 1].ContinuingPage && this.Pages.length >= this.WindowSize) {
                    // Sum the bytelengths of the individual pages, also store individual samplelengths in array
                    let bufferlength: number = 0;
                    let sampleLengths: Array<number> = new Array();
                    for (let i: number = 0; i < this.Pages.length; i++) {
                        bufferlength += this.Pages[i].Data.length;
                        sampleLengths.push(this.Pages[i].SampleLength);
                    }

                    // Create a buffer long enough to hold everything
                    let pagesBuffer: Uint8Array = new Uint8Array(this.FullVorbisHeader.length + bufferlength);

                    let offset: number = 0;

                    // Add head to window
                    pagesBuffer.set(this.FullVorbisHeader, offset);
                    offset += this.FullVorbisHeader.length;

                    // Add the pages to the window
                    for (let i: number = 0; i < this.Pages.length; i++) {
                        pagesBuffer.set(this.Pages[i].Data, offset);
                        offset += this.Pages[i].Data.length;
                    }

                    // Remove all but the last page from the array
                    this.Pages.splice(0, this.Pages.length - 1);

                    // Increment Id
                    let id = this.Id++;

                    // Push pages to the decoder
                    this.Audio.decodeAudioData(pagesBuffer.buffer,
                        (function (decodedData: AudioBuffer) { 
                            let _id: number = id;
                            let _sampleLengths: Array<number> = sampleLengths;
                            this._OnDecodeSuccess(decodedData, _id, _sampleLengths); 
                        }).bind(this),
                        this._OnDecodeError
                    );
                }
            }
            else {
                // Add page to header buffer
                this.FullVorbisHeader = this.ConcatUint8Array(this.FullVorbisHeader, tmpPage.Data);
            }
            // Look for pages
            this.FindPage();
        }
    }

    // Finds page boundries within the data buffer
    private FindPage(): void {
        // Find page start
        if (this.PageStartIdx < 0) {
            let i: number = 0;
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

                let absolute_granule_position: number = this.DataBuffer[this.PageStartIdx + 6] | this.DataBuffer[this.PageStartIdx + 7] << 8 | this.DataBuffer[this.PageStartIdx + 8] << 16 | this.DataBuffer[this.PageStartIdx + 9] << 24 |
                    this.DataBuffer[this.PageStartIdx + 10] << 32 | this.DataBuffer[this.PageStartIdx + 11] << 40 | this.DataBuffer[this.PageStartIdx + 12] << 48 | this.DataBuffer[this.PageStartIdx + 13] << 56;

                let page_segments: number = this.DataBuffer[this.PageStartIdx + 26];

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
                    let content_start: number = this.PageStartIdx + 27 + page_segments;

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
                    let total_segments_size: number = 0;
                    for (let i: number = 0; i < page_segments; i++) {
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
    }

    // Checks if there is a page ready to be extracted
    private CanExtractPage(): boolean {
        if (this.PageStartIdx < 0 || this.PageEndIdx < 0)
            return false;
        else if (this.PageEndIdx < this.DataBuffer.length)
            return true;
        else
            return false;
    }

    // Extract a single page from the buffer
    private ExtractPage(): OGGPageInfo {
        // Extract page data from buffer
        let pagearray: Uint8Array = new Uint8Array(this.DataBuffer.buffer.slice(this.PageStartIdx, this.PageEndIdx));

        // Remove page from buffer
        if ((this.PageEndIdx + 1) < this.DataBuffer.length)
            this.DataBuffer = new Uint8Array(this.DataBuffer.buffer.slice(this.PageEndIdx));
        else
            this.DataBuffer = new Uint8Array(0);

        // Reset Start/End indices
        this.PageStartIdx = 0;
        this.PageEndIdx = -1;

        return new OGGPageInfo(pagearray, this.ContinuingPage, this.PageSampleLength);
    }

    private readonly _OnDecodeSuccess: (decodedData: AudioBuffer, id: number, sampleLengths: Array<number>) => void;
    // Is called if the decoding of the pages succeeded
    private OnDecodeSuccess(decodedData: AudioBuffer, id: number, sampleLengths: Array<number>): void {
        let audioBuffer: AudioBuffer;

        if (this.IsOpus) {
            // For opus we need to make some corrections due to the fixed overlapping

            // Calculate size of the part we are interested in		
            let partlength: number = Math.ceil((sampleLengths[sampleLengths.length - 1]) * decodedData.sampleRate / 48000);

            if(partlength <= 0) {
				this.LastPushedId++;
				return;
			}

            // Create a buffer that can hold the part
            audioBuffer = this.Audio.createBuffer(decodedData.numberOfChannels, partlength, decodedData.sampleRate);

            // Fill buffer with the last part of the decoded pages
            for (let i: number = 0; i < decodedData.numberOfChannels; i++)
                audioBuffer.getChannelData(i).set(decodedData.getChannelData(i).subarray(decodedData.length - partlength, decodedData.length));

        }
        else {
            // For vorbis we just take the data
            audioBuffer = decodedData;
        }

        if(this.LastPushedId + 1 == id) {
            // Push samples into array
            this.Samples.push(audioBuffer);
            this.LastPushedId++;

            while(this.BufferStore[this.LastPushedId+1]) {
                // Push samples we decoded earlier in correct oder
                this.Samples.push(this.BufferStore[this.LastPushedId+1]);
                delete this.BufferStore[this.LastPushedId+1];
                this.LastPushedId++;
            }

            // Callback to tell that data is ready
            this.DataReadyCallback();
        }
        else {
            // Is out of order, will be pushed later
            this.BufferStore[id] = audioBuffer;
        }
    }

    private readonly _OnDecodeError: (error: DOMException) => void;
    // Is called in case the decoding of the pages fails
    private OnDecodeError(_error: DOMException): void {
        this.ErrorCallback();
    }
}