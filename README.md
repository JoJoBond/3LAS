3LAS (Low Latency Live Audio Streaming)
====

3LAS a browser-based low latency audio streaming solution for use in mobile devices.
It's based on HTML5 (WebSockets and Web Audio API) and is written purley in Javascript.

Requirement
===

Serverside:
---
- A working Node.js installation
- The WS websocket implementation for Node.js
- A working ffmpeg or avconv installation (with respective encoding options)

Clientside:
---
- WebSocket support (browser)
- Web Audio API support (browser)
- Decoder for respective audio format (browser/OS)
