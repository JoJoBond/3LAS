@ECHO OFF

SET FLAGS=-fflags +nobuffer+flush_packets -flags low_delay -rtbufsize 64 -probesize 64 -audio_buffer_size 20
SET CAPTURE_DEVICE=Line (3- ZOOM U-22 Driver)
SET INPUT_SETTINGS=-f dshow -i audio="%CAPTURE_DEVICE%"

REM SET INPUT_SETTINGS=-re -f lavfi -i "aevalsrc='sin(1000*t*2*PI*t)':s=48000:d=3600"
SET CODEC_SETTINGS=-af aresample=resampler=soxr -acodec pcm_s16le -ar 48000 -ac 1
SET OUTPUT_SETTINGS=-f s16le -fflags +nobuffer+flush_packets -packetsize 384 -flush_packets 1 -bufsize 960

ffmpeg %FLAGS% %INPUT_SETTINGS% %CODEC_SETTINGS% %OUTPUT_SETTINGS% pipe:1 | node 3las.server.js -port 8080 -samplerate 48000 -channels 1