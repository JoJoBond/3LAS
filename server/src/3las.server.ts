/*
    Stdin streamer is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/

import { ReadStream } from "tty";
import { IncomingMessage } from "http";
import { readFileSync } from "fs";
import { ChildProcess, spawn } from "child_process";
import * as ws from "ws";

const wrtc = require('wrtc');

interface ISettings {
    RtcConfig: any,
    FallbackFFmpegPath: string,
    FallbackUseMp3: boolean,
    FallbackUseWav: boolean,
    FallbackMp3Bitrate: number,
    FallbackWavSampleRate: number,
    AdminKey: string,
}

interface IStats {
    Total: number,
    Rtc: number,
    Fallback: Record<"wav" | "mp3", number>
}

const Settings: ISettings = JSON.parse(readFileSync('settings.json', 'utf-8'));

const FFmpeg_command: string = (() => {
    if (process.platform === 'win32')
        return Settings.FallbackFFmpegPath;
    else if (process.platform === 'linux')
        return "ffmpeg";
})();

class RtcProvider {
    private RtcSourcePeer: RTCPeerConnection;
    private RtcSourceMediaSource: any;
    private RtcSourceTrack: any;

    private RtcDistributePeer: RTCPeerConnection;
    private RtcDistributeTrack: any;

    constructor() {
        this.RtcDistributePeer = new wrtc.RTCPeerConnection(Settings.RtcConfig);
        this.RtcDistributePeer.addTransceiver('audio');
        this.RtcDistributePeer.ontrack = this.OnTrack.bind(this);
        this.RtcDistributePeer.onicecandidate = this.OnIceCandidate_Distribute.bind(this);

        this.RtcSourcePeer = new wrtc.RTCPeerConnection(Settings.RtcConfig);
        this.RtcSourceMediaSource = new wrtc.nonstandard.RTCAudioSource();
        this.RtcSourceTrack = this.RtcSourceMediaSource.createTrack();
        this.RtcSourcePeer.addTrack(this.RtcSourceTrack);
        this.RtcSourcePeer.onicecandidate = this.OnIceCandidate_Source.bind(this);

        this.Init();
    }

    public async Init(): Promise<void> {
        let offer = await this.RtcSourcePeer.createOffer();

        await this.RtcSourcePeer.setLocalDescription(new wrtc.RTCSessionDescription(offer));

        await this.RtcDistributePeer.setRemoteDescription(offer);

        let answer = await this.RtcDistributePeer.createAnswer();

        await this.RtcDistributePeer.setLocalDescription(new wrtc.RTCSessionDescription(answer));

        await this.RtcSourcePeer.setRemoteDescription(new wrtc.RTCSessionDescription(answer));
    }

    private OnTrack(event: RTCTrackEvent): void {
        this.RtcDistributeTrack = event.track;
    }

    private OnIceCandidate_Distribute(e: any): void {
        if (!e.candidate)
            return;

        (async () => await this.RtcSourcePeer.addIceCandidate(e.candidate))();
    }

    private OnIceCandidate_Source(e: any): void {
        if (!e.candidate)
            return;

        (async () => await this.RtcDistributePeer.addIceCandidate(e.candidate))();
    }

    public InsertMediaData(data: any): void {
        if (!this.RtcSourceMediaSource)
            return;
        this.RtcSourceMediaSource.onData(data);
    }

    public GetTrack(): any {
        return this.RtcDistributeTrack;
    }
}

class StreamClient {
    private readonly Server: StreamServer;
    private readonly Socket: ws;
    private readonly BinaryOptions: object;

    private RtcPeer: RTCPeerConnection;
    private RtcTrack: MediaStreamTrack;
    private RtcSender: RTCRtpSender;

    constructor(server: StreamServer, socket: ws) {
        this.Server = server;
        this.Socket = socket;

        this.BinaryOptions = {
            compress: false,
            binary: true
        };

        this.Socket.on('error', this.OnError.bind(this));
        this.Socket.on('message', this.OnMessage.bind(this));
    }

    private OnMessage(message: ws.Data, isBinary: boolean): void {
        try {
            let request: any = JSON.parse(message.toString());

            if (request.type == "answer") {
                (async () => await this.RtcPeer.setRemoteDescription(new wrtc.RTCSessionDescription(request.data)))();
            }
            else if (request.type == "webrtc") {
                this.Server.SetWebRtc(this);
            }
            else if (request.type == "fallback") {
                this.Server.SetFallback(this, request.data)
            }
            else if (request.type == "stats") {
                if (Settings.AdminKey && request.data == Settings.AdminKey) {
                    this.SendText(JSON.stringify({
                        "type": "stats",
                        "data": this.Server.GetStats(),
                    }));
                }
            }
            else {
                this.OnError(null);
                return;
            }
        }
        catch {
            this.OnError(null);
            return;
        }
    }

    private OnError(_err: Error): void {
        this.Server.DestroyClient(this);
    }

    public Destroy(): void {
        try {
            this.Socket.close();
        }
        catch (ex) {
        }

        if (this.RtcSender && this.RtcPeer)
            this.RtcPeer.removeTrack(this.RtcSender);

        if (this.RtcSender)
            this.RtcSender = null;

        if (this.RtcTrack)
            this.RtcTrack = null;

        if (this.RtcPeer) {
            this.RtcPeer.close();
            delete this.RtcPeer;
            this.RtcPeer = null;
        }
    }

    public SendBinary(buffer: Buffer): void {
        if (this.Socket.readyState != ws.OPEN) {
            this.OnError(null);
            return;
        }

        this.Socket.send(buffer, this.BinaryOptions);
    }

    public SendText(text: string): void {
        if (this.Socket.readyState != ws.OPEN) {
            this.OnError(null);
            return;
        }

        this.Socket.send(text);
    }

    public async StartRtc(track: any): Promise<void> {
        this.RtcPeer = new wrtc.RTCPeerConnection(Settings.RtcConfig);

        this.RtcTrack = track;

        this.RtcSender = this.RtcPeer.addTrack(this.RtcTrack);

        this.RtcPeer.onconnectionstatechange = this.OnConnectionStateChange.bind(this);

        this.RtcPeer.onicecandidate = this.OnIceCandidate.bind(this);

        let offer = await this.RtcPeer.createOffer();

        await this.RtcPeer.setLocalDescription(new wrtc.RTCSessionDescription(offer));

        this.SendText(JSON.stringify({
            "type": "offer",
            "data": offer
        }));
    }

    private OnConnectionStateChange(e: Event): void {
        if (!this.RtcPeer)
            return;

        let state: RTCPeerConnectionState = this.RtcPeer.connectionState;
        if (state != "new" && state != "connecting" && state != "connected")
            this.OnError(null);
    }

    private OnIceCandidate(e: any): void {
        if (e.candidate) {
            this.SendText(JSON.stringify({
                "type": "candidate",
                "data": e.candidate
            }));
        }
    }
}

class StreamServer {
    private readonly Port: number;
    public readonly Channels: number;
    public readonly SampleRate: number;

    private readonly FallbackProvider: Record<"wav" | "mp3", AFallbackProvider>;
    private readonly Clients: Set<StreamClient>;
    private readonly RtcClients: Set<StreamClient>;
    private readonly FallbackClients: Record<"wav" | "mp3", Set<StreamClient>>;
    private readonly StdIn: ReadStream;
    private readonly RtcProvider: RtcProvider;

    private SamplesPosition: number;
    private Samples: Int16Array;
    private SamplesCount: number;
    private Server: ws.Server;

    private constructor(port: number, channels: number, sampleRate: number) {
        this.Port = port;
        this.Channels = channels;
        this.SampleRate = sampleRate;

        this.RtcProvider = new RtcProvider();
        this.Clients = new Set<StreamClient>();
        this.RtcClients = new Set<StreamClient>();
        this.FallbackClients = {
            "wav": new Set<StreamClient>(),
            "mp3": new Set<StreamClient>()
        };

        this.FallbackProvider = {} as Record<"wav" | "mp3", AFallbackProvider>;

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

    public Run(): void {
        this.Server = new ws.Server({
            "port": this.Port,
            "clientTracking": true,
            "perMessageDeflate": false
        });

        this.Server.on('connection', this.OnServerConnection.bind(this));

        this.StdIn.on('data', this.OnStdInData.bind(this));
        this.StdIn.resume();
    }

    public BroadcastBinary(format: "wav" | "mp3", buffer: Buffer): void {
        this.FallbackClients[format].forEach((function each(client: StreamClient) {
            client.SendBinary(buffer);
        }).bind(this))
    }

    private OnStdInData(buffer: Buffer): void {
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

                this.RtcProvider.InsertMediaData(data);

                this.Samples = new Int16Array(this.Channels * this.SamplesCount);
                this.SamplesPosition = 0;
            }
        }

        for (let format in this.FallbackProvider) {
            this.FallbackProvider[(format as "wav" | "mp3")].InsertData(buffer);
        }
    }

    private OnServerConnection(socket: ws, _request: IncomingMessage): void {
        this.Clients.add(new StreamClient(this, socket));
    }

    public SetFallback(client: StreamClient, format: string): void {
        if (format != "mp3" && format != "wav") {
            this.DestroyClient(client);
            return;
        }

        this.FallbackClients[format].add(client);

        this.FallbackProvider[format].PrimeClient(client);
    }

    public SetWebRtc(client: StreamClient): void {
        this.RtcClients.add(client);
        client.StartRtc(this.RtcProvider.GetTrack());
    }

    public DestroyClient(client: StreamClient): void {
        this.FallbackClients["mp3"].delete(client);
        this.FallbackClients["wav"].delete(client);
        this.RtcClients.delete(client);
        this.Clients.delete(client);
        client.Destroy();
    }

    public GetStats(): IStats {
        let rtc: number = this.RtcClients.size;
        let fallback: Record<"wav" | "mp3", number> = {
            "wav": (this.FallbackClients["wav"] ? this.FallbackClients["wav"].size : 0),
            "mp3": (this.FallbackClients["mp3"] ? this.FallbackClients["mp3"].size : 0),
        }
        let total: number = rtc;

        for (let format in fallback) {
            total += fallback[(format as "wav" | "mp3")];
        }

        return {
            "Total": total,
            "Rtc": rtc,
            "Fallback": fallback,
        };
    }

    public static Create(options: Record<string, number>): StreamServer {

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

abstract class AFallbackProvider {
    protected readonly Server: StreamServer;
    protected readonly Process: ChildProcess;

    constructor(server: StreamServer) {
        this.Server = server;
        this.Process = spawn(FFmpeg_command, this.GetFFmpegArguments(), { shell: false, detached: false, stdio: ['pipe', 'pipe', 'ignore'] });
        this.Process.stdout.addListener('data', this.OnData.bind(this));
    }

    public InsertData(buffer: Buffer): void {
        this.Process.stdin.write(buffer);
    }

    protected abstract GetFFmpegArguments(): string[];

    protected abstract OnData(chunk: Buffer): void;

    public abstract PrimeClient(client: StreamClient): void;

    public static Create(server: StreamServer, format: "wav" | "mp3"): AFallbackProvider {

        if (format == "mp3") {
            return new FallbackProviderMp3(server);
        }
        else if (format == "wav") {
            return new FallbackProviderWav(server, 384);
        }
    }
}

class FallbackProviderMp3 extends AFallbackProvider {
    constructor(server: StreamServer) {
        super(server);
    }

    protected GetFFmpegArguments(): string[] {
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

    protected OnData(chunk: Buffer): void {
        this.Server.BroadcastBinary("mp3", chunk);
    }

    public PrimeClient(_: StreamClient): void {
    }
}

class FallbackProviderWav extends AFallbackProvider {
    private readonly ChunkSize: number;
    private ChunkBuffer: Buffer;
    private HeaderBuffer: Array<Buffer>;

    constructor(server: StreamServer, chunkSize: number) {
        super(server);

        if (typeof chunkSize !== "number" || chunkSize !== Math.floor(chunkSize) || chunkSize < 1)
            throw new Error("Invalid ChunkSize. Must be natural number greater than or equal to 1.");

        this.ChunkSize = chunkSize;
        this.ChunkBuffer = Buffer.alloc(0);
        this.HeaderBuffer = new Array();
    }

    protected GetFFmpegArguments(): string[] {
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

    protected OnData(chunk: Buffer): void {
        // Check if riff for wav
        if (this.HeaderBuffer.length == 0) {
            // Check if chunk is a header page
            let isHeader: boolean = (chunk[0] == 0x52 && chunk[1] == 0x49 && chunk[2] == 0x46 && chunk[3] == 0x46);

            if (isHeader) {
                this.HeaderBuffer.push(chunk);

                this.Server.BroadcastBinary("wav", chunk);
            }
        }
        else {
            this.ChunkBuffer = Buffer.concat(new Array(this.ChunkBuffer, chunk), this.ChunkBuffer.length + chunk.length);

            if (this.ChunkBuffer.length >= this.ChunkSize) {
                let chunkBuffer: Buffer = this.ChunkBuffer;
                this.ChunkBuffer = Buffer.alloc(0);

                this.Server.BroadcastBinary("wav", chunkBuffer);
            }
        }
    }

    public PrimeClient(client: StreamClient): void {
        let headerBuffer: Array<Buffer> = this.HeaderBuffer;

        for (let i: number = 0; i < headerBuffer.length; i++) {
            client.SendBinary(headerBuffer[i]);
        }
    }
}

const OptionParser: Record<string, (txt: string) => (number)> = {
    "-port": function (txt: string) { return parseInt(txt, 10); },
    "-channels": function (txt: string) { return parseInt(txt, 10); },
    "-samplerate": function (txt: string) { return parseInt(txt, 10); }
};

const Options: Record<string, number> = {};

// Parse parameters
for (let i: number = 2; i < (process.argv.length - 1); i += 2) {
    if (!OptionParser[process.argv[i]])
        throw new Error("Invalid argument: '" + process.argv[i] + "'.");

    if (Options[process.argv[i]])
        throw new Error("Redefined argument: '" + process.argv[i] + "'. Please use '" + process.argv[i] + "' only ONCE");

    Options[process.argv[i]] = OptionParser[process.argv[i]](process.argv[i + 1]);
}

const Server: StreamServer = StreamServer.Create(Options);
Server.Run();