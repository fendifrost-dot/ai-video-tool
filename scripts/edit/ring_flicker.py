"""ring_flicker.py <original> <candidate> <a-b> [<a-b> ...]: mean frame-to-frame change in a ring 4..16 px outside
his face-skin region, original vs candidate, per range and per frame. The check a put-back must pass before it is
posted (c041 v2, 2 Nov 2026: stills looked right, the brim flickered; the number told the truth). Models: env AVT_MODELS."""
import sys, numpy as np, cv2, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
import os
M=os.environ.get("AVT_MODELS", "models")
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=f"{M}/selfie_multiclass_256x256.tflite"), running_mode=vision.RunningMode.IMAGE, output_category_mask=True))
def cats(bgr): return np.squeeze(seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)))).category_mask.numpy_view()).copy()
def frames(p):
    c=cv2.VideoCapture(p); out=[]
    while True:
        ok,f=c.read()
        if not ok: break
        out.append(f)
    return out
O=frames(sys.argv[1]); F=frames(sys.argv[2])
for rs in sys.argv[3:]:
    a,b=map(int,rs.split("-")); ro=[]; rf=[]
    for k in range(a,b+1):
        fs=(cats(O[k])==3).astype(np.uint8); ring=(cv2.dilate(fs,np.ones((33,33),np.uint8))>0)&(cv2.dilate(fs,np.ones((9,9),np.uint8))==0)
        d=lambda A: float(np.abs(A[k].astype(int)-A[k-1].astype(int)).max(2)[ring].mean())
        ro.append(d(O)); rf.append(d(F))
    print(f"{rs}: original {np.mean(ro):.1f}  candidate {np.mean(rf):.1f}  per frame candidate {[round(x) for x in rf]}")
