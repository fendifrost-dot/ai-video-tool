"""hat_geometry.py <video> <a-b> [<a-b>...]: hat SHAPE over time, measured the same way on any video. Per frame the hat
= near-black pixels (luminance < 55) in the head box (rows face-centre -1.6..+0.45 face heights, columns +-1.1) that lie
OUTSIDE the face-skin hull grown 7 px (the beard, glasses and face are inside the hull; the crown and brim are outside).
Shape change = 1 - IoU(hat_t, hat_{t-1} shifted by the head's centroid motion). Also prints the area and bbox."""
import sys, os, numpy as np, cv2, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
M=os.environ.get("AVT_MODELS","models")
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=f"{M}/selfie_multiclass_256x256.tflite"), running_mode=vision.RunningMode.IMAGE, output_category_mask=True))
def cats(bgr): return np.squeeze(seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)))).category_mask.numpy_view()).copy()
def frames(p):
    c=cv2.VideoCapture(p); out=[]
    while True:
        ok,f=c.read()
        if not ok: break
        out.append(f)
    return out
def hat_and_centre(img):
    """the hat: pixels the segmenter calls accessory (5) that are dark (< 90) inside the head box of HIS face — the
    highest face-skin component in the frame (the men in the foreground sit lower), rows -1.6..+0.45 face heights
    about its centre, columns +-1.1 — excluding the face hull. Same measure on every video."""
    c=cats(img); face=(c==3).astype(np.uint8)
    n,lab,st,cen=cv2.connectedComponentsWithStats(face)
    cands=[q for q in range(1,n) if st[q,cv2.CC_STAT_AREA]>200]
    if not cands: return None,None
    q=min(cands,key=lambda q: st[q,cv2.CC_STAT_TOP]); comp=(lab==q); ys,xs=np.where(comp)
    cy,cx=float(ys.mean()),float(xs.mean()); fh=float(ys.max()-ys.min())
    H,W=face.shape; box=np.zeros((H,W),bool); box[int(max(0,cy-1.6*fh)):int(min(H,cy+0.45*fh)), int(max(0,cx-1.1*fh)):int(min(W,cx+1.1*fh))]=True
    hull=np.zeros((H,W),np.uint8); pts=np.column_stack([xs,ys]).astype(np.int32); cv2.fillConvexPoly(hull,cv2.convexHull(pts),1)
    hull=cv2.dilate(hull,np.ones((9,9),np.uint8))>0
    dark=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)<90
    hat=(c==5)&dark&box&~hull
    hat=cv2.morphologyEx(hat.astype(np.uint8),cv2.MORPH_OPEN,np.ones((3,3),np.uint8))>0
    return hat,(cx,cy)
def shift(m,dx,dy):
    A=np.float32([[1,0,dx],[0,1,dy]]); return cv2.warpAffine(m.astype(np.uint8),A,(m.shape[1],m.shape[0]),flags=cv2.INTER_NEAREST)>0
if __name__=="__main__":
    V=frames(sys.argv[1])
    for rs in sys.argv[2:]:
        a,b=map(int,rs.split("-")); prev=None; ch=[]; areas=[]; rows=[]
        for i in range(a,b+1):
            hat,cen=hat_and_centre(V[i])
            if hat is None: rows.append((i,0,None,float("nan"))); continue
            ys,xs=np.where(hat); area=int(hat.sum()); bb=(int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())) if area else None
            d=float("nan")
            if prev is not None and area:
                ph,pc=prev; sh=shift(ph,cen[0]-pc[0],cen[1]-pc[1]); d=1-(sh&hat).sum()/max((sh|hat).sum(),1); ch.append(d)
            areas.append(area); rows.append((i,area,bb,d)); prev=(hat,cen)
        print(f"{rs}: shape change mean {np.nanmean(ch):.3f} max {np.nanmax(ch):.3f}; area mean {np.mean(areas):.0f} min {min(areas)} max {max(areas)}")
        for i,area,bb,d in rows: print(f"   f{i:02d} area {area:6d} bbox {bb} change {d:.3f}")
