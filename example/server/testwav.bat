@ECHO OFF

REM SET CAPTURE_DEVICE=Mic (ZOOM U-22 Audio)
REM SET INPUT_SETTINGS=-f dshow -i audio="%CAPTURE_DEVICE%" -rtbufsize 64 -probesize 64

SET INPUT_SETTINGS=-re -f lavfi -i "aevalsrc='sin(1000*t*2*PI*t)':s=16000:d=3600"
SET CODEC_SETTINGS=-acodec pcm_s16le -ar 16000 -ac 1
SET OUTPUT_SETTINGS=-f wav -flush_packets 1 -fflags +nobuffer -chunk_size 384 -packetsize 384

ffmpeg %INPUT_SETTINGS% %CODEC_SETTINGS% %OUTPUT_SETTINGS% - | node 3las.stdinstreamer.js -port 9602 -type wav -chunksize 384