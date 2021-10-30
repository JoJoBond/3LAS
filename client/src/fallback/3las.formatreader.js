/*
    Audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/
var AudioFormatReader = /** @class */ (function () {
    function AudioFormatReader(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback) {
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
    AudioFormatReader.prototype.PushData = function (data) {
        // Append data to framedata buffer
        this.DataBuffer = this.ConcatUint8Array(this.DataBuffer, data);
        // Try to extract frames
        this.ExtractAll();
    };
    // Check if samples are available
    AudioFormatReader.prototype.SamplesAvailable = function () {
        return (this.Samples.length > 0);
    };
    // Get a single bunch of sampels from the reader
    AudioFormatReader.prototype.PopSamples = function () {
        if (this.Samples.length > 0) {
            // Get first bunch of samples, remove said bunch from the array and hand it back to callee
            return this.Samples.shift();
        }
        else
            return null;
    };
    // Deletes all encoded and decoded data from the reader (does not effect headers, etc.)
    AudioFormatReader.prototype.PurgeData = function () {
        this.Id = 0;
        this.LastPushedId = -1;
        this.Samples = new Array();
        this.BufferStore = {};
        this.DataBuffer = new Uint8Array(0);
    };
    // Used to force frame extraction externaly
    AudioFormatReader.prototype.Poke = function () {
        this.ExtractAll();
    };
    // Deletes all data from the reader (does effect headers, etc.)
    AudioFormatReader.prototype.Reset = function () {
        this.PurgeData();
    };
    // Extracts and converts the raw data 
    AudioFormatReader.prototype.ExtractAll = function () {
    };
    // Checks if a decode makes sense
    AudioFormatReader.prototype.OnBeforeDecode = function (id, duration) {
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
    };
    // Stores the converted bnuches of samples in right order
    AudioFormatReader.prototype.OnDataReady = function (id, audioBuffer) {
        if (this.LastPushedId + 1 == id) {
            // Push samples into array
            this.Samples.push(audioBuffer);
            this.LastPushedId++;
            while (this.BufferStore[this.LastPushedId + 1]) {
                // Push samples we decoded earlier in correct order
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
            var answer = audioTag.canPlayType(mimeType);
            if (answer != "probably" && answer != "maybe")
                continue;
            result = true;
            break;
        }
        audioTag = null;
        return result;
    };
    AudioFormatReader.DefaultSettings = function () {
        var settings = {};
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
    };
    AudioFormatReader.Create = function (mime, audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback, settings) {
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
                return new AudioFormatReader_MPEG(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback, settings["mpeg"]["AddID3Tag"], settings["mpeg"]["MinDecodeFrames"]);
                break;
            // Waveform Audio File Format
            case "audio/vnd.wave":
            case "audio/wav":
            case "audio/wave":
            case "audio/x-wav":
                if (!AudioFormatReader.CanDecodeTypes(new Array("audio/wav", "audio/wave")))
                    throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');
                return new AudioFormatReader_WAV(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback, settings["wav"]["BatchDuration"], settings["wav"]["ExtraEdgeDuration"]);
                break;
            // Unknown codec
            default:
                throw new Error('CreateAudioFormatReader: Specified MIME-Type (' + mime + ') not supported');
                break;
        }
    };
    return AudioFormatReader;
}());
//# sourceMappingURL=3las.formatreader.js.map