import { Logging } from '../../util/3las.logging';
import { AudioFormatReader, IAudioFormatReader } from '../3las.formatreader';
import { AudioFormatReader_MPEG } from './3las.formatreader.mpeg';
import { AudioFormatReader_WAV } from './3las.formatreader.wav';

export function CreateAudioFormatReader(mime: string, audio: AudioContext, logger: Logging, errorCallback: () => void, beforeDecodeCheck: (length: number) => boolean, dataReadyCallback: () => void, settings: Record<string, Record<string, number | boolean>> = null): IAudioFormatReader {
    if (typeof mime !== "string")
        throw new Error('CreateAudioFormatReader: Invalid MIME-Type, must be string');

    if (!settings)
        settings = AudioFormatReader.DefaultSettings();

    let fullMime: string = mime;
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

            return new AudioFormatReader_MPEG(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback, <boolean>settings["mpeg"]["AddID3Tag"], <number>settings["mpeg"]["MinDecodeFrames"]);

        // Waveform Audio File Format
        case "audio/vnd.wave":
        case "audio/wav":
        case "audio/wave":
        case "audio/x-wav":
            if (!AudioFormatReader.CanDecodeTypes(new Array("audio/wav", "audio/wave")))
                throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');

            return new AudioFormatReader_WAV(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback, <number>settings["wav"]["BatchDuration"], <number>settings["wav"]["ExtraEdgeDuration"]);

        // Unknown codec
        default:
            throw new Error('CreateAudioFormatReader: Specified MIME-Type (' + mime + ') not supported');
    }
}
