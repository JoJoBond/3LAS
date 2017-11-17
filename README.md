3LAS (Low Latency Live Audio Streaming)
====

3LAS a browser-based low latency audio streaming solution for use in mobile devices.
It's based on HTML5 (WebSockets and Web Audio API) and is written purley in Javascript.

Requirements
===

Serverside
---
- A working Node.js installation
- The WS websocket implementation for Node.js
- A working ffmpeg or avconv installation (with respective encoding options)

Clientside
---
- WebSocket support (browser)
- Web Audio API support (browser)
- Decoder for respective audio format (browser/OS)

Installation (outline)
===

Web server
---
1. Copy the content of the client folder into the root folder of your webserver.
2. Change the 'ServerName' variable in the index.html to match the server name or server ip from the streaming server

Streaming server
---
1. Copy the content of the server folder somewhere onto the streaming server
2. In a terminal, browse to the folder where the files are
3. Use npm to install ws for Node.js
4. Make the live[format].sh scripts executable with chmod
5. Run one of the scripts to start the server

Notes
===
Right now only MP3 works best on the client side.
WAV works mostly but can cause glitches (needs some fine-tuning).
OGG vorbis has basic functionality (needs some more work).
OGG opus has rudimentary (needs alot of work).

In general you would want to have multiple formats running in parallel, giving the client a broad choice.
This is to give the client a fallback when it doesn't support the first format offered, since most browsers/os'ses/hardwares do not support all the formats.
The formats are separated by the port on which they run on the streaming server.
Multiple streams and mutliple formats can be separated this way.
Check the 'Formats' variable in the index.html to see how it works.

Take a look into the shell script files to see how the servers work.

The port is usually specified with the -port modifier.

For MP3 the -burstsize modifier tells the server how many (old / past)  MP3-Frames it should send to a newly connected client. This reduces the time it takes for the client to start playing, but may add latency!
In general it should not be larger then the 'WindowSize' variable in js/formats/mpeg.js.

For WAV the -chucksize modifier tells the server how many PCM-encoded samples it sends in on package. This should be high enough to not cause a lot of network-overhead (keep in mind that WebSockets run over TCP/IP) but also low enough to not cause too much latency.

OGG (vorbis and opus) have no special modifiers for now, as I'm not entirely sure how to approch them.

I'm probably missing a lot of important stuff, but I tried to comment the code at the key points so you have a good chance on figuring it out yourself.

The description of the installation is also very rudimentary.

Fell free to contact me if you have problems or questions.
Pull requests are also welcome.
