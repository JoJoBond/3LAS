#!/bin/sh

ffmpeg -y -f alsa -i hw:0 -rtbufsize 64 -probesize 64 \
-acodec pcm_s16le -ar 16000 -ac 1 \
-f wav -fflags +nobuffer -packetsize 384 -flush_packets 1 - \
| node stdinstreamer.js -port 9602 -type wav -chunksize 384
