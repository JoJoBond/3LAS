3LAS (Low Latency Live Audio Streaming)
====

3LAS a browser-based low latency audio streaming solution for use in mobile devices.
It's based on HTML5 (WebSockets and Web Audio API) and is written in TypeScript/JavaScript.
Codec support:
|  Codec  | Status |
|---------|:------:|
| MP3     |   ✓    |
| WAV     |   ✓    |
| Raw PCM |   ✓    |
| OGG Vorbis | rudimentary |
| OGG Opus  | experimental  |
| AAC | experimental |

Requirements
===

Serverside
---
- A working Node.js installation (https://nodejs.org)
- The 'ws' websocket npm package for Node.js (https://www.npmjs.com/package/ws)
- A working ffmpeg or avconv installation (with respective encoding options) (https://ffmpeg.org)

Clientside
---
- WebSocket support (browser)
- Web Audio API support (browser)
- Decoder for respective audio format (browser/OS)

Deploying the example (outline)
===

Web server
---
1. Copy the content of the example/client folder into the root folder of your webserver.
2. Change the 'SocketHost' variable in the script/3las.js to match the server name or server ip from the streaming server

Streaming server
---
1. Copy the content of the example/server folder somewhere onto the streaming server
2. In a terminal, browse to the folder where the files are
3. Use npm to install ws for Node.js (npm install ws)
4. Make the live[format].sh scripts executable with chmod (chmod ug+x live[format].sh)
5. Run one of the scripts to start the server (./live[format].sh)

Notes
===
Right now MP3, WAV and PCM work best on the client side.
OGG vorbis good functionality (needs some more testing/work).
OGG opus has rudimentary functionality (needs alot of work).
AAC is in research.

In general you would want to have multiple formats running in parallel, giving the client a broad choice.
This is to give the client a fallback when it doesn't support the first format offered, since most browsers/os'ses/hardwares do not support all the formats.
The formats are separated by the port on which they run on the streaming server.
Multiple streams and mutliple formats can be separated this way.
Check the 'Formats' variable in the index.html to see how it works.

Take a look into the shell script files to see how the servers work.

The port is specified with the -port modifier.

For WAV the -chucksize modifier tells the server how many PCM-encoded samples it sends in on package. This should be high enough to not cause a lot of network-overhead (keep in mind that WebSockets run over TCP/IP) but also low enough to not cause too much latency.

PCM, AAC, MP3 and OGG (vorbis/opus) have no special modifiers for now.

I'm probably missing a lot of important stuff, but I tried to comment the code at the key points so you have a good chance on figuring it out yourself.

Fell free to contact me if you have problems or questions.
Pull requests are also welcome.