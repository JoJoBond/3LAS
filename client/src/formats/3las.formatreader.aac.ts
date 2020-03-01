/*
	AAC audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

class AudioFormatReader_AAC extends AudioFormatReader implements IAudioFormatReader {
    
    // Sample rates - use [version][srate]
    private static AAC_srates: Array<number> = new Array(
        96000,
        88200,
        64000,
        48000,
        44100,
        32000,
        24000,
        22050,
        16000,
        12000,
        11025,
         8000,
         7350,
           -1, // Reserved
           -1, // Reserved
    );

    private readonly MinDecodeFrames: number;

    // Array for individual frames
    private Frames: Array<Uint8Array>;
    
    // Indices that mark frame borders
    private FrameStartIdx: number;
    private FrameEndIdx: number;

    private TimeBudget: number;

    constructor(audio: AudioContext, logger: Logging, errorCallback: () => void, beforeDecodeCheck: (length: number) => boolean, dataReadyCallback: () => void, minDecodeFrames: number)
    {
        super(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback);

        this._OnDecodeSuccess = this.OnDecodeSuccess.bind(this);
        this._OnDecodeError = this.OnDecodeError.bind(this);

        this.MinDecodeFrames = minDecodeFrames;

        this.Frames = new Array();
        this.FrameStartIdx = -1;
        this.FrameEndIdx = -1;
        this.TimeBudget = 0;
    }

    // Deletes all frames from the databuffer and framearray and all samples from the samplearray
    public PurgeData(): void {
        super.PurgeData();

        this.Frames = new Array();
        this.FrameStartIdx = -1;
        this.FrameEndIdx = -1;
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
            // Sum raw data length
            let bufferLength: number = 0;
            for (let i: number = 0; i < this.Frames.length; i++) {
                bufferLength += this.Frames[i].length;
            }

            // Create a buffer long enough to hold everything
            let decodeBuffer: Uint8Array = new Uint8Array(bufferLength);

            let offset: number = 0;

            // Add the frames to the window
            for (let i: number = 0; i < this.Frames.length; i++) {
                decodeBuffer.set(this.Frames[i], offset);
                offset += this.Frames[i].length;
            }

            // Remove the used frames from the array
            this.Frames.splice(0, this.Frames.length - 1);

            // Increment Id
            let id = this.Id++;

            // Push window to the decoder
            this.Audio.decodeAudioData(
                decodeBuffer.buffer,
                (function (decodedData: AudioBuffer) {
                    let _id: number = id;
                    this._OnDecodeSuccess(decodedData, _id);
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
                // Look for ADTS sync word
                if (this.DataBuffer[i] == 0xFF && (this.DataBuffer[i + 1] & 0xF0) == 0xF0) {
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
            if ((this.FrameStartIdx + 7) < this.DataBuffer.length) {
                // Get header data
                
                // Version index
                let ver: number = (this.DataBuffer[this.FrameStartIdx + 1] & 0x08) >>> 3;
                // Layer index
                let lyr: number = (this.DataBuffer[this.FrameStartIdx + 1] & 0x06) >>> 1;
                // CRC absent
                let xrc: boolean = (this.DataBuffer[this.FrameStartIdx + 1] & 0x01) == 0x01;

                if(xrc || (this.FrameStartIdx + 9) < this.DataBuffer.length) {
                    // Profile index
                    let prf: number = (this.DataBuffer[this.FrameStartIdx + 2] & 0xC0) >>> 6;
                    // SampRate index
                    let srx: number = (this.DataBuffer[this.FrameStartIdx + 2] & 0x3C) >>> 2;
                    // Channels
                    let chn: number = ((this.DataBuffer[this.FrameStartIdx + 2] & 0x01) << 2) | 
                                      ((this.DataBuffer[this.FrameStartIdx + 3] & 0xC0) >>> 6);
                    // Frame length
                    let len: number = ((this.DataBuffer[this.FrameStartIdx + 3] & 0x03) << 11) |
                                       (this.DataBuffer[this.FrameStartIdx + 4] << 3) |
                                      ((this.DataBuffer[this.FrameStartIdx + 5] & 0xE0) >>> 5);
                    // Buffer fullness
                    let bfn: number = ((this.DataBuffer[this.FrameStartIdx + 5] & 0x1F) << 6) |
                                      ((this.DataBuffer[this.FrameStartIdx + 6] & 0xFC) >>> 2);
                    
                    // Number of AAC frames 
                    let fnm: number = (this.DataBuffer[this.FrameStartIdx + 6] & 0x03);

                    if(!xrc) {
                        let crc: number = (this.DataBuffer[this.FrameStartIdx + 7] << 8) | this.DataBuffer[this.FrameStartIdx + 8];
                    }

                    // Resolve flags to real values
                    let samprate: number = AudioFormatReader_AAC.AAC_srates[srx];
                    if(chn == 7)
                        chn = 8;

                    // Set end frame boundry
                    this.FrameEndIdx = this.FrameStartIdx + len;
                }
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
    private ExtractFrame(): Uint8Array {
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

        return new Uint8Array(frameArray);
    }

    private readonly _OnDecodeSuccess: (decodedData: AudioBuffer, id: number) => void;
    // Is called if the decoding of the window succeeded
    private OnDecodeSuccess(decodedData: AudioBuffer, id: number): void {
        this.OnDataReady(id, decodedData);
    }

    private readonly _OnDecodeError: (error: DOMException) => void;
    // Is called in case the decoding of the window fails
    private OnDecodeError(_error: DOMException): void {
        this.ErrorCallback();
    }
}