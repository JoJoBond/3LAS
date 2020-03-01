#!/bin/sh

ffmpeg -y -f alsa -i hw:0 -rtbufsize 64 -probesize 64 \
-acodec aac -b:a 320k -ac 1 \
-f adts -fflags +nobuffer -flush_packets 1 - \
| node stdinstreamer.js -port 9605 -type aac
