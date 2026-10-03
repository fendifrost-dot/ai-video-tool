#!/bin/bash
# Test media with the time burned in, so a frame says where it came from.
#  - the take and the AI clip are VP9 in MP4: a stock Chromium plays them (it has no H.264), and "Check this cut"
#    reads their MP4 index and decodes their frames; the B-roll stays WebM, the container that check only resolves.
#  - the song is a rising tone (200 Hz + 10 Hz per second): any stretch of it says where in the song it was cut
#    from, which is how the stand-in transcriber knows which window it was handed.
set -e
cd "$(dirname "$0")"; mkdir -p media; cd media
ffmpeg -v error -y -f lavfi -i "aevalsrc='0.5*sin(2*PI*(200*t+5*t*t))':s=22050:d=201.87" -ac 1 song.wav
ffmpeg -v error -y -f lavfi -i "testsrc2=size=270x480:rate=24:duration=190.34" -vf "drawtext=text='TAKE %{pts\\:hms}':fontsize=30:fontcolor=white:box=1:boxcolor=black@0.7:x=8:y=8" -c:v libvpx-vp9 -b:v 250k -deadline realtime -cpu-used 8 -g 12 -an -movflags +faststart take.mp4
ffmpeg -v error -y -f lavfi -i "smptebars=size=270x480:rate=24:duration=5" -vf "drawtext=text='AI CLIP %{pts\\:hms}':fontsize=26:fontcolor=white:box=1:boxcolor=black@0.7:x=8:y=8" -c:v libvpx-vp9 -b:v 300k -deadline realtime -cpu-used 8 -g 12 -an clip.mp4
ffmpeg -v error -y -f lavfi -i "mandelbrot=size=480x270:rate=24" -t 8 -vf "drawtext=text='B-ROLL %{pts\\:hms}':fontsize=26:fontcolor=white:box=1:boxcolor=black@0.7:x=8:y=8" -c:v libvpx -b:v 300k -g 12 -an broll.webm
ffmpeg -v error -y -f lavfi -i "color=c=0x224466:size=540x960" -vf "drawtext=text='AI IMAGE':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 still.png
ls -la
