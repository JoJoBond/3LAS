/*
	Audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

interface IAudioFormatReader {
    PushData(data: Uint8Array): void;
    SamplesAvailable(): boolean;
    PopSamples(): AudioBuffer;
    PurgeData(): void;
    Poke(): void;
}

abstract class AudioFormatReader implements IAudioFormatReader {
    protected readonly Audio: AudioContext;
    protected readonly Logger: Logging;
    protected readonly ErrorCallback: () => void;
    protected readonly DataReadyCallback: () => void;

    constructor(audio: AudioContext, logger: Logging, errorCallback: () => void, dataReadyCallback: () => void) {
        if (!audio)
            throw new Error('AudioFormatReader: audio must be specified');

        // Check callback argument
        if (typeof errorCallback !== 'function')
            throw new Error('AudioFormatReader: errorCallback must be specified');
    
        if (typeof dataReadyCallback !== 'function')
            throw new Error('AudioFormatReader: dataReadyCallback must be specified');
    
        this.Audio = audio;
        this.Logger = logger;
        this.ErrorCallback = errorCallback;
        this.DataReadyCallback = dataReadyCallback;
    }

    // Push data into reader
    public PushData(_data: Uint8Array): void {
    }

    // Check if samples are available
    public SamplesAvailable(): boolean {
        return false;
    }

    // Get a single bunch of sampels from the reader
    public PopSamples(): AudioBuffer {
        return null;
    }

    // Deletes all encoded and decoded data from the reader (does not effect headers, etc.)
    public PurgeData(): void {
    }

    // Force the reader to analyze his data
    public Poke (): void {
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

            if(mimeType.indexOf("audio/pcm") == 0)
                mimeType = "audio/wav";

            let answer: string = audioTag.canPlayType(mimeType);
            if (answer != "probably" && answer != "maybe") 
                continue;
            
            result = true;
            audioTag = null;
            break;
        }

        return result;
    }
    
    public static DefaultSettings(): Record<string,Record<string, number|boolean>> {
        let settings: Record<string,Record<string, number|boolean>> = {};
        
        // PCM
        settings["pcm"] = {};
        // Number of PCM samples to convert together
        if (isAndroid && isNativeChrome)
            settings["pcm"]["BatchSize"] = 1000;
        else if (isAndroid && isFirefox)
            settings["pcm"]["BatchSize"] = 1000;
        else
            settings["pcm"]["BatchSize"]= 500;

        // WAV
        settings["wav"] = {};
        // Length of wave samples to decode together
        if (isAndroid && isNativeChrome)
            settings["wav"]["BatchLength"] = 96 / 375;
        else if (isAndroid && isFirefox)
            settings["wav"]["BatchLength"] = 96 / 375;
        else
            settings["wav"]["BatchLength"] = 16 / 375;

        // Length of addtional samples to decode to account for edge effects
        if (isAndroid && isNativeChrome)
            settings["wav"]["ExtraEdgeLength"] = 1 / 1000;
        else if (isAndroid && isFirefox)
            settings["wav"]["ExtraEdgeLength"] = 1 / 1000;
        else
            settings["wav"]["ExtraEdgeLength"] = 1 / 1000;
        
        // OGG
        settings["ogg"] = {};
        // Number of pages to decode together
        // For vorbis this must be greate than 1, I do not recommend to change this.
        settings["ogg"]["WindowSize"] = 2;

        // MPEG
        settings["mpeg"] = {};
        // Adds a minimal ID3v2 tag to each frame
        settings["mpeg"]["AddID3Tag"] = true;

        // Number of frames to decode together (keyword: byte-reservoir)
        // For live streaming this means that you can push the minimum number of frames
        // on connection to the client to reduce waiting time without effecting the latency.
        if (isAndroid && isFirefox)
            settings["mpeg"]["WindowSize"] = 50;
        else if (isAndroid && isNativeChrome)
            settings["mpeg"]["WindowSize"] = 30;
        else if (isAndroid)
            settings["mpeg"]["WindowSize"] = 30;
        else
            settings["mpeg"]["WindowSize"] = 25;

        // Number of frames to use from one decoded window
        if (isAndroid && isFirefox)
            settings["mpeg"]["UseFrames"] = 40;
        else if (isAndroid && isNativeChrome)
            settings["mpeg"]["UseFrames"] = 20;
        else if (isAndroid)
            settings["mpeg"]["UseFrames"] = 5;
        else
            settings["mpeg"]["UseFrames"] = 2;

        return settings;
    }

    public static Create(mime: string, audio: AudioContext, logger: Logging, errorCallback: () => void, dataReadyCallback: () => void, settings: Record<string,Record<string, number|boolean>> = null): IAudioFormatReader {
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
    
                return new AudioFormatReader_MPEG(audio, logger, errorCallback, dataReadyCallback, <boolean>settings["mpeg"]["AddID3Tag"], <number>settings["mpeg"]["WindowSize"], <number>settings["mpeg"]["UseFrames"] );
                break;
    
    
            // Ogg Vorbis
            case "application/ogg":
            case "audio/ogg":
            case "audio/ogg;codecs=vorbis":
            case "audio/vorbis":
            case "audio/vorbis-config":
                if (!AudioFormatReader.CanDecodeTypes(new Array("audio/ogg; codecs=vorbis", "audio/vorbis")))
                    throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');
    
                return new AudioFormatReader_OGG(audio, logger, errorCallback, dataReadyCallback, <number>settings["ogg"]["WindowSize"]);
                break;
            
            // Ogg Opus
            case "audio/opus":
            case "audio/ogg;codecs=opus":
                if (!AudioFormatReader.CanDecodeTypes(new Array("audio/ogg; codecs=opus", "audio/opus")))
                    throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');
    
                return new AudioFormatReader_OGG(audio, logger, errorCallback, dataReadyCallback, <number>settings["ogg"]["WindowSize"]);
                break;
            
            /*
            // ATM aac is only supported within a mp4-container, which is NOT streamable
            // We could stream in ADTS and then pack chunks of the data into mp4.
            // Not going to do that any soon, though.
            // Advanced Audio Coding
            case "audio/mp4":
            case "audio/aac":
            case "audio/aacp":
            case "audio/3gpp":
            case "audio/3gpp2":
            case "audio/MP4A-LATM":
            case "audio/mpeg4-generic":
                if (!CanDecodeTypes(new Array("audio/mp4", "audio/aac", "audio/mpeg4-generic", "audio/3gpp", "audio/MP4A-LATM")))
                    throw new Error('AudioFormatReader: Browser can not decode specified MIMI-Type (' + MIME + ')');
                
                MIMEReader = new AudioFormatReader_AAC(DataReadyCallback);
                break;
            */
            
            // Waveform Audio File Format
            case "audio/vnd.wave":
            case "audio/wav":
            case "audio/wave":
            case "audio/x-wav":
                if (!AudioFormatReader.CanDecodeTypes(new Array("audio/wav", "audio/wave")))
                    throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');
    
                return new AudioFormatReader_WAV(audio, logger, errorCallback, dataReadyCallback, <number>settings["wav"]["BatchLength"], <number>settings["wav"]["ExtraEdgeLength"]);
                break;

            // Waveform Audio File Format
            case "audio/pcm":
                if (!AudioFormatReader.CanDecodeTypes(new Array("audio/wav", "audio/wave")))
                    throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');
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

                    return new AudioFormatReader_PCM(audio, logger, errorCallback, dataReadyCallback, sampleRate, bits, channels, <number>settings["pcm"]["BatchSize"]);
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
