#!/bin/sh

ffmpeg -y -f alsa -i hw:0 -rtbufsize 256 -probesize 128 \
-acodec libopus -b:a 128k -ac 1 \
-f ogg -page_duration 1 -flush_packets 1 -serial_offset 10000000 -fflags +nobuffer -\
| node stdinstreamer.js -port 9604 -type ogg
