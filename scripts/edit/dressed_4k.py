"""dressed_4k.py <original_4k.mp4> <original_1080.mp4> <dressed_1080.mp4> <out_4k.mp4>
The dressed take at the take's native 4K (2160x3840, 59.94 fps), $0: the original 4K frame everywhere, the dressed 1080
frame (upscaled 2x) only where the dress changed the picture (|dressed - original| at 1080 > 8, opened, dilated 9 px,
feathered 3 px). His face, skin and the room keep the 4K pixels; the garment is Genjutsu's 720p either way.
Streams frame by frame; the three inputs must have the same frame count and timing (the 1080 original is the 4K
original scaled to 1080x1920, the dressed 1080 is body_only_swap.py's output for it). First used on c044 (23 Oct 2026,
dressed real-him v3 `21b9b341`, changed area 4.3 % of the frame). Lane B of docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md."""
import sys, subprocess, numpy as np, cv2
orig4k, orig1080, dressed1080, out = sys.argv[1:5]
W4,H4,W1,H1=2160,3840,1080,1920
def reader(p,w,h):
    return subprocess.Popen(["ffmpeg","-loglevel","error","-i",p,"-f","rawvideo","-pix_fmt","rgb24","-"],stdout=subprocess.PIPE), w*h*3
r4,n4=reader(orig4k,W4,H4); r1,n1=reader(orig1080,W1,H1); rd,nd=reader(dressed1080,W1,H1)
vw=subprocess.Popen(["ffmpeg","-loglevel","error","-y","-f","rawvideo","-pix_fmt","rgb24","-s",f"{W4}x{H4}","-r","60000/1001","-i","-","-c:v","libx264","-crf","14","-pix_fmt","yuv420p","-color_primaries","bt709","-color_trc","bt709","-colorspace","bt709","-movflags","+faststart",out],stdin=subprocess.PIPE)
i=0; changed=[]
while True:
    a=r4.stdout.read(n4); b=r1.stdout.read(n1); c=rd.stdout.read(nd)
    if len(a)<n4 or len(b)<n1 or len(c)<nd: break
    f4=np.frombuffer(a,np.uint8).reshape(H4,W4,3); f1=np.frombuffer(b,np.uint8).reshape(H1,W1,3); fd=np.frombuffer(c,np.uint8).reshape(H1,W1,3)
    d=np.abs(f1.astype(np.int16)-fd.astype(np.int16)).max(2)
    m=(d>8).astype(np.uint8); m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((3,3),np.uint8)); m=cv2.dilate(m,np.ones((9,9),np.uint8))
    m4=cv2.resize(m.astype(np.float32),(W4,H4),interpolation=cv2.INTER_LINEAR); m4=cv2.GaussianBlur(m4,(0,0),3)[...,None]
    up=cv2.resize(fd,(W4,H4),interpolation=cv2.INTER_LANCZOS4)
    o=(f4.astype(np.float32)*(1-m4)+up.astype(np.float32)*m4).round().clip(0,255).astype(np.uint8)
    vw.stdin.write(o.tobytes()); changed.append(float(m.mean())); i+=1
vw.stdin.close(); vw.wait()
print("frames",i,"changed area mean %.3f max %.3f"%(np.mean(changed),np.max(changed)))
