/*
	Stdin-Streamer is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

//fs = require('fs');
ws = require('ws');

var WebSocketServer = ws.Server;

Self = this;

this.SocketListener;

this.num = 0;

this.Options;

this.ClientList = new Array();

this.GotHeader = false;

this.HeaderBuffer = new Array();

this.BurstBuffer = new Array();

this.ChunkBuffer = new Buffer(0);

function Init()
{
	Self.Options = ParseParams ();
	
	Self.SocketListener = new WebSocketServer({port: Self.Options["port"]});
	Self.SocketListener.on('connection', ClientConnected);

	process.stdin.on('data', stdinData);
	
	process.stdin.resume();
}

function ParseParams ()
{
	// Parser states:
	// 0  -  Normal (initial)
	// 1  -  type value
	// 2  -  burst size value
	// 3  -  chunk size value
	// 4  -  port value
	var ParserState = 0;
	
	var TypeVal = "";
	var BurstVal = -1;
	var ChunkVal = -1;
	var PortVal = -1;
	
	for (var i = 2; i < process.argv.length; i++)
	{
		switch (ParserState)
		{
			// Parse flags
			case 0:
				if (process.argv[i] == "-type")
				{
					ParserState = 1;
				}
				else if (process.argv[i] == "-burstsize")
				{
					ParserState = 2;
				}
				else if (process.argv[i] == "-chunksize")
				{
					ParserState = 3;
				}
				else if (process.argv[i] == "-port")
				{
					ParserState = 4;
				}
				break;
			// Parse type value
			case 1:
				if (TypeVal != "")
					throw new Error("Redefined 'type'. Please use -type only ONCE.");
				TypeVal = process.argv[i];
				ParserState = 0;
				break;
			// Parse burst size value
			case 2:
				if (BurstVal != -1)
					throw new Error("Redefined 'burst size'. Please use -burstsize only ONCE.");
				BurstVal = parseInt(process.argv[i], 10);
				ParserState = 0;
				break;
			// Parse chunk size value
			case 3:
				if (ChunkVal != -1)
					throw new Error("Redefined 'chunk size'. Please use -chunksize only ONCE.");
				ChunkVal = parseInt(process.argv[i], 10);
				ParserState = 0;
				break;
			// Parse chunk size value
			case 4:
				if (PortVal != -1)
					throw new Error("Redefined 'port'. Please use -port only ONCE.");
				PortVal = parseInt(process.argv[i], 10);
				ParserState = 0;
				break;
		}
	}
	
	// Do sanity checks, unify type
	if (PortVal < 0 || PortVal > 65535)
		throw new Error("'port' undefined. Please use -port to define the server's port.");
	
	switch (TypeVal)
	{
		case "ogg":
		case "Ogg":
		case "OGG":
			if (BurstVal != -1)
				throw new Error("Defined 'burst size' with type 'ogg'. Please use -burstsize with mp3 ONLY.");
			if (ChunkVal != -1)
				throw new Error("Defined 'chunk size' with type 'ogg'. Please use -chunksize with wav ONLY.");
			TypeVal = "ogg";
			break;
		case "mp3":
		case "Mp3":
		case "MP3":
			if (BurstVal < 0)
				throw new Error("'burst size' undefined. Please use -burstsize to define the burst size.");
			if (ChunkVal != -1)
				throw new Error("Defined 'chunk size' with type 'mp3'. Please use -chunksize with wav ONLY.");
			TypeVal = "mp3";
			break;
		case "wav":
		case "Wav":
		case "WAV":
			if (ChunkVal < 0)
				throw new Error("'chunk size' undefined. Please use -chunksize to define the chunk size.");
			if (BurstVal != -1)
				throw new Error("Defined 'burst size' with type 'wav'. Please use -burstsize with mp3 ONLY.");
			TypeVal = "wav";
			break;
		default:
			throw new Error("Unknown 'type'. Please use -type to define the datatype (wav, mp3, ogg).");
			break;
	}
	
	
	// Pack options an return them
	var OptionVal = new Array();
	
	OptionVal["type"] = TypeVal;
	OptionVal["port"] = PortVal;
		
	if (TypeVal == "mp3")
	{
		OptionVal["burstsize"] = BurstVal;
	}
	else if (TypeVal == "wav")
	{
		OptionVal["chunksize"] = ChunkVal;
	}
	else if (TypeVal == "ogg")
	{
		// Nothing to do here
	}
	return OptionVal;
}

function ClientConnected (socket)
{
	Self.ClientList.push(socket);
	socket.addEventListener('close', function (code, message){
		ClientDisconnected(code, message, socket);
	});
	
	if (Self.Options["type"] == "ogg" || Self.Options["type"] == "wav")
	{
		for (var i = 0; i < Self.HeaderBuffer.length; i++)
		{
			socket.send(Self.HeaderBuffer[i], {binary: true});
		}
	}
	if (Self.Options["type"] == "mp3")
	{
		for (var i = 0; i < Self.BurstBuffer.length; i++)
		{
			socket.send(Self.BurstBuffer[i], {binary: true});
		}
	}
	
}

function stdinData (chunk)
{
	//fs.writeFile("chunk" + Self.num++, chunk, function (err) {});
	
	// Refesh burst data for mp3
	if (Self.Options["type"] == "mp3")
	{
		if (Self.BurstBuffer.length >= Self.Options["burstsize"])
			Self.BurstBuffer.shift();
		Self.BurstBuffer.push(chunk);
	}
	
	// Check if vorbis / opus headers for ogg
	if (Self.Options["type"] == "ogg")
	{
		if (!Self.GotHeader)
		{
			
			while (chunk.length > 0 && !Self.GotHeader)
			{
				// Check in absolute granule position if page is a header page candidate
				var IsHeaderCandidate   = (chunk[6] == 0x00 && chunk[7] == 0x00 && chunk[8] == 0x00 && chunk[9] == 0x00 
								&& chunk[10] == 0x00 && chunk[11] == 0x00 && chunk[12] == 0x00 && chunk[13] == 0x00);
				
				if (!IsHeaderCandidate)
				{
					Self.GotHeader = true;
					break;
				}
				
				var page_segments = chunk[26];
				
				var pageend = page_segments + 26;
				
				if (chunk.length < page_segments + 27 + 7)
				{
					Self.GotHeader = true;
					break;
				}
				
				IsHeader = (chunk[26 + page_segments + 1] == 0x4f && chunk[26 + page_segments + 2] == 0x70 && chunk[26 + page_segments + 3] == 0x75 && // "Opus"
								chunk[26 + page_segments + 4] == 0x73);
								
				if (!IsHeader)
				{
					if (chunk.length < page_segments + 27 + 7)
					{
						Self.GotHeader = true;
						break;
					}
					
					IsHeader = (chunk[26 + page_segments + 2] == 0x76 && chunk[26 + page_segments + 3] == 0x6f && chunk[26 + page_segments + 4] == 0x72 && // "vorbis"
									chunk[26 + page_segments + 5] == 0x62 && chunk[26 + page_segments + 6] == 0x69 && chunk[26 + page_segments + 7] == 0x73);
					
					console.log("vorbis: " + IsHeader);
				}
				
				if (!IsHeader)
				{
					Self.GotHeader = true;
					break;
				}
				
				for (var i = 0; i < page_segments; i++)
					pageend += chunk[27+i];
				
				
				var tmp_header = new Buffer(pageend+1);
				chunk.copy(tmp_header, 0, 0, pageend+1);
				
				Self.HeaderBuffer.push(tmp_header);
				
				//fs.writeFile("tmp_header" + Self.num++, tmp_header, function (err) {});
				
				chunk = chunk.slice(pageend+1);		
			}
		}
	}
	
	// Check if riff for wav
	if (Self.Options["type"] == "wav" && Self.HeaderBuffer.length == 0)
	{
		// Check if chunk is a header page
		var IsHeader   = (chunk[0] == 0x52 && chunk[1] == 0x49 && chunk[2] == 0x46 && chunk[3] == 0x46);
		
		if (IsHeader)
		{
			Self.HeaderBuffer.push(chunk);
			var clients = Self.ClientList;
			for (var i = 0; i < clients.length; i++)
			{
				if (clients[i].readyState == 1)
					clients[i].send(chunk, {binary: true});
			}
		}
	}
	else if (Self.Options["type"] == "wav")
	{
		Self.ChunkBuffer = Buffer.concat(new Array(Self.ChunkBuffer, chunk), Self.ChunkBuffer.length + chunk.length);		
		if (Self.ChunkBuffer.length >= Self.Options["chunksize"])
		{
			var clients = Self.ClientList;
			for (var i = 0; i < clients.length; i++)
			{
				if (clients[i].readyState == 1)				
					clients[i].send(Self.ChunkBuffer, {binary: true});
			}
			Self.ChunkBuffer = new Buffer(0);
		}
	}
	if (Self.Options["type"] == "mp3" || Self.Options["type"] == "ogg")
	{
		var clients = Self.ClientList;
		for (var i = 0; i < clients.length; i++)
		{
			if (clients[i].readyState == 1)			
				clients[i].send(chunk, {binary: true});
		}
	}
}

function ClientDisconnected (code, message, socket)
{
	for (var i = 0; i < Self.ClientList.length; i++)
	{
		if (Self.ClientList[i] == socket)
		{
			Self.ClientList.splice(i, 1);
			break;
		}
	}
}



Init();

