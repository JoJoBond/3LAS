/*
	Audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

interface IAudioFormatReader {
    PushData(data: Uint8Array): void;
    SamplesAvailable(): boolean;
    PopSamples(): AudioBuffer;
    PurgeData(): void;
    Reset(): void;
    Poke(): void;
}

abstract class AudioFormatReader implements IAudioFormatReader {
    protected readonly Audio: AudioContext;
    protected readonly Logger: Logging;
    protected readonly ErrorCallback: () => void;
    protected readonly BeforeDecodeCheck:  (length: number) => boolean;
    protected readonly DataReadyCallback: () => void;

    // Unique ID for decoded buffers
    protected Id: number;

    // ID of the last inserted decoded samples buffer
    protected LastPushedId: number;

    // Array for individual bunches of samples
    protected Samples: Array<AudioBuffer>;

    // Storage for individual bunches of decoded samples that where decoded out of order
    protected BufferStore: Record<number, AudioBuffer>;

    // Data buffer for "raw" data
    protected DataBuffer: Uint8Array;
    

    constructor(audio: AudioContext, logger: Logging, errorCallback: () => void, beforeDecodeCheck: (length: number) => boolean, dataReadyCallback: () => void) {
        if (!audio)
            throw new Error('AudioFormatReader: audio must be specified');

        // Check callback argument
        if (typeof errorCallback !== 'function')
            throw new Error('AudioFormatReader: errorCallback must be specified');
    
        if (typeof beforeDecodeCheck !== 'function')
            throw new Error('AudioFormatReader: beforeDecodeCheck must be specified');

        if (typeof dataReadyCallback !== 'function')
            throw new Error('AudioFormatReader: dataReadyCallback must be specified');
    
        this.Audio = audio;
        this.Logger = logger;
        this.ErrorCallback = errorCallback;
        this.BeforeDecodeCheck = beforeDecodeCheck;
        this.DataReadyCallback = dataReadyCallback;

        this.Id = 0;
        this.LastPushedId = -1;
        this.Samples = new Array();
        this.BufferStore = {};
        this.DataBuffer = new Uint8Array(0);
    }

    // Pushes frame data into the buffer
    public PushData(data: Uint8Array) {
        // Append data to framedata buffer
        this.DataBuffer = this.ConcatUint8Array(this.DataBuffer, data);
        
        // Try to extract frames
        this.ExtractAll();
    }

    // Check if samples are available
    public SamplesAvailable(): boolean {
        return (this.Samples.length > 0);
    }

    // Get a single bunch of sampels from the reader
    public PopSamples(): AudioBuffer {
        if (this.Samples.length > 0) {
            // Get first bunch of samples, remove said bunch from the array and hand it back to callee
            return this.Samples.shift();
        }
        else
            return null;
    }

    // Deletes all encoded and decoded data from the reader (does not effect headers, etc.)
    public PurgeData(): void {
        this.Id = 0;
        this.LastPushedId = -1;
        this.Samples = new Array();
        this.BufferStore = {};
        this.DataBuffer = new Uint8Array(0);
    }

    // Used to force frame extraction externaly
    public Poke(): void {
        this.ExtractAll();
    }

    // Deletes all data from the reader (does effect headers, etc.)
    public Reset(): void {
        this.PurgeData();
    }

    // Extracts and converts the raw data 
    protected ExtractAll(): void {
    }

    // Checks if a decode makes sense
    protected OnBeforeDecode(id: number, duration: number): boolean {
        return true;

        //TODO Fix this
        /*
        if(this.BeforeDecodeCheck(duration)) {
            return true;
        }
        else {
            this.OnDataReady(id, this.Audio.createBuffer(1, Math.ceil(duration * this.Audio.sampleRate), this.Audio.sampleRate));
            return false;
        }
        */
    }

    // Stores the converted bnuches of samples in right order
    protected OnDataReady(id: number, audioBuffer: AudioBuffer): void {
        if(this.LastPushedId + 1 == id) {
            // Push samples into array
            this.Samples.push(audioBuffer);
            this.LastPushedId++;

            while(this.BufferStore[this.LastPushedId+1]) {
                // Push samples we decoded earlier in correct order
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

    // Used to concatenate two Uint8Array (b comes BEHIND a)
    protected ConcatUint8Array (a: Uint8Array, b: Uint8Array): Uint8Array
    {
        let tmp = new Uint8Array(a.length + b.length);
        tmp.set(a, 0);
        tmp.set(b, a.length);
        return tmp;
    }

    public static CanDecodeTypes(mimeTypes: Array<string>): boolean {
        let audioTag = new Audio();
        let result: boolean = false;
        for (let i: number = 0; i < mimeTypes.length; i++) {
            let mimeType: string = mimeTypes[i];

            let answer: string = audioTag.canPlayType(mimeType);
            if (answer != "probably" && answer != "maybe") 
                continue;
            
            result = true;
            break;
        }

        audioTag = null;
        return result;
    }
    
    public static DefaultSettings(): Record<string,Record<string, number|boolean>> {
        let settings: Record<string,Record<string, number|boolean>> = {};
        
        // WAV
        settings["wav"] = {};

        // Duration of wave samples to decode together
        settings["wav"]["BatchDuration"] = 1 / 10; // 0.1 seconds
        /*
        if (isAndroid && isNativeChrome)
            settings["wav"]["BatchDuration"] = 96 / 375;
        else if (isAndroid && isFirefox)
            settings["wav"]["BatchDuration"] = 96 / 375;
        else
            settings["wav"]["BatchDuration"] = 16 / 375;
        */

        // Duration of addtional samples to decode to account for edge effects
        settings["wav"]["ExtraEdgeDuration"] = 1 / 300; // 0.00333... seconds
        /*
        if (isAndroid && isNativeChrome)
            settings["wav"]["ExtraEdgeDuration"] = 1 / 1000;
        else if (isAndroid && isFirefox)
            settings["wav"]["ExtraEdgeDuration"] = 1 / 1000;
        else
            settings["wav"]["ExtraEdgeDuration"] = 1 / 1000;
        */
                
        // MPEG
        settings["mpeg"] = {};

        // Adds a minimal ID3v2 tag before decoding frames.
        settings["mpeg"]["AddID3Tag"] = false;

        // Minimum number of frames to decode together
        // Theoretical minimum is 2.
        // Recommended value is 3 or higher.
        if (isAndroid)
            settings["mpeg"]["MinDecodeFrames"] = 17;
        else
            settings["mpeg"]["MinDecodeFrames"] = 3;

        return settings;
    }

    public static Create(mime: string, audio: AudioContext, logger: Logging, errorCallback: () => void, beforeDecodeCheck: (length: number) => boolean, dataReadyCallback: () => void, settings: Record<string,Record<string, number|boolean>> = null): IAudioFormatReader {
        if (typeof mime !== "string")
            throw new Error('CreateAudioFormatReader: Invalid MIME-Type, must be string');

        if(!settings)
            settings = this.DefaultSettings();
        
        let fullMime: string = mime;
        if(mime.indexOf("audio/pcm") == 0)
            mime = "audio/pcm";

        // Load format handler according to MIME-Type
        switch (mime.replace(/\s/g, "")) {
            // MPEG Audio (mp3)
            case "audio/mpeg":
            case "audio/MPA":
            case "audio/mpa-robust":
                if (!AudioFormatReader.CanDecodeTypes(new Array("audio/mpeg", "audio/MPA", "audio/mpa-robust")))
                    throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');
    
                return new AudioFormatReader_MPEG(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback, <boolean>settings["mpeg"]["AddID3Tag"], <number>settings["mpeg"]["MinDecodeFrames"]);
                break;
            
            // Waveform Audio File Format
            case "audio/vnd.wave":
            case "audio/wav":
            case "audio/wave":
            case "audio/x-wav":
                if (!AudioFormatReader.CanDecodeTypes(new Array("audio/wav", "audio/wave")))
                    throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');
    
                return new AudioFormatReader_WAV(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback, <number>settings["wav"]["BatchDuration"], <number>settings["wav"]["ExtraEdgeDuration"]);
                break;
            
            // Unknown codec
            default:
                throw new Error('CreateAudioFormatReader: Specified MIME-Type (' + mime + ') not supported');
                break;
        }
    }
}
