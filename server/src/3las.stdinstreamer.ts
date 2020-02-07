/*
	Stdin streamer is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

import { ReadStream } from "tty";
import { IncomingMessage } from "http";
import * as ws from "ws";

abstract class StdInStreamer {
    private readonly StdIn: ReadStream;
    private readonly Port: number;
    protected readonly SendOptions: object;
    private Server: ws.Server;

    constructor(port: number) {
        if (typeof port !== "number" || port !== Math.floor(port) || port < 1 || port > 65535)
            throw new Error("Invalid Port. Must be natural number between 1 and 65535.");

        this.SendOptions = {
            compress: false,
            binary: true
        };

        this.Port = port;
        this.StdIn = process.stdin;
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

    protected Broadcast(data: Buffer) {
        this.Server.clients.forEach((function each(client: ws) {
            if (client.readyState != ws.OPEN)
                return;

            client.send(data, this.SendOptions);
        }).bind(this));
    }

    protected abstract OnStdInData(chunk: Buffer): void;
    protected abstract OnServerConnection(socket: ws, request: IncomingMessage): void;

    public static Create(format: string, options: Record<string, number>) {
        
        if (format == "mpeg") {
            if (!options["-burstsize"])
                throw new Error("BurstSize undefined. Please use -burstsize to define the burst size.");
            
            return new StdInStreamer_MPEG(options["-port"], options["-burstsize"]);
        }
        else if (format == "wav") {
            if (!options["-chunksize"])
                throw new Error("ChunkSize undefined. Please use -chunksize to define the chunk size.");
            
            return new StdInStreamer_WAV(options["-port"], options["-chunksize"]);
        }
        else if (format == "pcm") {
            return new StdInStreamer_PCM(options["-port"]);

        }
        else if (format == "ogg") {
            return new StdInStreamer_OGG(options["-port"]);
        }
        else {
            throw new Error("Invalid Type. Must be either mpeg, wav, pcm or ogg.");
        }
    }
}

class StdInStreamer_MPEG extends StdInStreamer {
    private readonly BurstSize: number;
    private BurstBuffer: Array<Buffer>;

    constructor(port: number, burstSize: number) {
        super(port);

        if (typeof burstSize !== "number" || burstSize !== Math.floor(burstSize) || burstSize < 0)
            throw new Error("Invalid BurstSize. Must be natural number greater than or equal to 0.");

        this.BurstSize = burstSize;
        this.BurstBuffer = new Array();
    }

    protected OnStdInData(chunk: Buffer): void {
        // Update burst data
        if (this.BurstBuffer.length >= this.BurstSize)
            this.BurstBuffer.shift();
    
        this.BurstBuffer.push(chunk);
    
        this.Broadcast(chunk);
    }
    
    protected OnServerConnection(socket: ws, _request: IncomingMessage): void {
        let burstBuffer: Array<Buffer> = this.BurstBuffer;
    
        for (let i: number = 0; i < burstBuffer.length; i++) {
            socket.send(burstBuffer[i], this.SendOptions);
        }
    }
}

class StdInStreamer_WAV extends StdInStreamer {
    private readonly ChunkSize: number;
    private ChunkBuffer: Buffer;
    private HeaderBuffer: Array<Buffer>;

    constructor(port: number, chunkSize: number) {
        super(port);

        if (typeof chunkSize !== "number" || chunkSize !== Math.floor(chunkSize) || chunkSize < 1)
            throw new Error("Invalid ChunkSize. Must be natural number greater than or equal to 1.");

        this.ChunkSize = chunkSize;
        this.ChunkBuffer = Buffer.alloc(0);
        this.HeaderBuffer = new Array();
    }

    protected OnStdInData(chunk: Buffer): void {
        // Check if riff for wav
        if (this.HeaderBuffer.length == 0) {
            // Check if chunk is a header page
            let isHeader: boolean = (chunk[0] == 0x52 && chunk[1] == 0x49 && chunk[2] == 0x46 && chunk[3] == 0x46);

            if (isHeader) {
                this.HeaderBuffer.push(chunk);

                this.Broadcast(chunk);
            }
        }
        else {
            this.ChunkBuffer = Buffer.concat(new Array(this.ChunkBuffer, chunk), this.ChunkBuffer.length + chunk.length);

            if (this.ChunkBuffer.length >= this.ChunkSize) {
                let chunkBuffer: Buffer = this.ChunkBuffer;
                this.ChunkBuffer = Buffer.alloc(0);

                this.Broadcast(chunkBuffer);
            }
        }
    }
    
    protected OnServerConnection(socket: ws, _request: IncomingMessage): void {
        let headerBuffer: Array<Buffer> = this.HeaderBuffer;
    
        for (let i: number = 0; i < headerBuffer.length; i++) {
            socket.send(headerBuffer[i], this.SendOptions);
        }
    }
}

class StdInStreamer_PCM extends StdInStreamer {
    constructor(port: number) {
        super(port);
    }

    protected OnStdInData(chunk: Buffer): void {
        this.Broadcast(chunk);
    }

    protected OnServerConnection(socket: ws, _request: IncomingMessage): void {
    }
}

class StdInStreamer_OGG extends StdInStreamer {
    private HeaderBuffer: Array<Buffer>;

    constructor(port: number) {
        super(port);

        this.HeaderBuffer = new Array();
    }

    protected OnStdInData(chunk: Buffer): void {
        // Check if vorbis / opus headers for ogg

        // Read absolute granule position
        let absolute_granule_position: number = chunk[6] | chunk[7] << 8 | chunk[8] << 16 | chunk[9] << 24 |
        chunk[10] << 32 | chunk[11] << 40 | chunk[12] << 48 | chunk[13] << 56;

        // Check if page is a header candidate
        if (absolute_granule_position === 0x0000000000000000) {
            let page_segments: number = chunk[26];

            let idx: number = 27 + page_segments;

            // Check if magic number of headers match
            if ((idx + 3) < chunk.length && // 'Opus''
                (chunk[idx] == 0x4F && chunk[idx + 1] == 0x70 && chunk[idx + 2] == 0x75 && chunk[idx + 3] == 0x73) ||
                ((idx + 6) < chunk.length) && // 'vorbis'
                (chunk[idx + 1] == 0x76 && chunk[idx + 2] == 0x6f && chunk[idx + 3] == 0x72 && chunk[idx + 4] == 0x62 && chunk[idx + 5] == 0x69 && chunk[idx + 6] == 0x73))
            {
                this.HeaderBuffer.push(chunk);
            }
        }
        
        this.Broadcast(chunk);
    }
    
    protected OnServerConnection(socket: ws, _request: IncomingMessage): void {
        let headerBuffer: Array<Buffer> = this.HeaderBuffer;

        for (let i: number = 0; i < headerBuffer.length; i++) {
            socket.send(headerBuffer[i], this.SendOptions);
        }
    }
}

const OptionParser: Record<string,(txt: string) => (number| string)> = {
    "-type": function (txt: string) { return txt; }, 
    "-port": function (txt: string) { return parseInt(txt, 10); },
    "-chunksize": function (txt: string) { return parseInt(txt, 10); },
    "-burstsize": function (txt: string) { return parseInt(txt, 10); }
};

const Options: Record<string, number| string> = {};

// Parse parameters
for (let i: number = 2; i < (process.argv.length - 1); i += 2) {
    if (!OptionParser[process.argv[i]])
        throw new Error("Invalid argument: '" + process.argv[i] + "'.");

    if (Options[process.argv[i]])
        throw new Error("Redefined argument: '" + process.argv[i] + "'. Please use '" + process.argv[i] + "' only ONCE");

    Options[process.argv[i]] = OptionParser[process.argv[i]](process.argv[i + 1]);
}

// Sanity check
if (!Options["-type"])
    throw new Error("Type undefined. Please use -type to define the datatype (mpeg, wav, pcm, ogg).");

const Streamer: StdInStreamer = StdInStreamer.Create(<string>Options["-type"], <Record<string, number>>Options);
Streamer.Run();