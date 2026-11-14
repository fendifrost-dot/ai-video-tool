"""Where in the take's frame is the creature, and where is he? $0, deterministic. For the Hyenas set build.
usage: hyenas_performer_depth.py <perf_dir> <out.npz> --seed X,Y [--first 1] [--open 17] [--blur 22]
  perf_dir   prep_performer.py's p_0001.png ... (1080x1920, straight alpha): the put-back cut out by the delivered matte
  --seed     a pixel inside the creature (1080x1920), so its blob is told from his
  --first    the first frame used (the build's --perf_offset + 1)
He stands at one distance from the camera and the creature lies nearer, so hyenas_set_build.py puts the picture on a
surface with two depths. This writes the weight between them: 1 where the creature ever is, 0 where he ever is, a
smooth ramp across the bare floor between them (only the chain crosses it, so the chain runs from his hand's depth
to the collar's). Nothing is carried between frames and no matte pixel is changed: the weight only says how far away
a pixel is, never whether it shows.
Prints the gap between the two (px; the build refuses a gap of 0), and the creature's lowest point (its ground
contact, MEASURED: the build stands the creature's surface on the ground there)."""
import argparse, glob, os
import cv2, numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("perf"); ap.add_argument("out"); ap.add_argument("--seed", required=True)
ap.add_argument("--masks", default="", help="directory for m_0001.png ...: which surface each pixel of each frame lies on"); ap.add_argument("--first", type=int, default=1); ap.add_argument("--open", type=int, default=17); ap.add_argument("--blur", type=float, default=12.0)
A = ap.parse_args()
sx, sy = (int(v) for v in A.seed.split(","))
files = sorted(glob.glob(os.path.join(A.perf, "p_*.png")))[A.first - 1:]
assert files, "no frames"
k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (A.open, A.open))
parts = []
for f in files:
    a = cv2.imread(f, cv2.IMREAD_UNCHANGED)[..., 3] > 32767
    body = cv2.morphologyEx(a.astype(np.uint8), cv2.MORPH_OPEN, k)            # the chain is thinner than the kernel: gone
    n, lab = cv2.connectedComponents(body)
    assert lab[sy, sx] > 0, f"the seed is not on the creature in {os.path.basename(f)}"
    parts.append((a, body > 0, lab == lab[sy, sx]))
# on some frames he touches the creature (a shoe against its shoulder) and the two are one blob: those frames cannot
# say where the creature ends. The creature's region comes from the frames where they are apart; on the touching
# frames he is what lies outside that region grown by 6 px
med = float(np.median([c.sum() for _, _, c in parts])); touching = [i for i, (_, _, c) in enumerate(parts) if c.sum() > 1.3 * med]
assert len(touching) < len(parts) * 0.6, "he touches the creature on most frames: no frame says where it ends"
creature = np.zeros_like(parts[0][1]); him = np.zeros_like(creature); low = []
for i, (a, body, c) in enumerate(parts):
    if i in touching: continue
    creature |= c; him |= body & ~c
    ys, xs = np.nonzero(c & a); low.append((int(ys.max()), int(np.median(xs[ys > ys.max() - 6]))))
grown = cv2.dilate(creature.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))) > 0
shared = 0
for i in touching:
    a, body, c = parts[i]; him |= body & ~grown; shared = max(shared, int((body & grown & ~creature).sum()))
print(f"he touches the creature on {len(touching)} of {len(parts)} frames" + (f" (first {touching[0] + A.first}, last {touching[-1] + A.first}); "
      f"up to {shared} px of him lie within 6 px of its region there and take a depth between the two" if touching else ""))
# over the shot his shoe can pass where the creature's edge lies on another frame, with the two never touching on any
# one frame: the weight is one picture for the whole shot, so there the creature's region (grown 6 px) has the place
crossed = int((him & grown).sum()); him &= ~grown
if crossed: print(f"{crossed} px that he crosses on some frames lie within 6 px of the creature's region on others: counted as the creature's")
H, W = creature.shape
d_c = cv2.distanceTransform((~creature).astype(np.uint8), cv2.DIST_L2, 5)
gap = float(d_c[him].min()) if him.any() else float("inf")
assert gap > 0, "he and the creature touch after the chain is removed: one surface cannot hold both depths"
# the weight: 1 on the creature, 0 on him, and between them the share of the way from him to the creature. It is
# continuous, so the chain runs unbroken from his hand's depth to the collar's (a weight blurred and then clamped
# jumped at the creature's edge and the build cut the chain there, 13 Nov). Where he touches the creature the way
# is a few pixels long and the build lets the surface step there: that step must fall on bare floor, so the
# creature's side reaches 3 px past its region (he begins 6 px past it on the touching frames)
core = (cv2.dilate(creature.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0) & ~him
d_core = cv2.distanceTransform((~core).astype(np.uint8), cv2.DIST_L2, 5); d_h = cv2.distanceTransform((~him).astype(np.uint8), cv2.DIST_L2, 5)
w = (d_h / np.maximum(d_h + d_core, 1e-6)).astype(np.float32)
# his shoe comes within a few pixels of the creature on some frames, and the weight is one picture for the whole shot,
# so on every frame the way from 0 to 1 is that short at that place, right where the chain meets the collar. A cut in
# the surface there broke the chain (13 Nov). The weight is spread over --blur px instead and nothing is clamped: the
# surface slopes steeply there but stays whole, and what crosses it (the chain; his shoe's edge on the touching
# frames) sits at a depth between the two
w = cv2.GaussianBlur(w, (0, 0), A.blur)
ys, xs = np.nonzero(creature)
contact_row = int(np.percentile([r for r, _ in low], 50)); contact_x = int(np.median([x for _, x in low]))
np.savez_compressed(A.out, weight=w.astype(np.float16), size=np.array([W, H]), contact=np.array([contact_x, contact_row]),
         creature_box=np.array([xs.min(), ys.min(), xs.max(), ys.max()]), frames=len(files), gap_px=gap)
print(f"frames {len(files)}  creature box x {xs.min()}..{xs.max()} y {ys.min()}..{ys.max()}  ground contact px ({contact_x}, {contact_row})  "
      f"gap to him {gap:.1f} px  weight on him max {float(w[him].max()):.3f}  on the creature min {float(w[creature].min()):.3f}")

# --masks: for every frame of the cut-out, which of the build's three surfaces each pixel lies on (red = him, green =
# thin parts away from his bulk: the chain, blue = the creature's region). His bulk is what is left of the matte when
# thin parts are opened away (the chain, a lace), grown 9 px so its soft edge comes with it; the creature's region is
# the one found above, the same on every frame. Where his shoe touches the creature it stays HIS (red) right up to
# that region, so it is never pulled toward the creature's depth. The matte itself is not changed.
if A.masks:
    os.makedirs(A.masks, exist_ok=True)
    k9 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19)); n_m = 0
    for f in sorted(glob.glob(os.path.join(A.perf, "p_*.png"))):
        a = cv2.imread(f, cv2.IMREAD_UNCHANGED)[..., 3] > 32767
        bulk = cv2.morphologyEx(a.astype(np.uint8), cv2.MORPH_OPEN, k) > 0
        his = (cv2.dilate((bulk & ~core).astype(np.uint8), k9) > 0) & ~core
        m = np.zeros((H, W, 3), np.uint8); m[..., 2] = his * 255; m[..., 1] = (~his & ~core) * 255; m[..., 0] = core * 255   # BGR
        cv2.imwrite(os.path.join(A.masks, os.path.basename(f).replace("p_", "m_")), m); n_m += 1
    print(f"masks written: {n_m} frames to {A.masks}")
