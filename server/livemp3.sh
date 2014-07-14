#!/bin/sh

ffmpeg -y -f alsa -i hw:0 -rtbufsize 64 -probesize 64 -acodec libmp3lame -ab 320k -reservoir 0 -ac 1 -f mp3 -write_xing 0 -id3v2_version 0 -flush_packets 1 -fflags +nobuffer -async 3 - | node stdinstreamer.js -port 9696 -type mp3 -burstsize 1
