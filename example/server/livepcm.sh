#!/bin/sh

ffmpeg -y -f alsa -i hw:0 -rtbufsize 64 -probesize 64 \
-acodec pcm_s16le -ar 16000 -ac 1 \
-f s16le -fflags +nobuffer -packetsize 384 -flush_packets 1 - \
| nodejs stdinstreamer.js -port 9603 -type pcm -chunksize 384
