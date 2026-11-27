# $0: place the real-face dressed photo of him on the empty street plate at one depth, and cut the 16:9 crop round him that the
# blend pass works on (he fills 80 % of the crop's height, so his face is large enough for the landmarks and the put-back).
# usage (from the shot's work folder): place_still_figure_on_plate.py <name> <frac of frame height> <x frac>
#   -> ladder/<name>_guide.png, _crop.jpg (2752x1536), _place.json
# First used on the Partnership storm verse (17 Nov 2026). The paths, the figure's box in the photo and the plate's horizon are
# that shot's: photo_path/dressed_putback.png (his real photo, clothes-only edit, face put back, proof 0), the LaSalle plate, a
# camera 0.385 m up (HORIZON 1270 of 1536). Change them for another shot. The output is a PASTE-UP for the Gemini blend pass
# (prompt version storm_ladder_blend_v1), never the picture; his face is put back again after the blend on a head crop
# (still_face_putback.py, AVT_STILL_HAT=edit) and each still is head-checked before it is posted.
import os, sys, json, cv2, numpy as np, mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision
name, frac, xf = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
ph = cv2.imread("photo_path/dressed_putback.png"); pl = cv2.imread("../places_chicago_v1/A_lasalle.jpg"); H, W = pl.shape[:2]
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=os.path.join(os.environ["AVT_MODELS"], "selfie_multiclass_256x256.tflite")), running_mode=vision.RunningMode.IMAGE, output_confidence_masks=True))
x0, y0, x1, y1 = 420, 60, 1330, 2330
a = np.zeros((y1 - y0, x1 - x0), np.float32)
for ty in range(0, y1 - y0 - 910 + 1, 340):
    tile = np.ascontiguousarray(cv2.cvtColor(ph[y0 + ty:y0 + ty + 910, x0:x1], cv2.COLOR_BGR2RGB))
    bg = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=tile)).confidence_masks[0].numpy_view()
    a[ty:ty + 910] = np.maximum(a[ty:ty + 910], cv2.resize(1 - np.squeeze(bg), (910, 910), interpolation=cv2.INTER_CUBIC))
a = np.clip((cv2.GaussianBlur(a, (0, 0), 2.5) - 0.45) / 0.3, 0, 1)
n, lab, st, _ = cv2.connectedComponentsWithStats((a > 0.5).astype(np.uint8)); a *= (lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])))
ys, xs = np.where(a > 0.5); top, bot = ys.min(), ys.max(); cx = int(xs.mean()); h = bot - top
hp = int(frac * H); s = hp / h; HORIZON = 1270; feet = HORIZON + int(hp * 0.202)        # the plate's camera is 0.385 m up: feet this far under the horizon
fig = cv2.resize(ph[y0 + top:y0 + bot, x0:x1], None, fx=s, fy=s, interpolation=cv2.INTER_AREA).astype(np.float32)
al = cv2.resize(a[top:bot], (fig.shape[1], fig.shape[0]), interpolation=cv2.INTER_AREA)[..., None]
px = int(xf * W) - int(cx * s); py = feet - fig.shape[0]
canvas = np.zeros((H + 400, W, 3), np.float32); canvas[:H] = pl; canvas[H:] = pl[H - 1:H]     # room under the frame for feet that leave it
canvas[py:py + fig.shape[0], px:px + fig.shape[1]] = fig * al + canvas[py:py + fig.shape[0], px:px + fig.shape[1]] * (1 - al)
out = canvas[:H].astype(np.uint8); cv2.imwrite(f"ladder/{name}_guide.png", out)
ch = min(H, int(hp / 0.8)); cw = int(ch * 16 / 9); ccx = int(xf * W); cy1 = min(H, feet + int(0.10 * ch)); cy0 = cy1 - ch
if cy0 < 0: cy0, cy1 = 0, ch
cx0 = max(0, min(W - cw, ccx - cw // 2)); box = [cx0, cy0, cx0 + cw, cy1]
crop = cv2.resize(out[box[1]:box[3], box[0]:box[2]], (W, H), interpolation=cv2.INTER_LANCZOS4)
cv2.imwrite(f"ladder/{name}_crop.png", crop); cv2.imwrite(f"ladder/{name}_crop.jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 95])
json.dump({"name": name, "frac": frac, "x_frac": xf, "height_px": hp, "feet_y": feet, "fig_xy": [px, py], "crop_box": box, "zoom": W / cw}, open(f"ladder/{name}_place.json", "w"))
print(name, "his height", hp, "px (", round(100 * hp / H), "% ) feet y", feet, "crop", box, "zoom x", round(W / cw, 2))
