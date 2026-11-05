"""place_him_over_plate.py <him.mp4> <plate.png> <out.mp4> --scale S --x X --y Y [--fps 24] [--seconds 4.0]
       [--gain r,g,b] [--contrast C] [--drift PX] [--alpha-out alpha.mp4] [--stills DIR]
Put a clip of him (one where he fills the frame, e.g. a dressed + put-back 1080x1920 crop) INTO a generated scene at a
chosen size and place, $0: RobustVideoMatting (rvm_mobilenetv3_fp32.onnx in ~/.cache/avt, recurrent, decontaminated
foreground, temporally coherent alpha) decides where he is; he is scaled by --scale and his clip's top-left lands at
(--x, --y) on the 1080x1920 output (negative = cropped by the frame); a per-channel --gain and a --contrast around a dark
pivot grade him into the room; one seeded, smoothed handheld drift (--drift px) moves the plate and him together.
Why it exists (c009, 5 Nov 2026): the tool's composite lane overlays the take at its own scale, so a wide full-body take
puts him smaller than the people behind the couch; the shot needs him large, waist-up, in front of it. Decision log and
the first result: docs/handoffs/HANDOFF_GROKBOT_FIRST_HALF_2026-11-05.md (c009). Lane B of
docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md makes the input clip. Tool gap: scale/position in the composite lane."""

import argparse, subprocess, numpy as np, cv2, onnxruntime as ort, os, sys
ap=argparse.ArgumentParser(); ap.add_argument("him"); ap.add_argument("plate"); ap.add_argument("out")
ap.add_argument("--scale",type=float,default=1.35); ap.add_argument("--x",type=float,default=-60); ap.add_argument("--y",type=float,default=120)
ap.add_argument("--fps",type=int,default=24); ap.add_argument("--seconds",type=float,default=4.0); ap.add_argument("--gain",default="0.80,0.70,0.62")
ap.add_argument("--contrast",type=float,default=1.08); ap.add_argument("--drift",type=float,default=5.0); ap.add_argument("--alpha-out",default=None); ap.add_argument("--stills",default=None)
a=ap.parse_args(); W,H=1080,1920; gain=np.array([float(v) for v in a.gain.split(",")],np.float32)[::-1]  # BGR
plate=cv2.resize(cv2.imread(a.plate),(W,H),interpolation=cv2.INTER_AREA).astype(np.float32)
# frames of him at the output fps
n=int(round(a.seconds*a.fps)); rd=subprocess.Popen(["ffmpeg","-loglevel","error","-i",a.him,"-vf",f"fps={a.fps}","-frames:v",str(n),"-f","rawvideo","-pix_fmt","rgb24","-"],stdout=subprocess.PIPE)
hw=int(subprocess.run(["ffprobe","-v","error","-select_streams","v","-show_entries","stream=width","-of","csv=p=0",a.him],capture_output=True,text=True).stdout.strip())
hh=int(subprocess.run(["ffprobe","-v","error","-select_streams","v","-show_entries","stream=height","-of","csv=p=0",a.him],capture_output=True,text=True).stdout.strip())
sess=ort.InferenceSession(os.path.expanduser("~/.cache/avt/rvm_mobilenetv3_fp32.onnx"),providers=["CPUExecutionProvider"])
rec=[np.zeros([1,1,1,1],np.float32)]*4; dsr=np.array([0.25],np.float32)
wr=subprocess.Popen(["ffmpeg","-loglevel","error","-y","-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(a.fps),"-i","-","-c:v","libx264","-preset","medium","-crf","16","-pix_fmt","yuv420p","-movflags","+faststart",a.out],stdin=subprocess.PIPE)
aw=subprocess.Popen(["ffmpeg","-loglevel","error","-y","-f","rawvideo","-pix_fmt","gray","-s",f"{W}x{H}","-r",str(a.fps),"-i","-","-c:v","libx264","-preset","medium","-crf","12","-pix_fmt","yuv420p",a.alpha_out],stdin=subprocess.PIPE) if a.alpha_out else None
rng=np.random.default_rng(9); drift=np.cumsum(rng.normal(0,1,(n+8,2)),0); drift=cv2.GaussianBlur(drift.astype(np.float32),(0,0),6)[:n]; drift-=drift.mean(0); drift*=a.drift/ (np.abs(drift).max()+1e-6)
sw,sh=int(round(hw*a.scale)),int(round(hh*a.scale)); i=0
if a.stills: os.makedirs(a.stills,exist_ok=True)
while True:
    b=rd.stdout.read(hw*hh*3)
    if len(b)<hw*hh*3: break
    src=np.frombuffer(b,np.uint8).reshape(hh,hw,3).astype(np.float32)/255  # RGB
    fgr,pha,*rec=sess.run(None,{"src":src.transpose(2,0,1)[None],"r1i":rec[0],"r2i":rec[1],"r3i":rec[2],"r4i":rec[3],"downsample_ratio":dsr})
    fg=(fgr[0].transpose(1,2,0)*255)[:,:,::-1]; al=pha[0,0]  # BGR, alpha 0..1
    al=np.clip((al-0.05)/0.9,0,1); al=cv2.GaussianBlur(al,(0,0),0.8)
    fg=cv2.resize(fg,(sw,sh),interpolation=cv2.INTER_LANCZOS4 if a.scale>1 else cv2.INTER_AREA); al=cv2.resize(al,(sw,sh),interpolation=cv2.INTER_LINEAR)
    # grade him into the room: gain per channel, contrast around a dark pivot
    fg=((fg*gain-40)*a.contrast+40).clip(0,255)
    dx,dy=drift[i]; canvas=plate.copy()
    # shared drift: shift the plate and him together (sub-pixel via warpAffine)
    M=np.float32([[1,0,dx],[0,1,dy]]); canvas=cv2.warpAffine(canvas,M,(W,H),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT)
    x0=int(round(a.x+dx)); y0=int(round(a.y+dy)); layer=np.zeros((H,W,3),np.float32); amask=np.zeros((H,W),np.float32)
    xs0,ys0=max(0,x0),max(0,y0); xs1,ys1=min(W,x0+sw),min(H,y0+sh)
    if xs1>xs0 and ys1>ys0:
        layer[ys0:ys1,xs0:xs1]=fg[ys0-y0:ys1-y0,xs0-x0:xs1-x0]; amask[ys0:ys1,xs0:xs1]=al[ys0-y0:ys1-y0,xs0-x0:xs1-x0]
    am=amask[...,None]; out=(canvas*(1-am)+layer*am).clip(0,255).astype(np.uint8)
    wr.stdin.write(out[:,:,::-1].tobytes())
    if aw: aw.stdin.write((amask*255).astype(np.uint8).tobytes())
    if a.stills and i in (0,n//3,2*n//3,n-1): cv2.imwrite(f"{a.stills}/f{i:03d}.jpg",out,[cv2.IMWRITE_JPEG_QUALITY,90])
    i+=1
wr.stdin.close(); wr.wait()
if aw: aw.stdin.close(); aw.wait()
print("frames",i,"him layer",sw,"x",sh,"at",a.x,a.y)
