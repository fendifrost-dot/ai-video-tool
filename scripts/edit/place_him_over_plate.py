"""place_him_over_plate.py <him.mp4> <plate.mp4> <out.mp4> --plate-offset S --seconds S --scale S --x X --y Y
       --couch-y Y [--couch-feather PX] [--gain r,g,b] [--contrast C] [--fps 24] [--stills DIR]
Put a clip of him (one where he fills the frame: a dressed + put-back 1080x1920 crop) INTO a MOVING plate, $0:
RobustVideoMatting (rvm_mobilenetv3_fp32.onnx in ~/.cache/avt; recurrent, decontaminated foreground, coherent alpha)
decides where he is; he is scaled by --scale and his clip's top-left lands at (--x, --y) on the 1080x1920 output, and
from there he FOLLOWS THE PLATE'S OWN CAMERA MOTION (phase correlation between consecutive plate frames, accumulated),
so he stands still in the place while the camera drifts; everything of him below --couch-y is hidden (a soft
occlusion line: the couch back, a table, whatever stands between him and the camera); a per-channel --gain and a
--contrast around a dark pivot grade him into the room. No synthetic drift: the plate carries the camera life.
Rules (docs/SHOT_RULES.md): the plate must MOVE (rule 3) and must hold NO people (rule 4); the clip of him is his real
take with his face put back (rules 1, 2). First used on c009 v2 (5 Nov 2026): the crew cutaway, then him alone at the
poster wall over a Seedance continuous take of the empty wall (`montage-shot` with continuous.withHim false)."""

import argparse, subprocess, numpy as np, cv2, onnxruntime as ort, os
ap=argparse.ArgumentParser(); ap.add_argument("him"); ap.add_argument("plate"); ap.add_argument("out")
ap.add_argument("--plate-offset",type=float,default=0); ap.add_argument("--seconds",type=float,default=1.5); ap.add_argument("--fps",type=int,default=24)
ap.add_argument("--scale",type=float,default=1.31); ap.add_argument("--x",type=float,default=-100); ap.add_argument("--y",type=float,default=289)
ap.add_argument("--couch-y",type=float,default=1670,help="output row where the couch back begins (him hidden below it)"); ap.add_argument("--couch-feather",type=float,default=14)
ap.add_argument("--gain",default="0.70,0.60,0.50"); ap.add_argument("--contrast",type=float,default=1.10); ap.add_argument("--stills",default=None)
a=ap.parse_args(); W,H=1080,1920; gain=np.array([float(v) for v in a.gain.split(",")],np.float32)[::-1]
n=int(round(a.seconds*a.fps))
def probe(p,k): return int(subprocess.run(["ffprobe","-v","error","-select_streams","v","-show_entries",f"stream={k}","-of","csv=p=0",p],capture_output=True,text=True).stdout.strip())
hw,hh=probe(a.him,"width"),probe(a.him,"height")
rd=subprocess.Popen(["ffmpeg","-loglevel","error","-i",a.him,"-vf",f"fps={a.fps}","-frames:v",str(n),"-f","rawvideo","-pix_fmt","rgb24","-"],stdout=subprocess.PIPE)
prd=subprocess.Popen(["ffmpeg","-loglevel","error","-ss",f"{a.plate_offset:.3f}","-i",a.plate,"-vf",f"fps={a.fps},scale={W}:{H}:flags=lanczos","-frames:v",str(n),"-f","rawvideo","-pix_fmt","bgr24","-"],stdout=subprocess.PIPE)
sess=ort.InferenceSession(os.path.expanduser("~/.cache/avt/rvm_mobilenetv3_fp32.onnx"),providers=["CPUExecutionProvider"]); rec=[np.zeros([1,1,1,1],np.float32)]*4; dsr=np.array([0.25],np.float32)
wr=subprocess.Popen(["ffmpeg","-loglevel","error","-y","-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(a.fps),"-i","-","-c:v","libx264","-preset","medium","-crf","16","-pix_fmt","yuv420p","-movflags","+faststart",a.out],stdin=subprocess.PIPE)
sw,sh=int(round(hw*a.scale)),int(round(hh*a.scale)); prev=None; acc=np.zeros(2); i=0
yy=np.arange(H,dtype=np.float32)[:,None]; occl=np.clip((a.couch_y-yy)/a.couch_feather,0,1)   # 1 above the couch line, 0 below
if a.stills: os.makedirs(a.stills,exist_ok=True)
shifts=[]
while True:
    b=rd.stdout.read(hw*hh*3); pb=prd.stdout.read(W*H*3)
    if len(b)<hw*hh*3 or len(pb)<W*H*3: break
    src=np.frombuffer(b,np.uint8).reshape(hh,hw,3).astype(np.float32)/255; plate=np.frombuffer(pb,np.uint8).reshape(H,W,3).astype(np.float32)
    g=cv2.resize(cv2.cvtColor(plate.astype(np.uint8),cv2.COLOR_BGR2GRAY),(270,480)).astype(np.float32)
    if prev is not None:
        (dx,dy),resp=cv2.phaseCorrelate(prev,g); acc+=np.array([dx,dy])*4.0   # back to 1080 scale
    prev=g; shifts.append(acc.copy())
    fgr,pha,*rec=sess.run(None,{"src":src.transpose(2,0,1)[None],"r1i":rec[0],"r2i":rec[1],"r3i":rec[2],"r4i":rec[3],"downsample_ratio":dsr})
    fg=(fgr[0].transpose(1,2,0)*255)[:,:,::-1]; al=np.clip((pha[0,0]-0.05)/0.9,0,1); al=cv2.GaussianBlur(al,(0,0),0.8)
    fg=cv2.resize(fg,(sw,sh),interpolation=cv2.INTER_LANCZOS4); al=cv2.resize(al,(sw,sh),interpolation=cv2.INTER_LINEAR)
    fg=((fg*gain-30)*a.contrast+30).clip(0,255)
    x0=int(round(a.x+acc[0])); y0=int(round(a.y+acc[1])); layer=np.zeros((H,W,3),np.float32); am=np.zeros((H,W),np.float32)
    xs0,ys0=max(0,x0),max(0,y0); xs1,ys1=min(W,x0+sw),min(H,y0+sh)
    if xs1>xs0 and ys1>ys0:
        layer[ys0:ys1,xs0:xs1]=fg[ys0-y0:ys1-y0,xs0-x0:xs1-x0]; am[ys0:ys1,xs0:xs1]=al[ys0-y0:ys1-y0,xs0-x0:xs1-x0]
    am=(am*occl)[...,None]; out=(plate*(1-am)+layer*am).clip(0,255).astype(np.uint8)
    wr.stdin.write(out[:,:,::-1].tobytes())
    if a.stills and i%6==0: cv2.imwrite(f"{a.stills}/f{i:03d}.jpg",out,[cv2.IMWRITE_JPEG_QUALITY,90])
    i+=1
wr.stdin.close(); wr.wait(); print("frames",i,"plate shift over clip (px):",np.round(shifts[-1],1) if shifts else None)
