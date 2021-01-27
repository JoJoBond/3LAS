"use strict";
/*
    Stdin streamer is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws = __importStar(require("ws"));
class StdInStreamer {
    constructor(port) {
        if (typeof port !== "number" || port !== Math.floor(port) || port < 1 || port > 65535)
            throw new Error("Invalid Port. Must be natural number between 1 and 65535.");
        this.SendOptions = {
            compress: false,
            binary: true
        };
        this.Port = port;
        this.StdIn = process.stdin;
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
    Broadcast(data) {
        this.Server.clients.forEach((function each(client) {
            if (client.readyState != ws.OPEN)
                return;
            client.send(data, this.SendOptions);
        }).bind(this));
    }
    OnServerConnection(socket, _request) {
        socket.on('error', (_err) => { this.OnClientError(socket); });
        socket.on('message', (_data) => { this.OnClientError(socket); });
    }
    OnClientError(socket) {
        try {
            socket.close();
        }
        catch (ex) {
        }
    }
    static Create(format, options) {
        if (format == "mpeg") {
            return new StdInStreamer_MPEG(options["-port"]);
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
        else if (format == "aac") {
            return new StdInStreamer_AAC(options["-port"]);
        }
        else {
            throw new Error("Invalid Type. Must be either mpeg, aac, wav, pcm or ogg.");
        }
    }
}
class StdInStreamer_MPEG extends StdInStreamer {
    constructor(port) {
        super(port);
    }
    OnStdInData(chunk) {
        this.Broadcast(chunk);
    }
    OnServerConnection(socket, request) {
        super.OnServerConnection(socket, request);
    }
}
class StdInStreamer_AAC extends StdInStreamer {
    constructor(port) {
        super(port);
    }
    OnStdInData(chunk) {
        this.Broadcast(chunk);
    }
    OnServerConnection(socket, request) {
        super.OnServerConnection(socket, request);
    }
}
class StdInStreamer_WAV extends StdInStreamer {
    constructor(port, chunkSize) {
        super(port);
        if (typeof chunkSize !== "number" || chunkSize !== Math.floor(chunkSize) || chunkSize < 1)
            throw new Error("Invalid ChunkSize. Must be natural number greater than or equal to 1.");
        this.ChunkSize = chunkSize;
        this.ChunkBuffer = Buffer.alloc(0);
        this.HeaderBuffer = new Array();
    }
    OnStdInData(chunk) {
        // Check if riff for wav
        if (this.HeaderBuffer.length == 0) {
            // Check if chunk is a header page
            let isHeader = (chunk[0] == 0x52 && chunk[1] == 0x49 && chunk[2] == 0x46 && chunk[3] == 0x46);
            if (isHeader) {
                this.HeaderBuffer.push(chunk);
                this.Broadcast(chunk);
            }
        }
        else {
            this.ChunkBuffer = Buffer.concat(new Array(this.ChunkBuffer, chunk), this.ChunkBuffer.length + chunk.length);
            if (this.ChunkBuffer.length >= this.ChunkSize) {
                let chunkBuffer = this.ChunkBuffer;
                this.ChunkBuffer = Buffer.alloc(0);
                this.Broadcast(chunkBuffer);
            }
        }
    }
    OnServerConnection(socket, request) {
        super.OnServerConnection(socket, request);
        let headerBuffer = this.HeaderBuffer;
        for (let i = 0; i < headerBuffer.length; i++) {
            socket.send(headerBuffer[i], this.SendOptions);
        }
    }
}
class StdInStreamer_PCM extends StdInStreamer {
    constructor(port) {
        super(port);
    }
    OnStdInData(chunk) {
        this.Broadcast(chunk);
    }
    OnServerConnection(socket, request) {
        super.OnServerConnection(socket, request);
    }
}
class StdInStreamer_OGG extends StdInStreamer {
    constructor(port) {
        super(port);
        this.HeaderBuffer = new Array();
    }
    OnStdInData(chunk) {
        // Check if vorbis / opus headers for ogg
        // Read absolute granule position
        let absolute_granule_position = chunk[6] | chunk[7] << 8 | chunk[8] << 16 | chunk[9] << 24 |
            chunk[10] << 32 | chunk[11] << 40 | chunk[12] << 48 | chunk[13] << 56;
        // Check if page is a header candidate
        if (absolute_granule_position === 0x0000000000000000) {
            let page_segments = chunk[26];
            let idx = 27 + page_segments;
            // Check if magic number of headers match
            if ((idx + 3) < chunk.length && // 'Opus''
                (chunk[idx] == 0x4F && chunk[idx + 1] == 0x70 && chunk[idx + 2] == 0x75 && chunk[idx + 3] == 0x73) ||
                ((idx + 6) < chunk.length) && // 'vorbis'
                    (chunk[idx + 1] == 0x76 && chunk[idx + 2] == 0x6f && chunk[idx + 3] == 0x72 && chunk[idx + 4] == 0x62 && chunk[idx + 5] == 0x69 && chunk[idx + 6] == 0x73)) {
                this.HeaderBuffer.push(chunk);
            }
        }
        this.Broadcast(chunk);
    }
    OnServerConnection(socket, request) {
        super.OnServerConnection(socket, request);
        let headerBuffer = this.HeaderBuffer;
        for (let i = 0; i < headerBuffer.length; i++) {
            socket.send(headerBuffer[i], this.SendOptions);
        }
    }
}
const OptionParser = {
    "-type": function (txt) { return txt; },
    "-port": function (txt) { return parseInt(txt, 10); },
    "-chunksize": function (txt) { return parseInt(txt, 10); }
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
// Sanity check
if (!Options["-type"])
    throw new Error("Type undefined. Please use -type to define the datatype (mpeg, wav, aac, pcm, ogg).");
const Streamer = StdInStreamer.Create(Options["-type"], Options);
Streamer.Run();
//# sourceMappingURL=3las.stdinstreamer.js.map