#!/bin/sh

ffmpeg -y -f alsa -i hw:0 -rtbufsize 64 -probesize 64 \
-acodec libmp3lame -b:a 320k -ac 1 -reservoir 0 \
-f mp3 -write_xing 0 -id3v2_version 0 -fflags +nobuffer -flush_packets 1 - \
| nodejs stdinstreamer.js -port 9601 -type mpeg -burstsize 1
