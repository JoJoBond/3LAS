"use strict";
/*
	Stdin-Streamer is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

const ws = require('ws');
const WebSocketServer = ws.Server;

function FormatStreamer (InSocket, Port) {
    if (typeof InSocket !== "object")
        throw new Error("Invalid InSocket. Must be a socket.");

    if (typeof Port !== "number" || Port !== Math.floor(Port) || Port < 1 || Port > 65535)
        throw new Error("Invalid Port. Must be natural number between 1 and 65535.");

    this._InSocket = InSocket;
    this._Port = Port;

    this._SocketListener = null;
};

FormatStreamer.prototype.__ClientConnected = function (socket) {
};

FormatStreamer.prototype.__StdInData = function (chunk) {
    // Broadcast to all clients
    this._SocketListener.clients.forEach( function each(client) {
        if (client.readyState === ws.OPEN) {
            client.send(chunk, { binary: true });
        }
    });
};

FormatStreamer.prototype.Run = function () {
    this._SocketListener = new WebSocketServer({ port: this._Port, clientTracking: true, perMessageDeflate: false });
    this._SocketListener.on('connection', this.__ClientConnected.bind(this));

    this._InSocket.on('data', this.__StdInData.bind(this));
    this._InSocket.resume();
};


function FormatStreamer_MP3 (InSocket, Port, BurstSize) {
    if (typeof BurstSize !== "number" || BurstSize !== Math.floor(BurstSize) || BurstSize < 0)
        throw new Error("Invalid BurstSize. Must be natural number greater than or equal to 0.");

    FormatStreamer.call(this, InSocket, Port);

    this._BurstSize = BurstSize;
    this._BurstBuffer = new Array();
};

FormatStreamer_MP3.prototype.__ClientConnected = function (socket) {
    let burstBuffer = this._BurstBuffer;

    for (var i = 0; i < burstBuffer.length; i++) {
        socket.send(burstBuffer[i], { binary: true });
    }
};

FormatStreamer_MP3.prototype.__StdInData = function (chunk) {
    // Update burst data
    if (this._BurstBuffer.length >= this._BurstSize)
        this._BurstBuffer.shift();

    this._BurstBuffer.push(chunk);

    FormatStreamer.prototype.__StdInData.call(this, chunk);
};

FormatStreamer_MP3.prototype.Run = function (chunk) {
    FormatStreamer.prototype.Run.call(this, chunk);
};


function FormatStreamer_WAV (InSocket, Port, ChunkSize) {
    if (typeof ChunkSize !== "number" || ChunkSize !== Math.floor(ChunkSize) || ChunkSize < 1)
        throw new Error("Invalid ChunkSize. Must be natural number greater than or equal to 1.");

    FormatStreamer.call(this, InSocket, Port);
    
    this._ChunkSize = ChunkSize;
    this._ChunkBuffer = new Buffer(0);
    this._HeaderBuffer = new Array();
};

FormatStreamer_WAV.prototype.__ClientConnected = function (socket) {
    let headerBuffer = this._HeaderBuffer;

    for (var i = 0; i < headerBuffer.length; i++) {
        socket.send(headerBuffer[i], { binary: true });
    }
};

FormatStreamer_WAV.prototype.__StdInData = function (chunk) {
    // Check if riff for wav
    if (this._HeaderBuffer.length === 0) {
        // Check if chunk is a header page
        let IsHeader = (chunk[0] == 0x52 && chunk[1] == 0x49 && chunk[2] == 0x46 && chunk[3] == 0x46);

        if (IsHeader) {
            this._HeaderBuffer.push(chunk);

            FormatStreamer.prototype.__StdInData.call(this, chunk);
        }
    }
    else {
        this._ChunkBuffer = Buffer.concat(new Array(this._ChunkBuffer, chunk), this._ChunkBuffer.length + chunk.length);

        let chunkBuffer = this._ChunkBuffer;
        if (chunkBuffer.length >= this._ChunkSize) {
            this._ChunkBuffer = new Buffer(0);

            this._SocketListener.clients.forEach(function each(client) {
                if (client.readyState === ws.OPEN) {
                    client.send(chunkBuffer, { binary: true });
                }
            });
        }
    }
};

FormatStreamer_WAV.prototype.Run = function (chunk) {
    FormatStreamer.prototype.Run.call(this, chunk);
};


function FormatStreamer_OGG (InSocket, Port) {
    FormatStreamer.call(this, InSocket, Port);

    this._HeaderBuffer = new Array();
};

FormatStreamer_OGG.prototype.__ClientConnected = function (socket) {
    let headerBuffer = this._HeaderBuffer;

    for (var i = 0; i < headerBuffer.length; i++) {
        socket.send(headerBuffer[i], { binary: true });
    }
};

FormatStreamer_OGG.prototype.__StdInData = function (chunk) {
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
            (chunk[idx + 1] == 0x76 && chunk[idx + 2] == 0x6f && chunk[idx + 3] == 0x72 && chunk[idx + 4] == 0x62 && chunk[idx + 5] == 0x69 && chunk[idx + 6] == 0x73))
        {
            this._HeaderBuffer.push(chunk);
        }
    }

    FormatStreamer.prototype.__StdInData.call(this, chunk);
};

FormatStreamer_OGG.prototype.Run = function (chunk) {
    FormatStreamer.prototype.Run.call(this, chunk);
};


let OptionParser = {
    "-type": function (txt) { return txt; }, 
    "-port": function (txt) { return parseInt(txt, 10); },
    "-chunksize": function (txt) { return parseInt(txt, 10); },
    "-burstsize": function (txt) { return parseInt(txt, 10); }
};

let Options = new Object();

// Parse parameters
for (var i = 2; i < (process.argv.length - 1); i += 2) {
    if (typeof OptionParser[process.argv[i]] === "undefined")
        throw new Error("Invalid argument: '" + process.argv[i] + "'.");

    if (typeof Options[process.argv[i]] !== "undefined")
        throw new Error("Redefined argument: '" + process.argv[i] + "'. Please use '" + process.argv[i] + "' only ONCE");

    Options[process.argv[i]] = OptionParser[process.argv[i]](process.argv[i + 1]);
}

// Sanity checks
if (typeof Options["-type"] === "undefined")
    throw new Error("Type undefined. Please use -type to define the datatype (mp3, wav, ogg).");

let Type = Options["-type"] = Options["-type"].toLowerCase();

if (Type !== "mp3" && Type !== "wav" && Type && Type !== "ogg")
    throw new Error("Invalid Type. Must be either mp3, wav or ogg.");

if (typeof Options["-port"] === "undefined")
    throw new Error("Port undefined. Please use -port to define the server's port.");

if (Type === "mp3" && typeof Options["-burstsize"] === "undefined")
    throw new Error("BurstSize undefined. Please use -burstsize to define the burst size.");

if (Type === "wav" && typeof Options["-chunksize"] === "undefined")
    throw new Error("ChunkSize undefined. Please use -chunksize to define the chunk size.");

let Streamer = null;

// Load Streamer
switch (Type) {
    case "mp3":
        Streamer = new FormatStreamer_MP3(process.stdin, Options["-port"], Options["-burstsize"]);
        break;

    case "wav":
        Streamer = new FormatStreamer_WAV(process.stdin, Options["-port"], Options["-chunksize"]);
        break;

    case "ogg":
        Streamer = new FormatStreamer_OGG(process.stdin, Options["-port"]);
        break;
}

Streamer.Run();
