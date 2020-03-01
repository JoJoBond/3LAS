/*
	MPEG audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

class MPEGFrameInfo {
    public readonly Data: Uint8Array;
    public readonly SampleCount: number;
    public readonly SampleRate: number;

    constructor(data: Uint8Array, sampleCount: number, sampleRate: number){
        this.Data = data;
        this.SampleCount = sampleCount;
        this.SampleRate = sampleRate;
    }
}

class AudioFormatReader_MPEG extends AudioFormatReader implements IAudioFormatReader {
    // MPEG versions - use [version]
    private static readonly MPEG_versions: Array<number> = new Array(25, 0, 2, 1);

    // Layers - use [layer]
    private static readonly MPEG_layers: Array<number> = new Array(0, 3, 2, 1);

    // Bitrates - use [version][layer][bitrate]
    private static MPEG_bitrates: Array<Array<Array<number>>> = new Array(
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
    private static MPEG_srates: Array<Array<number>> = new Array(
        new Array(11025, 12000, 8000, 0), // MPEG 2.5
        new Array(0, 0, 0, 0), // Reserved
        new Array(22050, 24000, 16000, 0), // MPEG 2
        new Array(44100, 48000, 32000, 0)  // MPEG 1
    );

    // Samples per frame - use [version][layer]
    private static MPEG_frame_samples: Array<Array<number>> = new Array(
        //             Rsvd     3     2     1  < Layer  v Version
        new Array(0, 576, 1152, 384), //       2.5
        new Array(0, 0, 0, 0), //       Reserved
        new Array(0, 576, 1152, 384), //       2
        new Array(0, 1152, 1152, 384)  //       1
    );

    private static Id3v2Tag: Uint8Array = new Uint8Array(new Array(
        0x49, 0x44, 0x33,       // File identifier: "ID3"
        0x03, 0x00,             // Version 2.3
        0x00,                   // Flags: no unsynchronisation, no extended header, no experimental indicator
        0x00, 0x00, 0x00, 0x0D, // Size of the (tag-)frames, extended header and padding
        0x54, 0x49, 0x54, 0x32, // Title frame: "TIT2"
        0x00, 0x00, 0x00, 0x02, // Size of the frame data
        0x00, 0x00,				// Frame Flags
        0x00, 0x20, 0x00		// Frame data (space character) and padding 
    ));

    // Slot size (MPEG unit of measurement) - use [layer]
    private static readonly MPEG_slot_size: Array<number> = new Array(0, 1, 1, 4); // Rsvd, 3, 2, 1

    private readonly AddId3Tag: boolean;
    private readonly MinDecodeFrames: number;

    // Array for individual frames
    private Frames: Array<MPEGFrameInfo>;
    
    // Indices that mark frame borders
    private FrameStartIdx: number;
    private FrameEndIdx: number;
    
    private FrameSamples: number;
    private FrameSampleRate: number;
    
    private TimeBudget: number;

    constructor(audio: AudioContext, logger: Logging, errorCallback: () => void, beforeDecodeCheck: (length: number) => boolean, dataReadyCallback: () => void, addId3Tag: boolean, minDecodeFrames: number)
    {
        super(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback);

        this._OnDecodeSuccess = this.OnDecodeSuccess.bind(this);
        this._OnDecodeError = this.OnDecodeError.bind(this);

        this.AddId3Tag = addId3Tag;
        this.MinDecodeFrames = minDecodeFrames;

        this.Frames = new Array();
        this.FrameStartIdx = -1;
        this.FrameEndIdx = -1;
        this.FrameSamples = 0;
        this.FrameSampleRate = 0;
        this.TimeBudget = 0;
    }

    // Deletes all frames from the databuffer and framearray and all samples from the samplearray
    public PurgeData(): void {
        super.PurgeData();

        this.Frames = new Array();
        this.FrameStartIdx = -1;
        this.FrameEndIdx = -1;
        this.FrameSamples = 0;
        this.FrameSampleRate = 0;
        this.TimeBudget = 0;
    }

    // Extracts all currently possible frames
    protected ExtractAll(): void {
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

            let bufferLength: number = 0;
            let expectedTotalPlayTime: number = 0;

            expectedTotalPlayTime += this.Frames[0].SampleCount / this.Frames[0].SampleRate / 2.0; // Only half of data is usable due to overlap
            bufferLength += this.Frames[0].Data.length;
            for (let i: number = 1; i < this.Frames.length - 1; i++) {
                expectedTotalPlayTime += this.Frames[i].SampleCount / this.Frames[i].SampleRate;
                bufferLength += this.Frames[i].Data.length;
            }
            expectedTotalPlayTime += this.Frames[this.Frames.length - 1].SampleCount / this.Frames[this.Frames.length - 1].SampleRate / 2.0; // Only half of data is usable due to overlap
            bufferLength += this.Frames[this.Frames.length - 1].Data.length;

            // If needed, add some space for the ID3v2 tag
            if (this.AddId3Tag) {
                bufferLength += AudioFormatReader_MPEG.Id3v2Tag.length;
            }

            // Create a buffer long enough to hold everything
            let decodeBuffer: Uint8Array = new Uint8Array(bufferLength);

            let offset: number = 0;

            // If needed, add ID3v2 tag to beginning of buffer
            if (this.AddId3Tag) {
                decodeBuffer.set(AudioFormatReader_MPEG.Id3v2Tag, offset);
                offset += AudioFormatReader_MPEG.Id3v2Tag.length;
            }

            // Add the frames to the window
            for (let i: number = 0; i < this.Frames.length; i++) {
                decodeBuffer.set(this.Frames[i].Data, offset);
                offset += this.Frames[i].Data.length;
            }

            // Remove the used frames from the array
            this.Frames.splice(0, this.Frames.length - 1);

            // Increment Id
            let id = this.Id++;

            // Check if decoded frames might be too far back in the past
            if(!this.OnBeforeDecode(id, expectedTotalPlayTime))
                return;

            // Push window to the decoder
            this.Audio.decodeAudioData(
                decodeBuffer.buffer,
                (function (decodedData: AudioBuffer) {
                    let _id: number = id;
                    let _expectedTotalPlayTime: number = expectedTotalPlayTime;
                    this._OnDecodeSuccess(decodedData, _id, _expectedTotalPlayTime);
                }).bind(this),
                this._OnDecodeError.bind(this)
            );
        }
    }

    // Finds frame boundries within the data buffer
    private FindFrame(): void {
        // Find frame start
        if (this.FrameStartIdx < 0) {
            let i: number = 0;
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
                let ver: number = (this.DataBuffer[this.FrameStartIdx + 1] & 0x18) >>> 3;
                // Layer index
                let lyr: number = (this.DataBuffer[this.FrameStartIdx + 1] & 0x06) >>> 1;
                // Padding? 0/1
                let pad: number = (this.DataBuffer[this.FrameStartIdx + 2] & 0x02) >>> 1;
                // Bitrate index
                let brx: number = (this.DataBuffer[this.FrameStartIdx + 2] & 0xF0) >>> 4;
                // SampRate index
                let srx: number = (this.DataBuffer[this.FrameStartIdx + 2] & 0x0C) >>> 2;

                // Resolve flags to real values
                let bitrate: number = AudioFormatReader_MPEG.MPEG_bitrates[ver][lyr][brx] * 1000;
                let samprate: number = AudioFormatReader_MPEG.MPEG_srates[ver][srx];
                let samples: number = AudioFormatReader_MPEG.MPEG_frame_samples[ver][lyr];
                let slot_size: number = AudioFormatReader_MPEG.MPEG_slot_size[lyr];

                // In-between calculations
                let bps: number = samples / 8.0;
                let fsize: number = ((bps * bitrate) / samprate) + ((pad == 1) ? slot_size : 0);

                // Truncate to integer
                let frameSize: number = Math.floor(fsize)

                // Store number of samples and samplerate for frame
                this.FrameSamples = samples;
                this.FrameSampleRate = samprate;

                // Set end frame boundry
                this.FrameEndIdx = this.FrameStartIdx + frameSize;
            }
        }
    }

    // Checks if there is a frame ready to be extracted
    private CanExtractFrame(): boolean {
        if (this.FrameStartIdx < 0 || this.FrameEndIdx < 0)
            return false;
        else if (this.FrameEndIdx <= this.DataBuffer.length)
            return true;
        else
            return false;
    }

    // Extract a single frame from the buffer
    private ExtractFrame(): MPEGFrameInfo {
        // Extract frame data from buffer
        let frameArray: ArrayBuffer = this.DataBuffer.buffer.slice(this.FrameStartIdx, this.FrameEndIdx);

        // Remove frame from buffer
        if ((this.FrameEndIdx + 1) < this.DataBuffer.length)
            this.DataBuffer = new Uint8Array(this.DataBuffer.buffer.slice(this.FrameEndIdx));
        else
            this.DataBuffer = new Uint8Array(0);

        // Reset Start/End indices
        this.FrameStartIdx = 0;
        this.FrameEndIdx = -1;

        return new MPEGFrameInfo(new Uint8Array(frameArray), this.FrameSamples, this.FrameSampleRate);
    }

    private readonly _OnDecodeSuccess: (decodedData: AudioBuffer, id: number, expectedTotalPlayTime: number) => void;
    // Is called if the decoding of the window succeeded
    private OnDecodeSuccess(decodedData: AudioBuffer, id: number, expectedTotalPlayTime: number): void {
        let extractSampleCount: number;
        let extractSampleOffset: number;

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

            let budgetSamples: number = this.TimeBudget * decodedData.sampleRate;
            if (budgetSamples > 1.0) {
                if(budgetSamples > decodedData.length - extractSampleCount) {
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
        let audioBuffer: AudioBuffer = this.Audio.createBuffer(decodedData.numberOfChannels, extractSampleCount, decodedData.sampleRate);

        // Fill buffer with the last part of the decoded frame leave out last granule
        for (let i: number = 0; i < decodedData.numberOfChannels; i++)
            audioBuffer.getChannelData(i).set(decodedData.getChannelData(i).subarray(
                extractSampleOffset,
                extractSampleOffset  + extractSampleCount
            ));

        this.OnDataReady(id, audioBuffer);
    }

    private readonly _OnDecodeError: (error: DOMException) => void;
    // Is called in case the decoding of the window fails
    private OnDecodeError(_error: DOMException): void {
        this.ErrorCallback();
    }
}