/*
    Audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/
var AudioFormatReader = /** @class */ (function () {
    function AudioFormatReader(audio, logger, errorCallback, dataReadyCallback) {
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
    AudioFormatReader.prototype.PushData = function (_data) {
    };
    // Check if samples are available
    AudioFormatReader.prototype.SamplesAvailable = function () {
        return false;
    };
    // Get a single bunch of sampels from the reader
    AudioFormatReader.prototype.PopSamples = function () {
        return null;
    };
    // Deletes all encoded and decoded data from the reader (does not effect headers, etc.)
    AudioFormatReader.prototype.PurgeData = function () {
    };
    // Force the reader to analyze his data
    AudioFormatReader.prototype.Poke = function () {
    };
    // Used to concatenate two Uint8Array (b comes BEHIND a)
    AudioFormatReader.prototype.ConcatUint8Array = function (a, b) {
        var tmp = new Uint8Array(a.length + b.length);
        tmp.set(a, 0);
        tmp.set(b, a.length);
        return tmp;
    };
    AudioFormatReader.CanDecodeTypes = function (mimeTypes) {
        var audioTag = new Audio();
        var result = false;
        for (var i = 0; i < mimeTypes.length; i++) {
            var mimeType = mimeTypes[i];
            if (mimeType.indexOf("audio/pcm") == 0)
                mimeType = "audio/wav";
            var answer = audioTag.canPlayType(mimeType);
            if (answer != "probably" && answer != "maybe")
                continue;
            result = true;
            audioTag = null;
            break;
        }
        return result;
    };
    AudioFormatReader.DefaultSettings = function () {
        var settings = {};
        // PCM
        settings["pcm"] = {};
        // Number of PCM samples to convert together
        if (isAndroid && isNativeChrome)
            settings["pcm"]["BatchSize"] = 1000;
        else if (isAndroid && isFirefox)
            settings["pcm"]["BatchSize"] = 1000;
        else
            settings["pcm"]["BatchSize"] = 500;
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
    };
    AudioFormatReader.Create = function (mime, audio, logger, errorCallback, dataReadyCallback, settings) {
        if (settings === void 0) { settings = null; }
        if (typeof mime !== "string")
            throw new Error('CreateAudioFormatReader: Invalid MIME-Type, must be string');
        if (!settings)
            settings = this.DefaultSettings();
        var fullMime = mime;
        if (mime.indexOf("audio/pcm") == 0)
            mime = "audio/pcm";
        // Load format handler according to MIME-Type
        switch (mime.replace(/\s/g, "")) {
            // MPEG Audio (mp3)
            case "audio/mpeg":
            case "audio/MPA":
            case "audio/mpa-robust":
                if (!AudioFormatReader.CanDecodeTypes(new Array("audio/mpeg", "audio/MPA", "audio/mpa-robust")))
                    throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');
                return new AudioFormatReader_MPEG(audio, logger, errorCallback, dataReadyCallback, settings["mpeg"]["AddID3Tag"], settings["mpeg"]["WindowSize"], settings["mpeg"]["UseFrames"]);
                break;
            // Ogg Vorbis
            case "application/ogg":
            case "audio/ogg":
            case "audio/ogg;codecs=vorbis":
            case "audio/vorbis":
            case "audio/vorbis-config":
                if (!AudioFormatReader.CanDecodeTypes(new Array("audio/ogg; codecs=vorbis", "audio/vorbis")))
                    throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');
                return new AudioFormatReader_OGG(audio, logger, errorCallback, dataReadyCallback, settings["ogg"]["WindowSize"]);
                break;
            // Ogg Opus
            case "audio/opus":
            case "audio/ogg;codecs=opus":
                if (!AudioFormatReader.CanDecodeTypes(new Array("audio/ogg; codecs=opus", "audio/opus")))
                    throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');
                return new AudioFormatReader_OGG(audio, logger, errorCallback, dataReadyCallback, settings["ogg"]["WindowSize"]);
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
                return new AudioFormatReader_WAV(audio, logger, errorCallback, dataReadyCallback, settings["wav"]["BatchLength"], settings["wav"]["ExtraEdgeLength"]);
                break;
            // Waveform Audio File Format
            case "audio/pcm":
                if (!AudioFormatReader.CanDecodeTypes(new Array("audio/wav", "audio/wave")))
                    throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');
                {
                    var params = {};
                    {
                        var rawParams = fullMime.split(";");
                        for (var i = 0; i < rawParams.length; i++) {
                            var idx = rawParams[i].indexOf("=");
                            if (idx < 1)
                                continue;
                            var name_1 = rawParams[i].substring(0, idx);
                            var value = rawParams[i].substring(idx + 1);
                            params[name_1] = value;
                        }
                    }
                    var sampleRate = parseInt(params["rate"]);
                    if (!sampleRate) {
                        sampleRate = 44100;
                    }
                    var channels = parseInt(params["channels"]);
                    if (!channels) {
                        channels = 2;
                    }
                    var bits = parseInt(params["bits"]);
                    if (!bits) {
                        bits = 16;
                    }
                    return new AudioFormatReader_PCM(audio, logger, errorCallback, dataReadyCallback, sampleRate, bits, channels, settings["pcm"]["BatchSize"]);
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
    };
    return AudioFormatReader;
}());
//# sourceMappingURL=3las.formatreader.js.map