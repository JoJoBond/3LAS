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
}

const Settings: ISettings = JSON.parse(readFileSync('settings.json', 'utf-8'));

const FFmpeg_command: string = (() => {
	if (process.platform === 'win32')
		return Settings.FallbackFFmpegPath;
	else if (process.platform === 'linux')
		return "ffmpeg";
})();

var test: boolean = false;
class StreamClient {
    private readonly Server: StreamServer;
    private readonly Socket: ws;
    private readonly BinaryOptions: object;

    private RtcSource: any;
    private RtcPeer: RTCPeerConnection;
    private RtcTrack: any;
    
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

    private OnMessage(message: ws.Data, isBinary: boolean) {
        try {
            let request: any = JSON.parse(message.toString());
            
            if(request.type == "answer")
            {
                (async () => await this.RtcPeer.setRemoteDescription(new wrtc.RTCSessionDescription(request.data)))();
            }
            else if(request.type == "webrtc")
            {
                this.Server.SetWebRtc(this);
            }
            else if (request.type == "fallback")
            {
                this.Server.SetFallback(this, request.data)
            }
            else
            {
                this.OnError(null);
                return;
            }
        }
        catch {
            this.OnError(null);
            return;
        }
    }

    private OnError(_err: Error) {
        this.Server.DestroyClient(this);
    }

    public Destroy() {
        try {
            this.Socket.close();
        }
        catch (ex) {
        }
        
        if(this.RtcTrack && this.RtcPeer)
            this.RtcPeer.removeTrack(this.RtcTrack);

        if(this.RtcTrack) {
            this.RtcTrack.stop();
            delete this.RtcTrack;
            this.RtcTrack = null;
        }

        if(this.RtcPeer) {
            this.RtcPeer.close();
            delete this.RtcPeer;
            this.RtcPeer = null;
        }
        
        if(this.RtcSource){
            this.RtcSource.close();
            delete this.RtcSource;
            this.RtcSource = null;
        }
    }

    public SendBinary (buffer: Buffer) {
        if (this.Socket.readyState != ws.OPEN) {
            this.OnError(null);
            return;
        }

        this.Socket.send(buffer, this.BinaryOptions);
    }

    public SendText (text: string) {
        if (this.Socket.readyState != ws.OPEN) {
            this.OnError(null);
            return;
        }

        this.Socket.send(text);
    }

    public async StartRtc(): Promise<void> {
        this.RtcSource = new wrtc.nonstandard.RTCAudioSource();

        this.RtcPeer = new wrtc.RTCPeerConnection(Settings.RtcConfig);

        this.RtcTrack = this.RtcSource.createTrack();

        this.RtcPeer.addTrack(this.RtcTrack);
        
        this.RtcPeer.onicecandidate = this.OnIceCandidate.bind(this);

        let offer = await this.RtcPeer.createOffer();

        await this.RtcPeer.setLocalDescription(new wrtc.RTCSessionDescription(offer));

        this.SendText(JSON.stringify({
            "type": "offer",
            "data": offer
        }),);
    }

    public InsertRtcData(data: any) {
        if(!this.RtcSource)
            return;
        this.RtcSource.onData(data);
    }

    private OnIceCandidate(e: any) {
        if (e.candidate)
        {
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

    private readonly FallbackProvider: Record<"wav"|"mp3", AFallbackProvider>;
    private readonly Clients: Set<StreamClient>;
    private readonly RtcClients: Set<StreamClient>;
    private readonly FallbackClients: Record<"wav"|"mp3", Set<StreamClient>>;
    private readonly StdIn: ReadStream;
    
    private SamplesPosition: number; 
    private Samples: Int16Array;
    private SamplesCount: number;
    private Server: ws.Server;

    private constructor(port: number, channels: number, sampleRate: number) {
        this.Port = port;
        this.Channels = channels;
        this.SampleRate = sampleRate;

        this.Clients = new Set<StreamClient>();
        this.RtcClients = new Set<StreamClient>();
        this.FallbackClients = {
            "wav": new Set<StreamClient>(),
            "mp3": new Set<StreamClient>()
        };

        this.FallbackProvider = {} as Record<"wav"|"mp3", AFallbackProvider>;

        if(Settings.FallbackUseMp3) {
            this.FallbackProvider["mp3"] = AFallbackProvider.Create(this, "mp3");
        }

        if(Settings.FallbackUseWav) {
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

    public BroadcastBinary(format: "wav"|"mp3", buffer: Buffer) {
        this.FallbackClients[format].forEach((function each(client: StreamClient) {
            client.SendBinary(buffer);
        }).bind(this))
    }

    private OnStdInData(buffer: Buffer): void {
        for (let i = 0; i < buffer.length; i += 2)
        {
            this.Samples[this.SamplesPosition] = buffer.readInt16LE(i);
            this.SamplesPosition++;
            
            if (this.SamplesPosition >= this.Samples.length)
            {
                let data = {
                    "samples": this.Samples,
                    "sampleRate": this.SampleRate,
                    "bitsPerSample": 16,
                    "channelCount" : this.Channels,
                    "numberOfFrames" : this.SamplesCount,
                };

                this.RtcClients.forEach((function each(client: StreamClient) {
                    client.InsertRtcData(data);
                }).bind(this))

                this.Samples = new Int16Array(this.Channels * this.SamplesCount);
                this.SamplesPosition = 0;
            }
        }

        for (let format in this.FallbackProvider) {
            this.FallbackProvider[(format as "wav"|"mp3")].InsertData(buffer);
        }
    }

    private OnServerConnection(socket: ws, _request: IncomingMessage): void {
        this.Clients.add(new StreamClient(this, socket));
    }

    public SetFallback(client: StreamClient, format: string): void {
        if(format != "mp3" && format != "wav") {
            this.DestroyClient(client);
            return;
        }

        this.FallbackClients[format].add(client);

        this.FallbackProvider[format].PrimeClient(client);
    }
        
    public SetWebRtc(client: StreamClient) {
        this.RtcClients.add(client);
        client.StartRtc();
    }

    public DestroyClient(client: StreamClient) : void {
        this.FallbackClients["mp3"].delete(client);
        this.FallbackClients["wav"].delete(client);
        this.RtcClients.delete(client);
        this.Clients.delete(client);
        client.Destroy();
    }

    public static Create(options: Record<string, number>) {

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

        if (typeof options["-samplerate"] !== "number" || options["-samplerate"] !== Math.floor(options["-samplerate"]) || options["-samplerate"] < 1 )
            throw new Error("Invalid sample rate. Must be natural number greater than 0.");

        return new StreamServer(options["-port"], options["-channels"], options["-samplerate"]);
    }
}

abstract class AFallbackProvider {
    protected readonly Server: StreamServer;
    protected readonly Process: ChildProcess;

    constructor(server: StreamServer) {
        this.Server = server;
        this.Process = spawn(FFmpeg_command, this.GetFFmpegArguments(), {shell: false, detached: false, stdio: ['pipe', 'pipe', 'ignore']});
        this.Process.stdout.addListener('data', this.OnData.bind(this));
    }

    public InsertData(buffer: Buffer) {
        this.Process.stdin.write(buffer);
    }

    protected abstract GetFFmpegArguments(): string[];

    protected abstract OnData(chunk: Buffer): void;

    public abstract PrimeClient(client: StreamClient): void;

    public static Create(server: StreamServer, format: "wav"|"mp3"): AFallbackProvider {
        
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
            "-ar",  Settings.FallbackWavSampleRate.toString(),
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

const OptionParser: Record<string,(txt: string) => (number)> = {
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