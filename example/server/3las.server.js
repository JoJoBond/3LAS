"use strict";
/*
    Stdin streamer is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const child_process_1 = require("child_process");
const ws = __importStar(require("ws"));
const wrtc = require('wrtc');
const Settings = JSON.parse((0, fs_1.readFileSync)('settings.json', 'utf-8'));
const FFmpeg_command = (() => {
    if (process.platform === 'win32')
        return Settings.FallbackFFmpegPath;
    else if (process.platform === 'linux')
        return "ffmpeg";
})();
var test = false;
class StreamClient {
    constructor(server, socket) {
        this.Server = server;
        this.Socket = socket;
        this.BinaryOptions = {
            compress: false,
            binary: true
        };
        this.Socket.on('error', this.OnError.bind(this));
        this.Socket.on('message', this.OnMessage.bind(this));
    }
    OnMessage(message, isBinary) {
        try {
            let request = JSON.parse(message.toString());
            if (request.type == "answer") {
                (() => __awaiter(this, void 0, void 0, function* () { return yield this.RtcPeer.setRemoteDescription(new wrtc.RTCSessionDescription(request.data)); }))();
            }
            else if (request.type == "webrtc") {
                this.Server.SetWebRtc(this);
            }
            else if (request.type == "fallback") {
                this.Server.SetFallback(this, request.data);
            }
            else {
                this.OnError(null);
                return;
            }
        }
        catch (_a) {
            this.OnError(null);
            return;
        }
    }
    OnError(_err) {
        this.Server.DestroyClient(this);
    }
    Destroy() {
        try {
            this.Socket.close();
        }
        catch (ex) {
        }
        if (this.RtcTrack && this.RtcPeer)
            this.RtcPeer.removeTrack(this.RtcTrack);
        if (this.RtcTrack) {
            this.RtcTrack.stop();
            delete this.RtcTrack;
            this.RtcTrack = null;
        }
        if (this.RtcPeer) {
            this.RtcPeer.close();
            delete this.RtcPeer;
            this.RtcPeer = null;
        }
        if (this.RtcSource) {
            this.RtcSource.close();
            delete this.RtcSource;
            this.RtcSource = null;
        }
    }
    SendBinary(buffer) {
        if (this.Socket.readyState != ws.OPEN) {
            this.OnError(null);
            return;
        }
        this.Socket.send(buffer, this.BinaryOptions);
    }
    SendText(text) {
        if (this.Socket.readyState != ws.OPEN) {
            this.OnError(null);
            return;
        }
        this.Socket.send(text);
    }
    StartRtc() {
        return __awaiter(this, void 0, void 0, function* () {
            this.RtcSource = new wrtc.nonstandard.RTCAudioSource();
            this.RtcPeer = new wrtc.RTCPeerConnection(Settings.RtcConfig);
            this.RtcTrack = this.RtcSource.createTrack();
            this.RtcPeer.addTrack(this.RtcTrack);
            this.RtcPeer.onicecandidate = this.OnIceCandidate.bind(this);
            let offer = yield this.RtcPeer.createOffer();
            yield this.RtcPeer.setLocalDescription(new wrtc.RTCSessionDescription(offer));
            this.SendText(JSON.stringify({
                "type": "offer",
                "data": offer
            }));
        });
    }
    InsertRtcData(data) {
        if (!this.RtcSource)
            return;
        this.RtcSource.onData(data);
    }
    OnIceCandidate(e) {
        if (e.candidate) {
            this.SendText(JSON.stringify({
                "type": "candidate",
                "data": e.candidate
            }));
        }
    }
}
class StreamServer {
    constructor(port, channels, sampleRate) {
        this.Port = port;
        this.Channels = channels;
        this.SampleRate = sampleRate;
        this.Clients = new Set();
        this.RtcClients = new Set();
        this.FallbackClients = {
            "wav": new Set(),
            "mp3": new Set()
        };
        this.FallbackProvider = {};
        if (Settings.FallbackUseMp3) {
            this.FallbackProvider["mp3"] = AFallbackProvider.Create(this, "mp3");
        }
        if (Settings.FallbackUseWav) {
            this.FallbackProvider["wav"] = AFallbackProvider.Create(this, "wav");
        }
        this.StdIn = process.stdin;
        this.SamplesCount = this.SampleRate / 100;
        this.Samples = new Int16Array(this.Channels * this.SamplesCount);
        this.SamplesPosition = 0;
    }
    Run() {
        this.Server = new ws.Server({
            "port": this.Port,
            "clientTracking": true,
            "perMessageDeflate": false
        });
        this.Server.on('connection', this.OnServerConnection.bind(this));
        this.StdIn.on('data', this.OnStdInData.bind(this));
        this.StdIn.resume();
    }
    BroadcastBinary(format, buffer) {
        this.FallbackClients[format].forEach((function each(client) {
            client.SendBinary(buffer);
        }).bind(this));
    }
    OnStdInData(buffer) {
        for (let i = 0; i < buffer.length; i += 2) {
            this.Samples[this.SamplesPosition] = buffer.readInt16LE(i);
            this.SamplesPosition++;
            if (this.SamplesPosition >= this.Samples.length) {
                let data = {
                    "samples": this.Samples,
                    "sampleRate": this.SampleRate,
                    "bitsPerSample": 16,
                    "channelCount": this.Channels,
                    "numberOfFrames": this.SamplesCount,
                };
                this.RtcClients.forEach((function each(client) {
                    client.InsertRtcData(data);
                }).bind(this));
                this.Samples = new Int16Array(this.Channels * this.SamplesCount);
                this.SamplesPosition = 0;
            }
        }
        for (let format in this.FallbackProvider) {
            this.FallbackProvider[format].InsertData(buffer);
        }
    }
    OnServerConnection(socket, _request) {
        this.Clients.add(new StreamClient(this, socket));
    }
    SetFallback(client, format) {
        if (format != "mp3" && format != "wav") {
            this.DestroyClient(client);
            return;
        }
        this.FallbackClients[format].add(client);
        this.FallbackProvider[format].PrimeClient(client);
    }
    SetWebRtc(client) {
        this.RtcClients.add(client);
        client.StartRtc();
    }
    DestroyClient(client) {
        this.FallbackClients["mp3"].delete(client);
        this.FallbackClients["wav"].delete(client);
        this.RtcClients.delete(client);
        this.Clients.delete(client);
        client.Destroy();
    }
    static Create(options) {
        if (!options["-port"])
            throw new Error("Port undefined. Please use -port to define the port.");
        if (typeof options["-port"] !== "number" || options["-port"] !== Math.floor(options["-port"]) || options["-port"] < 1 || options["-port"] > 65535)
            throw new Error("Invalid port. Must be natural number between 1 and 65535.");
        if (!options["-channels"])
            throw new Error("Channels undefined. Please use -channels to define the number of channels.");
        if (typeof options["-channels"] !== "number" || options["-channels"] !== Math.floor(options["-channels"]) ||
            !(options["-channels"] == 1 || options["-channels"] == 2))
            throw new Error("Invalid channels. Must be either 1 or 2.");
        if (!options["-samplerate"])
            throw new Error("Sample rate undefined. Please use -samplerate to define the sample rate.");
        if (typeof options["-samplerate"] !== "number" || options["-samplerate"] !== Math.floor(options["-samplerate"]) || options["-samplerate"] < 1)
            throw new Error("Invalid sample rate. Must be natural number greater than 0.");
        return new StreamServer(options["-port"], options["-channels"], options["-samplerate"]);
    }
}
class AFallbackProvider {
    constructor(server) {
        this.Server = server;
        this.Process = (0, child_process_1.spawn)(FFmpeg_command, this.GetFFmpegArguments(), { shell: false, detached: false, stdio: ['pipe', 'pipe', 'ignore'] });
        this.Process.stdout.addListener('data', this.OnData.bind(this));
    }
    InsertData(buffer) {
        this.Process.stdin.write(buffer);
    }
    static Create(server, format) {
        if (format == "mp3") {
            return new FallbackProviderMp3(server);
        }
        else if (format == "wav") {
            return new FallbackProviderWav(server, 384);
        }
    }
}
class FallbackProviderMp3 extends AFallbackProvider {
    constructor(server) {
        super(server);
    }
    GetFFmpegArguments() {
        return [
            "-fflags", "+nobuffer+flush_packets", "-flags", "low_delay", "-rtbufsize", "32", "-probesize", "32",
            "-f", "s16le",
            "-ar", this.Server.SampleRate.toString(),
            "-ac", this.Server.Channels.toString(),
            "-i", "pipe:0",
            "-c:a", "libmp3lame",
            "-b:a", Settings.FallbackMp3Bitrate.toString() + "k",
            "-ac", "1",
            "-reservoir", "0",
            "-f", "mp3", "-write_xing", "0", "-id3v2_version", "0",
            "-fflags", "+nobuffer", "-flush_packets", "1",
            "pipe:1"
        ];
    }
    OnData(chunk) {
        this.Server.BroadcastBinary("mp3", chunk);
    }
    PrimeClient(_) {
    }
}
class FallbackProviderWav extends AFallbackProvider {
    constructor(server, chunkSize) {
        super(server);
        if (typeof chunkSize !== "number" || chunkSize !== Math.floor(chunkSize) || chunkSize < 1)
            throw new Error("Invalid ChunkSize. Must be natural number greater than or equal to 1.");
        this.ChunkSize = chunkSize;
        this.ChunkBuffer = Buffer.alloc(0);
        this.HeaderBuffer = new Array();
    }
    GetFFmpegArguments() {
        return [
            "-fflags", "+nobuffer+flush_packets", "-flags", "low_delay", "-rtbufsize", "32", "-probesize", "32",
            "-f", "s16le",
            "-ar", this.Server.SampleRate.toString(),
            "-ac", this.Server.Channels.toString(),
            "-i", "pipe:0",
            "-c:a", "pcm_s16le",
            "-ar", Settings.FallbackWavSampleRate.toString(),
            "-ac", "1",
            "-f", "wav",
            "-flush_packets", "1", "-fflags", "+nobuffer", "-chunk_size", "384", "-packetsize", "384",
            "pipe:1"
        ];
    }
    OnData(chunk) {
        // Check if riff for wav
        if (this.HeaderBuffer.length == 0) {
            // Check if chunk is a header page
            let isHeader = (chunk[0] == 0x52 && chunk[1] == 0x49 && chunk[2] == 0x46 && chunk[3] == 0x46);
            if (isHeader) {
                this.HeaderBuffer.push(chunk);
                this.Server.BroadcastBinary("wav", chunk);
            }
        }
        else {
            this.ChunkBuffer = Buffer.concat(new Array(this.ChunkBuffer, chunk), this.ChunkBuffer.length + chunk.length);
            if (this.ChunkBuffer.length >= this.ChunkSize) {
                let chunkBuffer = this.ChunkBuffer;
                this.ChunkBuffer = Buffer.alloc(0);
                this.Server.BroadcastBinary("wav", chunkBuffer);
            }
        }
    }
    PrimeClient(client) {
        let headerBuffer = this.HeaderBuffer;
        for (let i = 0; i < headerBuffer.length; i++) {
            client.SendBinary(headerBuffer[i]);
        }
    }
}
const OptionParser = {
    "-port": function (txt) { return parseInt(txt, 10); },
    "-channels": function (txt) { return parseInt(txt, 10); },
    "-samplerate": function (txt) { return parseInt(txt, 10); }
};
const Options = {};
// Parse parameters
for (let i = 2; i < (process.argv.length - 1); i += 2) {
    if (!OptionParser[process.argv[i]])
        throw new Error("Invalid argument: '" + process.argv[i] + "'.");
    if (Options[process.argv[i]])
        throw new Error("Redefined argument: '" + process.argv[i] + "'. Please use '" + process.argv[i] + "' only ONCE");
    Options[process.argv[i]] = OptionParser[process.argv[i]](process.argv[i + 1]);
}
const Server = StreamServer.Create(Options);
Server.Run();
//# sourceMappingURL=3las.server.js.map