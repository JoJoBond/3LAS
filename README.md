3LAS (Low Latency Live Audio Streaming)
====

3LAS a browser-based low latency audio streaming solution for use in mobile devices.
It's based on HTML5 (WebRTC, fallback via WebSockets and Web Audio API) and is written in TypeScript/JavaScript.

Requirements
===

Server side
---
- A working Node.js installation (https://nodejs.org)
- The 'ws' websocket and 'wrtc' webrtc npm packages for Node.js (https://www.npmjs.com/package/ws , https://www.npmjs.com/package/wrtc)
- A working ffmpeg or avconv installation (https://ffmpeg.org)
- (optional) STUN/TURN server installation (e.g. [COTURN](https://github.com/coturn/coturn))

Client side
---
- WebRTC support (browser)

___OR (Fallback)___

- WebSocket support (browser)
- Web Audio API support (browser)
- Decoder for respective audio format (browser/OS)

Deploying the example (outline)
===

Web server
---
1. Copy the content of the example/client folder into the root folder of your webserver.
2. Change the 'SocketHost', 'SocketPort' and 'SocketPath' variables in the script/3las.js to match the server from the streaming server
3. (optional) Add STUN/TURN servers to the 'RtcConfig' variable in index.html (see https://developer.mozilla.org/en-US/docs/Web/API/RTCIceServer/urls)

Streaming server
---
1. Copy the content of the example/server folder somewhere onto the streaming server
2. In a terminal, browse to the folder where the files are
3. Use npm to install ws and wrtc for Node.js (npm install ws wrtc), you may need to install the node-pre-gyp npm package as well
4. Check the settings.json configuration file (nano settings.json), copy STUN/TURN settings from web server index.html.
5. Make the test.sh scripts executable with chmod (chmod ug+x test.sh)
6. Run the scripts to start the server (./test.sh)

Notes
===
The main transmission method was changed from WebSockets and WebAudio to WebRTC.
WebSockets and WebAudio are still used as a fallback for clients that don't support WebRTC.
The old version that doesn't use WebRTC is still available in the [socket_only](https://github.com/JoJoBond/3LAS/tree/socket_only) branch.
In fallback mode only mp3 and wav are offered. Other formats will no longer be developed or supported.
The fallback streams are automatically generated via ffmpeg as child processes.
Within a LAN environment STUN/TURN server should not be necessary, for an Internet service STUN/TURN servers are practically required.
Input into the server script must be PCM audio. Check the test.sh script to see the command line parameters that provide the required metadata for ffmpeg.

Fell free to contact me if you have problems or questions.
Pull requests are also welcome.
