#!/bin/sh

ffmpeg -y -f alsa -i hw:0 -ar 48000 -rtbufsize 256 -probesize 128 \
-acodec libvorbis -ab 128k -ac 1 -f ogg \
-page_duration 1 -flush_packets 1 -fflags +nobuffer - \
| node stdinstreamer.js -port 9696 -type ogg
