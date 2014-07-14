#!/bin/sh

ffmpeg -y -ar 16000 -f alsa -i input1 -rtbufsize 384 -probesize 384 -acodec pcm_s16le -ac 1 -f wav -flush_packets 1 -fflags +nobuffer -chunk_size 384 -packetsize 384 -async 3 - | node stdinstreamer.js -port 9696 -type wav -chunksize 384

#ffmpeg -y -ar 16000 -f alsa -i input1 -acodec pcm_s16le -ac 1 -f wav - | node stdinstreamer.js -port 9696 -type wav -chunksize 1024
