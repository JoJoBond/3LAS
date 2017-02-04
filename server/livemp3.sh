#!/bin/sh

ffmpeg -y -f alsa -i hw:0 -rtbufsize 64 -probesize 64 \
-acodec libmp3lame -ab 320k -ac 1 -reservoir 0 -f mp3 \
-fflags +nobuffer - \
| nodejs stdinstreamer.js -port 9601 -type mp3 -burstsize 1
