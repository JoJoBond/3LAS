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
        if(this.BeforeDecodeCheck(duration)) {
            return true;
        }
        else {
            this.OnDataReady(id, this.Audio.createBuffer(1, duration, this.Audio.sampleRate));
            return false;
        }
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

            if(mimeType.indexOf("audio/pcm") == 0){
                result = true;
                break;
            }

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
        
        // PCM
        settings["pcm"] = {};

        // Number of PCM samples to convert together
        settings["pcm"]["BatchDuration"] = 1 / 10; // 0.1 seconds
        /*
        if (isAndroid && isNativeChrome)
            settings["pcm"]["BatchDuration"] = 1000;
        else if (isAndroid && isFirefox)
            settings["pcm"]["BatchDuration"] = 1000;
        else
            settings["pcm"]["BatchDuration"]= 500;
        */
        
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
        
        // OGG
        settings["ogg"] = {};

        // Number of pages to decode together.
        // For vorbis this must be greater than 1, I do not recommend to change this.
        settings["ogg"]["WindowSize"] = 2;


        // AAC
        settings["aac"] = {};

        // Minimum number of frames to decode together
        // Theoretical minimum is 2.
        // Recommended value is 3 or higher.
        settings["aac"]["MinDecodeFrames"] = 100;

        
        // MPEG
        settings["mpeg"] = {};

        // Adds a minimal ID3v2 tag before decoding frames.
        settings["mpeg"]["AddID3Tag"] = false;

        // Minimum number of frames to decode together
        // Theoretical minimum is 2.
        // Recommended value is 3 or higher.
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
    
    
            // Ogg Vorbis
            case "application/ogg":
            case "audio/ogg":
            case "audio/ogg;codecs=vorbis":
            case "audio/vorbis":
            case "audio/vorbis-config":
                if (!AudioFormatReader.CanDecodeTypes(new Array("audio/ogg; codecs=vorbis", "audio/vorbis")))
                    throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');
    
                return new AudioFormatReader_OGG(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback, <number>settings["ogg"]["WindowSize"]);
                break;
            
            // Ogg Opus
            case "audio/opus":
            case "audio/ogg;codecs=opus":
                if (!AudioFormatReader.CanDecodeTypes(new Array("audio/ogg; codecs=opus", "audio/opus")))
                    throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');
    
                return new AudioFormatReader_OGG(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback, <number>settings["ogg"]["WindowSize"]);
                break;
            
            // Advanced Audio Coding
            case "audio/mp4":
            case "audio/aac":
            case "audio/aacp":
            case "audio/3gpp":
            case "audio/3gpp2":
            case "audio/MP4A-LATM":
            case "audio/mpeg4-generic":
                if (!AudioFormatReader.CanDecodeTypes(new Array("audio/mp4", "audio/aac", "audio/mpeg4-generic", "audio/3gpp", "audio/MP4A-LATM")))
                    throw new Error('AudioFormatReader: Browser can not decode specified MIMI-Type (' + mime + ')');
                
                    return new AudioFormatReader_AAC(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback, <number>settings["aac"]["MinDecodeFrames"]);
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

            // Waveform Audio File Format
            case "audio/pcm":
                {
                    let params: Record<string, string> = {};
                    {
                        let rawParams: Array<string> = fullMime.split(";");
    
                        for(let i = 0; i < rawParams.length; i++) {
                            let idx: number = rawParams[i].indexOf("=");
                            if(idx < 1)
                                continue;
    
                            let name: string = rawParams[i].substring(0, idx);
                            let value: string = rawParams[i].substring(idx + 1);
    
                            params[name] = value;
                        }
                    }

                    let sampleRate: number = parseInt(params["rate"])
                    if(!sampleRate) {
                        sampleRate = 44100;
                    }

                    let channels: number = parseInt(params["channels"])
                    if(!channels) {
                        channels = 2;
                    }

                    let bits: number = parseInt(params["bits"])
                    if(!bits) {
                        bits = 16;
                    }

                    return new AudioFormatReader_PCM(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback, sampleRate, bits, channels, <number>settings["pcm"]["BatchDuration"]);
                }
    
                break;
    
            // Codecs below are not (yet) implemented
            // ======================================
    
            // WebM (Vorbis or Opus)
            case "audio/webm":
    
            // Unknown codec
            default:
                throw new Error('CreateAudioFormatReader: Specified MIME-Type (' + mime + ') not supported');
                break;
        }
    }
}
