"""Review clips for the Blender showroom shot, $0: the finished shot with the song, a side-by-side against the approved
performance and the 2D baseline at the same source times, a face close-up pair, and a 2 s edit.
usage: review_clips.py <approved.mp4> <baseline2d.mp4> <final.mp4> <scene_<move>.json> <params.json> <song.wav> <out_dir>
       [--extra LABEL=final2.mp4]"""
import argparse, json, os, subprocess
import numpy as np, cv2

ap = argparse.ArgumentParser()
for a in ("approved", "baseline", "final", "scene", "params", "song", "out"): ap.add_argument(a)
ap.add_argument("--extra", default="")
A = ap.parse_args()
os.makedirs(A.out, exist_ok=True)
P = json.load(open(A.params)); S = json.load(open(A.scene))
t0 = P["song_start"]; W, H = 1080, 1920
name = os.path.splitext(os.path.basename(A.final))[0]
def ff(*args): subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args], check=True)
aac = ["-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"]
# 1. the shot with the song
ff("-i", A.final, "-ss", f"{t0}", "-t", "4.0", "-i", A.song, "-map", "0:v", "-map", "1:a", "-t", "4", "-c:v", "copy", *aac,
   os.path.join(A.out, f"{name}_with_song.mp4"))
# 2. the 2 s edit window (shot 2.0-4.0 s: the light sweep and the train)
ff("-ss", "2.0", "-i", A.final, "-ss", f"{t0 + 2.0}", "-t", "2.0", "-i", A.song, "-map", "0:v", "-map", "1:a", "-t", "2",
   "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", *aac, os.path.join(A.out, f"{name}_2s_edit.mp4"))
# 3. side by side at the same source times: approved | 2D baseline | Blender [| extra]
ins = [A.approved, A.baseline, A.final] + ([A.extra.split("=", 1)[1]] if A.extra else [])
labels = ["approved body-only", "2D baseline (18 Oct)", "Blender, behind the island"] + ([A.extra.split("=", 1)[0]] if A.extra else [])
fc = "".join(f"[{k}:v]scale=540:960,drawtext=text='{l}':x=12:y=12:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.5[v{k}];"
             for k, l in enumerate(labels))
fc += "".join(f"[v{k}]" for k in range(len(ins))) + f"hstack=inputs={len(ins)}[v]"
args = sum([["-i", p] for p in ins], []) + ["-ss", f"{t0}", "-t", "4.0", "-i", A.song]
ff(*args, "-filter_complex", fc, "-map", "[v]", "-map", f"{len(ins)}:a", "-t", "4", "-c:v", "libx264", "-crf", "18",
   "-pix_fmt", "yuv420p", *aac, os.path.join(A.out, f"{name}_side_by_side.mp4"))
# 4. face close-ups: the approved face and the final face, each cropped around the same point (mapped), 3x
c = np.float32(S["card_corners_px_per_frame"][0]); sc = S.get("texture_scale", 0.31)
w2, h2 = round(W * sc), round(H * sc)
Hc = cv2.getPerspectiveTransform(np.float32([[0, h2], [w2, h2], [w2, 0], [0, 0]]), c)
R = np.vstack([cv2.getRotationMatrix2D((W / 2, H / 2), P["source"]["roll_deg"], 1.0), [0, 0, 1]])
M = Hc @ np.diag([sc, sc, 1.0]) @ R
ex, ey = P["source"]["eye_x"], P["source"]["eye_y"] + 40                     # between the eyes and the mouth
fx, fy = cv2.perspectiveTransform(np.float32([[[ex, ey]]]), M)[0, 0]
s_final = float(np.hypot(M[0, 0], M[1, 0]))
half_a = 200; half_f = int(round(half_a * s_final))
crop_a = f"crop={2 * half_a}:{2 * half_a}:{ex - half_a}:{ey - half_a},scale=480:480"
crop_f = f"crop={2 * half_f}:{2 * half_f}:{int(fx) - half_f}:{int(fy) - half_f},scale=480:480:flags=lanczos"
ff("-i", A.approved, "-i", A.final, "-ss", f"{t0}", "-t", "4.0", "-i", A.song, "-filter_complex",
   f"[0:v]{crop_a}[a];[1:v]{crop_f}[b];[a][b]hstack[v]", "-map", "[v]", "-map", "2:a", "-t", "4",
   "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", *aac, os.path.join(A.out, f"{name}_face_pair.mp4"))
print("wrote", A.out, "face scale in the shot %.3f" % s_final)
