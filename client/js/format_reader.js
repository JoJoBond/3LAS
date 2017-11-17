/*
	Format-Reader is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

function AudioFormatReader(ErrorCallback, DataReadyCallback) {
    // Check callback argument
    if (typeof ErrorCallback !== 'function')
        throw new Error('AudioFormatReader: ErrorCallback must be specified');

    if (typeof DataReadyCallback !== 'function')
        throw new Error('AudioFormatReader: DataReadyCallback must be specified');

    this._ErrorCallback = ErrorCallback;
    this._DataReadyCallback = DataReadyCallback;
}


// Pubic methods (external functions) prototypes:
// ==============================================

// Push data into reader
AudioFormatReader.prototype.PushData = function (data) {
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


function CanDecodeTypes(MIMETypes) {
    var AudioTag = new Audio();

    for (var i = 0; i < MIMETypes.length; i++) {
        var answer = AudioTag.canPlayType(MIMETypes[i]);
        if (answer === "probably" || answer === "maybe")
            return true;
    }
    return false;
}


function CreateAudioFormatReader(MIME, ErrorCallback, DataReadyCallback) {
    if (typeof MIME !== "string")
        throw new Error('CreateAudioFormatReader: Invalid MIME-Type, must be string');

    // Load format handler according to MIME-Type
    switch (MIME.replace(/\s/g, "")) {
        // MPEG Audio (mp3)
        case "audio/mpeg":
        case "audio/MPA":
        case "audio/mpa-robust":
            if (!CanDecodeTypes(new Array("audio/mpeg", "audio/MPA", "audio/mpa-robust")))
                throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + MIME + ')');

            return new AudioFormatReader_MPEG(ErrorCallback, DataReadyCallback);
            break;


        // Ogg Vorbis
        case "application/ogg":
        case "audio/ogg":
        case "audio/ogg;codecs=vorbis":
        case "audio/vorbis":
        case "audio/vorbis-config":
            if (!CanDecodeTypes(new Array("audio/ogg; codecs=vorbis", "audio/vorbis")))
                throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + MIME + ')');

            return new AudioFormatReader_OGG(ErrorCallback, DataReadyCallback);
            break;
        
        // Ogg Opus
        case "audio/opus":
        case "audio/ogg;codecs=opus":
            if (!CanDecodeTypes(new Array("audio/ogg; codecs=opus", "audio/opus")))
                throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + MIME + ')');

            return new AudioFormatReader_OGG(ErrorCallback, DataReadyCallback);
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
            if (!CanDecodeTypes(new Array("audio/wav", "audio/wave")))
                throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + MIME + ')');

            return new AudioFormatReader_WAV(ErrorCallback, DataReadyCallback);
            break;

        // Codecs below are not (yet) implemented
        // ======================================

        // WebM (Vorbis or Opus)
        case "audio/webm":

        // Unknown codec
        default:
            throw new Error('CreateAudioFormatReader: Specified MIME-Type (' + MIME + ') not supported');
            break;
    }
}
