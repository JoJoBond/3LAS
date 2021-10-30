#!/bin/sh

ffmpeg -fflags +nobuffer+flush_packets -flags low_delay -rtbufsize 64 -probesize 64 -audio_buffer_size 20 -y -f alsa -i hw:0 \
-af aresample=resampler=soxr -acodec pcm_s16le -ar 48000 -ac 1 \
-f s16le -fflags +nobuffer+flush_packets -packetsize 384 -flush_packets 1 -bufsize 960 pipe:1 \
| node 3las.server.js -port 8080 -samplerate 48000 -channels 1