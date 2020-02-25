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
    private readonly WindowSize: number;
    private readonly UseFrames: number;
    private readonly ID3v2Tag: Uint8Array;

    // Data buffer for "raw" framedata
    private DataBuffer: Uint8Array;
        
    // Array for individual frames
    private Frames: Array<MPEGFrameInfo>;
        
    // Array for individual bunches of samples
    private Samples: Array<AudioBuffer>;

    // Storage for individual bunches of decoded samples that where decoded out of order
    private BufferStore: Record<number, AudioBuffer>;
    
    // Indices that mark frame borders
    private FrameStartIdx: number;
    private FrameEndIdx: number;
    
    private FrameSamples: number;
    private FrameSampleRate: number;
    
    private TimeBudget: number;

    // Unique ID for decoded buffers
    private Id: number;

    // ID of the last inserted decoded samples buffer
    private LastPushedId: number;

    constructor(audio: AudioContext, logger: Logging, errorCallback: () => void, dataReadyCallback: () => void, addId3Tag: boolean, windowSize: number, useFrames: number)
    {
        super(audio, logger, errorCallback, dataReadyCallback);

        this._OnDecodeSuccess = this.OnDecodeSuccess.bind(this);
        this._OnDecodeError = this.OnDecodeError.bind(this);

        this.AddId3Tag = addId3Tag;
        this.WindowSize = windowSize;
        this.UseFrames = useFrames;

        this.DataBuffer = new Uint8Array(0);
        this.Frames = new Array();
        this.Samples = new Array();
        this.BufferStore = {};
        this.FrameStartIdx = -1;
        this.FrameEndIdx = -1;
        this.FrameSamples = 0;
        this.FrameSampleRate = 0;
        this.TimeBudget = 0;
        this.Id = 0;
        this.LastPushedId = -1;
    }

    // Pushes frame data into the buffer
    public PushData(data: Uint8Array) {
        // Append data to framedata buffer
        this.DataBuffer = this.ConcatUint8Array(this.DataBuffer, data);
        
        // Try to extract frames
        this.ExtractAllFrames();
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

    // Used to force frame extraction externaly
    public Poke(): void {
        this.ExtractAllFrames();
    }

    // Deletes all frames from the databuffer and framearray and all samples from the samplearray
    public PurgeData(): void {
        this.DataBuffer = new Uint8Array(0);

        this.Frames = new Array();

        this.Samples = new Array();

        this.FrameStartIdx = -1;
        this.FrameEndIdx = -1;
    }

    // Extracts all currently possible frames
    private ExtractAllFrames(): void {
        // Look for frames
        this.FindFrame();
        // Repeat as long as we can extract frames
        while (this.CanExtractFrame()) {
            // Extract frame and push into array
            this.Frames.push(this.ExtractFrame());

            // Check if we have enough frames to decode
            if (this.Frames.length >= this.WindowSize) {
                let sampleRates: Array<number> = new Array();
                let sampleCount: Array<number> = new Array();

                // Sum the lengths of the individuall frames
                let bufferlength: number = 0;
                for (let i: number = 0; i < this.WindowSize; i++) {
                    sampleRates.push(this.Frames[i].SampleRate);
                    sampleCount.push(this.Frames[i].SampleCount);
                    bufferlength += this.Frames[i].Data.length;
                }

                // If needed, add some space for the ID3v2 tag
                if (this.AddId3Tag)
                    bufferlength += AudioFormatReader_MPEG.Id3v2Tag.length;

                // Create a buffer long enough to hold everything
                let windowbuffer: Uint8Array = new Uint8Array(bufferlength);

                let offset: number = 0;

                // If needed, add ID3v2 tag to beginning of buffer
                if (this.AddId3Tag) {
                    windowbuffer.set(AudioFormatReader_MPEG.Id3v2Tag, offset);
                    offset += AudioFormatReader_MPEG.Id3v2Tag.length;
                }

                // Add the frames to the window
                for (let i: number = 0; i < this.WindowSize; i++) {
                    windowbuffer.set(this.Frames[i].Data, offset);
                    offset += this.Frames[i].Data.length;
                }

                // Remove the used frames from the array
                for (let i: number = 0; i < (this.UseFrames - 1); i++)
                    this.Frames.shift();

                // Increment Id
                let id = this.Id++;

                // Push window to the decoder
                this.Audio.decodeAudioData(
                    windowbuffer.buffer,
                    (function (decodedData: AudioBuffer) {
                        let _id: number = id;
                        let _sampleRates: Array<number> = sampleRates;
                        let _sampleCount: Array<number> = sampleCount;
                        this._OnDecodeSuccess(decodedData, _id, _sampleRates, _sampleCount);
                    }).bind(this),
                    this._OnDecodeError.bind(this)
                );
            }

            // Look for frames
            this.FindFrame();
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
                let brx: number = (this.DataBuffer[this.FrameStartIdx + 2] & 0xf0) >>> 4;
                // SampRate index
                let srx: number = (this.DataBuffer[this.FrameStartIdx + 2] & 0x0c) >>> 2;

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
        else if (this.FrameEndIdx < this.DataBuffer.length)
            return true;
        else
            return false;
    }

    // Extract a single frame from the buffer
    private ExtractFrame(): MPEGFrameInfo {
        // Extract frame data from buffer
        let framearray: ArrayBuffer = this.DataBuffer.buffer.slice(this.FrameStartIdx, this.FrameEndIdx);

        // Remove frame from buffer
        if ((this.FrameEndIdx + 1) < this.DataBuffer.length)
            this.DataBuffer = new Uint8Array(this.DataBuffer.buffer.slice(this.FrameEndIdx));
        else
            this.DataBuffer = new Uint8Array(0);

        // Reset Start/End indices
        this.FrameStartIdx = 0;
        this.FrameEndIdx = -1;

        return new MPEGFrameInfo(new Uint8Array(framearray), this.FrameSamples, this.FrameSampleRate);
    }

    private readonly _OnDecodeSuccess: (decodedData: AudioBuffer, id: number, sampleRates: Array<number>, sampleCount: Array<number>) => void;
    // Is called if the decoding of the window succeeded
    private OnDecodeSuccess(decodedData: AudioBuffer, id: number, sampleRates: Array<number>, sampleCount: Array<number>): void {
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

        let calcTotalPlayTime: number = 0;
        calcTotalPlayTime += sampleCount[0] / sampleRates[0] / 2.0;
        for (let i: number = 1; i < (sampleCount.length - 1); i++)
            calcTotalPlayTime += sampleCount[i] / sampleRates[i];
        calcTotalPlayTime += sampleCount[sampleCount.length - 1] / sampleRates[sampleCount.length - 1] / 2.0;

        // Calculate the expected number of samples
        let calcSampleCount: number = calcTotalPlayTime * decodedData.sampleRate;

        let decoderOffset: number;

        // Check if we got the expected number of samples
        if (calcTotalPlayTime > decodedData.duration) {
            // We got less samples than expect, we suspect that they were truncated equally at start and end.
            let offsetTime: number = (calcTotalPlayTime - decodedData.duration) / 2.0;

            decoderOffset = Math.ceil(offsetTime * decodedData.sampleRate);
        }
        else if (calcTotalPlayTime < decodedData.duration) {
            // We got more samples than expect, we suspect that zeros were added equally at start and end.
            let offsetTime: number = (decodedData.duration - calcTotalPlayTime) / 2.0;

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

        let extractTimeSum: number = 0;

        extractTimeSum += sampleCount[sampleCount.length - 1] / sampleRates[sampleCount.length - 1] / 2.0;

        for (let i: number = 1; i < (this.UseFrames - 1); i++)
            extractTimeSum += sampleCount[sampleCount.length - 1 - i] / sampleRates[sampleCount.length - 1 - i];

        extractTimeSum += sampleCount[sampleCount.length - this.UseFrames] / sampleRates[sampleCount.length - this.UseFrames] / 2.0

        let extractSampleNum: number = extractTimeSum * decodedData.sampleRate;

        this.TimeBudget += (extractSampleNum - Math.floor(extractSampleNum)) / decodedData.sampleRate;

        let budgetSamples: number = 0;
        if (this.TimeBudget * decodedData.sampleRate > 1.0) {
            budgetSamples = Math.floor(this.TimeBudget * decodedData.sampleRate);
            this.TimeBudget -= budgetSamples / decodedData.sampleRate;
        }
        else if (this.TimeBudget * decodedData.sampleRate < -1.0) {
            budgetSamples = -1.0 * Math.floor(Math.abs(this.TimeBudget * decodedData.sampleRate));
            this.TimeBudget -= budgetSamples / decodedData.sampleRate;
        }

        extractSampleNum = Math.floor(extractSampleNum) + budgetSamples;

        let offsetRight: number = 0; //Math.ceil((SampleCount[SampleCount.length - 1] / SampleRates[SampleCount.length - 1] / 2.0) * buffer.sampleRate * this._OffsetRightFactor);

        // Create a buffer that can hold the frame to extract
        let audioBuffer: AudioBuffer = this.Audio.createBuffer(decodedData.numberOfChannels, extractSampleNum, decodedData.sampleRate);

        // Fill buffer with the last part of the decoded frame leave out last granule
        for (let i: number = 0; i < decodedData.numberOfChannels; i++)
            audioBuffer.getChannelData(i).set(decodedData.getChannelData(i).subarray(
                decodedData.length - offsetRight + decoderOffset - extractSampleNum,
                decodedData.length - offsetRight + decoderOffset
            ));

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
    // Is called in case the decoding of the window fails
    private OnDecodeError(_error: DOMException): void {
        this.ErrorCallback();
    }
}