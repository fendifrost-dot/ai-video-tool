"""The Hyenas performance set as a 3D scene in Blender (EEVEE), rendered empty. $0 and deterministic (fixed seeds).
usage (Blender 5.3, headless):
  blender -b --factory-startup -P hyenas_set_build.py -- <hyenas_set.json> <layers_dir> <out_dir>
        [--only FRAME] [--frames N] [--pct 50] [--standin 1] [--save 1] [--samples 48]
  layers_dir  from hyenas_set_layers.py (car.png, car_depth.npy, card_*.png, sand.png, layers.json)
Writes <out_dir>/exr/set_0001.exr ... (scene-linear, half float): hyenas_set_comp.py adds glare, tone and grain.

What is real geometry and what is a picture (so nobody mistakes one for the other):
  ground      a displaced mesh with stones, twigs and leaves as objects; lit only by Blender's lights
  car         a relief mesh: every pixel of the car's front sits at its own depth (fascia, hood, windscreen, roof),
              with a body box behind it that casts the shadow and blocks the smoke; the DRLs are lights
  plants      the still's bushes, grass and branches as cut-out cards at their own distances, each bending in the
              wind by shape keys driven by the gust curve (params wind), lit by Blender's lights
  smoke       volumes: a plume above each flare and a low haze, their noise carried by the same wind
  flares      a point light and a flame each, flickering by a fixed-seed curve; they light ground, car, plants, smoke
  camera      where the phone stood for the take (params take_camera), a wider lens, one slow push-in
--standin 1 adds a 1.905 m figure and a lying animal where he and the dog are in the take, to check scale only.

Every option is a pair: "--name value" (never "--name=value": the pair is then read as nothing).
Him and the creature in the set (the take's picture laid on surfaces along the phone's own rays, so they are lit by
the set's lamps, throw shadows on its ground and stay put as the camera moves):
  --performer DIR      prep_performer.py's p_0001.png ... (the put-back cut out by its matte, 1080x1920)
  --perf_offset N      the first take frame used (0 = p_0001)
  --perf_depth NPZ --perf_masks DIR   from hyenas_performer_depth.py: a creature lying AWAY from his feet stands on
                       its own surface nearer the camera; without them everything stands at his distance (a creature
                       at his feet)
  --creature_row R     the take row where the creature's body meets the ground (a lying animal: its chest)
  --perf_gain 1.35 --perf_back 0.22   brightness of the picture, share of light let through from behind
  --tuft "x,y,h;..."   extra grass in front of a place the take cut off (metres)
  --shift X,Y          reframe (pixels)
  --flicker_rate R     flare flicker speed (0.25 = no jump on every picture at 24 fps)
  --clear_litter PX    no stones or leaves under the picture laid on the ground
  --passes full,plate,matte   the layers for a finisher (see the end of this file)
The eight Hyenas shots and their settings: docs/handoffs/HANDOFF_GROKBOT_HYENAS_PERFORMANCE_IN_SET_2026-11-13.md."""
import json, math, os, random, sys
import bpy, bmesh
import numpy as np
from mathutils import Vector, noise

argv = sys.argv[sys.argv.index("--") + 1:]
pp, ld, od = argv[:3]
opt = dict(zip(argv[3::2], argv[4::2]))
P = json.load(open(pp)); LY = json.load(open(f"{ld}/layers.json"))
TS, TC, R, CAR, WD = P["texture_still"], P["take_camera"], P["render"], P["car"], P["wind"]
W, H = R["size"]; FPS = R["fps"]; NFR = int(opt.get("--frames", R["frames"]))
ONLY = int(opt.get("--only", 0)); PCT = int(opt.get("--pct", 100))
rng = random.Random(1311)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, PCT
sc.render.fps, sc.render.fps_base = FPS, 1
sc.frame_start, sc.frame_end = 1, NFR
ee = sc.eevee
ee.taa_render_samples = int(opt.get("--samples", 48))
ee.volumetric_start, ee.volumetric_end = 0.2, 45.0
ee.volumetric_tile_size = "4"; ee.volumetric_samples = 96; ee.volumetric_sample_distribution = 0.85
ee.use_volumetric_shadows = True; ee.volumetric_shadow_samples = 16
# --shadow_rays N --shadow_steps M (defaults 1 and 6, Blender's own): rays traced per pixel for a light's soft shadow.
# With 1 the shadow he and the creature throw on the ground is a speckle that changes every frame (Fendi, 13 Nov:
# "a little flicker around the hyenas but on the ground"); more rays average it out
for k, v in (("shadow_ray_count", int(opt.get("--shadow_rays", 1))), ("shadow_step_count", int(opt.get("--shadow_steps", 6)))):
    if hasattr(ee, k): setattr(ee, k, v)
for k, v in (("volumetric_light_clamp", 0.0), ("use_shadows", True)):
    if hasattr(ee, k): setattr(ee, k, v)
world = bpy.data.worlds.new("night"); world.use_nodes = True
bgn = world.node_tree.nodes["Background"]; bgn.inputs[0].default_value = (0.010, 0.016, 0.035, 1); bgn.inputs[1].default_value = 0.035
sc.world = world
coll = sc.collection

def gust(t):
    return WD["base"] + sum(a * math.sin(2 * math.pi * t / p + ph) for a, p, ph in WD["gusts"])
TIMES = [(f - 1) / FPS for f in range(1, NFR + 1)]
GUST = [gust(t) for t in TIMES]
RUN = np.concatenate([[0.0], np.cumsum(GUST)[:-1]]) / FPS            # how far the wind has carried the air (integral of the gust)

# ---------------------------------------------------------------- helpers
def new_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; m.node_tree.nodes.clear(); return m, m.node_tree
def N(nt, kind, **props):
    n = nt.nodes.new(kind)
    for k, v in props.items(): setattr(n, k, v)
    return n
def link(nt, a, b): nt.links.new(a, b)
def math_(nt, op, a, b=None, clamp=False):
    n = N(nt, "ShaderNodeMath", operation=op); n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None: continue
        if isinstance(v, (int, float)): n.inputs[i].default_value = v
        else: link(nt, v, n.inputs[i])
    return n.outputs[0]
def smooth(nt, v, lo, hi, out0=0.0, out1=1.0):
    n = N(nt, "ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
    link(nt, v, n.inputs[0])
    for i, x in zip((1, 2, 3, 4), (lo, hi, out0, out1)): n.inputs[i].default_value = x
    return n.outputs[0]
def image(path, straight=True):
    img = bpy.data.images.load(path); img.alpha_mode = "STRAIGHT" if straight else "NONE"; return img
def mesh_obj(name, verts, faces, mat=None, uvs=None, smooth_shade=False):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces]); me.update()
    if uvs is not None:
        uvl = me.uv_layers.new(name="uv")
        for poly in me.polygons:
            for li in poly.loop_indices: uvl.data[li].uv = uvs[me.loops[li].vertex_index]
    if smooth_shade:
        for poly in me.polygons: poly.use_smooth = True
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    if mat: me.materials.append(mat)
    return ob
def key_all(target, path, values, index=-1):
    for f, v in zip(range(1, NFR + 1), values):
        if index >= 0:
            cur = getattr(target, path); cur[index] = v
        else: setattr(target, path, v)
        target.keyframe_insert(path, frame=f, index=index)
def empty(name, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None); coll.objects.link(e); e.location = loc; return e

# ---------------------------------------------------------------- camera: where the phone stood, a wider lens
F_SET = TC["focal_px"] * R["scale_him"]
cd = bpy.data.cameras.new("SetCam"); cd.sensor_fit = "VERTICAL"; cd.sensor_height = 36.0
cd.lens = F_SET * 36.0 / H
# --shift X,Y (px) reframes one shot without moving the camera (a different crop of the same wider picture): for a
# shot where the creature leaves the take's left or bottom edge, so that edge falls on the frame's own edge
SHIFT = [float(v) for v in opt["--shift"].split(",")] if opt.get("--shift") else R["shift_px"]
cd.shift_x = -SHIFT[0] / H; cd.shift_y = SHIFT[1] / H
cd.clip_start, cd.clip_end = 0.05, 300
cam = bpy.data.objects.new("SetCam", cd); coll.objects.link(cam); sc.camera = cam
cam.rotation_euler = (math.pi / 2 + math.radians(TC["pitch_deg"]), 0, 0)
ease = lambda u: u * u * (3 - 2 * u)
for f in range(1, NFR + 1):
    u = ease((f - 1) / max(NFR - 1, 1))
    cam.location = (R["drift_right_m"] * u, R["push_in_m"] * u, TC["height"]); cam.keyframe_insert("location", frame=f)
HIM = Vector((-(540 - TC["his_x_px"]) / TC["focal_px"] * TC["his_distance"] / math.cos(math.radians(-TC["pitch_deg"])) * 0.9,
              TC["his_distance"], 0))
DOG = Vector((TC["dog_floor"][0], TC["dog_floor"][1], 0))

# ---------------------------------------------------------------- ground
GX0, GX1, GY0, GY1, GS = -13.0, 11.0, -2.5, 27.0, 0.085
nx, ny = int((GX1 - GX0) / GS) + 1, int((GY1 - GY0) / GS) + 1
def ground_h(x, y):
    h = 0.020 * noise.noise(Vector((x * 0.55, y * 0.55, 3.1))) + 0.008 * noise.noise(Vector((x * 2.3, y * 2.3, 7.7)))
    edge = max(0.0, (x - (0.52 * max(y, 2.0) + 0.5)) / 2.0, ((-0.74 * max(y, 2.0) - 0.4) - x) / 2.0, (y - 9.5) / 4.0)
    h += min(edge, 1.0) ** 1.5 * (0.22 + 0.12 * noise.noise(Vector((x * 0.9, y * 0.9, 1.3))))       # the verge rises under the bush
    flat = min(1.0, min((Vector((x, y, 0)) - HIM).length, (Vector((x, y, 0)) - DOG).length) / 1.1)  # the take's floor is flat
    return h * (0.25 + 0.75 * flat)
gv = [(GX0 + i * GS, GY0 + j * GS, ground_h(GX0 + i * GS, GY0 + j * GS)) for j in range(ny) for i in range(nx)]
gf = [(j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i) for j in range(ny - 1) for i in range(nx - 1)]
gm, nt = new_mat("ground")
tc = N(nt, "ShaderNodeTexCoord")
sand_img = image(f"{ld}/sand.png", straight=False); sw, sh = LY["pieces"]["sand"]["size_m"]
def sand_layer(scale, rot, off):
    mp = N(nt, "ShaderNodeMapping"); link(nt, tc.outputs["Object"], mp.inputs[0])
    mp.inputs["Scale"].default_value = (scale / sw, scale / sh, 1); mp.inputs["Rotation"].default_value = (0, 0, rot)
    mp.inputs["Location"].default_value = (off[0], off[1], 0)
    t = N(nt, "ShaderNodeTexImage", image=sand_img, extension="MIRROR"); link(nt, mp.outputs[0], t.inputs[0]); return t.outputs["Color"]
big = N(nt, "ShaderNodeTexNoise"); big.inputs["Scale"].default_value = 0.35; big.inputs["Detail"].default_value = 3
link(nt, tc.outputs["Object"], big.inputs["Vector"])
mixf = smooth(nt, big.outputs[0], 0.40, 0.60)
mx = N(nt, "ShaderNodeMix", data_type="RGBA"); link(nt, mixf, mx.inputs[0])
link(nt, sand_layer(1.0, 0.0, (0.3, 0.1)), mx.inputs[6]); link(nt, sand_layer(0.61, 0.66, (1.7, 0.4)), mx.inputs[7])
tone = N(nt, "ShaderNodeTexNoise"); tone.inputs["Scale"].default_value = 1.1; tone.inputs["Detail"].default_value = 5
link(nt, tc.outputs["Object"], tone.inputs["Vector"])
tonev = smooth(nt, tone.outputs[0], 0.3, 0.7, 0.52, 1.0)
col = N(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY"); col.inputs[0].default_value = 1.0
link(nt, mx.outputs[2], col.inputs[6])
tv = N(nt, "ShaderNodeCombineColor"); [link(nt, tonev, tv.inputs[i]) for i in range(3)]; link(nt, tv.outputs[0], col.inputs[7])
fine = N(nt, "ShaderNodeTexNoise"); fine.inputs["Scale"].default_value = 60; fine.inputs["Detail"].default_value = 6
link(nt, tc.outputs["Object"], fine.inputs["Vector"])
bw = N(nt, "ShaderNodeRGBToBW"); link(nt, mx.outputs[2], bw.inputs[0])
hgt = math_(nt, "ADD", math_(nt, "MULTIPLY", bw.outputs[0], 1.0), math_(nt, "MULTIPLY", fine.outputs[0], 0.25))
bump = N(nt, "ShaderNodeBump"); bump.inputs["Strength"].default_value = 1.0; bump.inputs["Distance"].default_value = 0.035
link(nt, hgt, bump.inputs["Height"])
pb = N(nt, "ShaderNodeBsdfPrincipled"); link(nt, col.outputs[2], pb.inputs["Base Color"]); link(nt, bump.outputs[0], pb.inputs["Normal"])
pb.inputs["Roughness"].default_value = 0.92; pb.inputs["Specular IOR Level"].default_value = 0.25
out = N(nt, "ShaderNodeOutputMaterial"); link(nt, pb.outputs[0], out.inputs["Surface"])
ground = mesh_obj("ground", gv, gf, gm, smooth_shade=True)

# stones, twigs and leaves: real objects, so the flares throw real shadows off them
def scatter_mat(name, rgb, rough=0.9):
    m, t = new_mat(name); b = N(t, "ShaderNodeBsdfPrincipled"); b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough; o = N(t, "ShaderNodeOutputMaterial"); link(t, b.outputs[0], o.inputs["Surface"]); return m
def in_view(x, y, margin=0.3): return -0.74 * y - margin < x < 0.52 * y + margin
# --clear_litter PX (with --performer; off by default): no stone, twig or leaf under the picture of him and the
# creature. Below his feet's row the picture lies on the ground, 12 mm above it, and litter up to 2.5 cm high came
# up through the creature's paws as light chips (verse 35.7, 13 Nov). A piece of litter goes when it lies nearer than
# he stands and the phone sees it inside the cut-out on any frame of the shot, grown PX pixels (20: half a leaf).
# The random draws stay the same, so every other piece of litter lies where it lay
CLEAR = None
if opt.get("--clear_litter") and "--performer" in opt:
    _o = int(opt.get("--perf_offset", 0)); _fs = sorted(f for f in os.listdir(opt["--performer"]) if f.startswith("p_") and f.endswith(".png"))[_o:_o + NFR]
    for _f in _fs:
        _im = bpy.data.images.load(os.path.abspath(os.path.join(opt["--performer"], _f))); _cw, _ch = _im.size
        _px = np.empty(_cw * _ch * 4, np.float32); _im.pixels.foreach_get(_px); bpy.data.images.remove(_im)
        _a = _px.reshape(_ch, _cw, 4)[::-1, :, 3] > 0.5                    # Blender's rows run bottom-up
        CLEAR = _a if CLEAR is None else CLEAR | _a
    _g = int(opt["--clear_litter"]); _c = CLEAR.copy()
    for _k in range(1, _g + 1): _c[:, _k:] |= CLEAR[:, :-_k]; _c[:, :-_k] |= CLEAR[:, _k:]
    CLEAR = _c.copy()
    for _k in range(1, _g + 1): CLEAR[_k:] |= _c[:-_k]; CLEAR[:-_k] |= _c[_k:]
    _th = math.pi / 2 + math.radians(TC["pitch_deg"]); _sn, _cs = math.sin(_th), math.cos(_th); _fp = TC["focal_px"] * _cw / 1080.0
N_CLEARED = [0]
def cleared(x, y):
    if CLEAR is None or y > HIM.y: return False
    dy_, dz_ = y, ground_h(x, y) - TC["height"]; fw = dy_ * _sn - dz_ * _cs
    if fw <= 0: return False
    u = _cw / 2 + _fp * x / fw; v = _ch / 2 + _fp * (-dy_ * _cs - dz_ * _sn) / fw
    hit = 0 <= u < _cw and 0 <= v < _ch and bool(CLEAR[int(v), int(u)])
    N_CLEARED[0] += hit; return hit
bm = bmesh.new()
for _ in range(700):                                                   # stones, 0.5-2.5 cm
    y = rng.uniform(0.9, 11); x = rng.uniform(-0.8 * y - 0.5, 0.56 * y + 0.5); s = rng.choice([0.004, 0.006, 0.008, 0.012, 0.02]) * rng.uniform(0.6, 1.3)
    if (Vector((x, y, 0)) - HIM).length < 0.35: continue
    geo = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    for v in geo["verts"]:
        v.co = Vector((v.co.x * s * rng.uniform(0.8, 1.6), v.co.y * s * rng.uniform(0.8, 1.4), v.co.z * s * 0.6)) + Vector((x, y, ground_h(x, y) + s * 0.25))
    if cleared(x, y): bmesh.ops.delete(bm, geom=geo["verts"], context="VERTS")
me = bpy.data.meshes.new("stones"); bm.to_mesh(me); bm.free()
ob = bpy.data.objects.new("stones", me); coll.objects.link(ob); me.materials.append(scatter_mat("stone", (0.20, 0.18, 0.16)))
tv_, tf_ = [], []
for _ in range(110):                                                   # twigs, 5-16 cm, lying
    y = rng.uniform(1.7, 10); x = rng.uniform(-0.8 * y - 0.4, 0.56 * y + 0.4); L_ = rng.uniform(0.05, 0.16); a = rng.uniform(0, math.pi); r = rng.uniform(0.0015, 0.0035)
    if (Vector((x, y, 0)) - HIM).length < 0.35: continue
    dx, dy = math.cos(a) * L_ / 2, math.sin(a) * L_ / 2; z = ground_h(x, y) + r; b0 = len(tv_)
    px_, py_ = -math.sin(a) * r, math.cos(a) * r
    tv_ += [(x - dx - px_, y - dy - py_, z), (x - dx + px_, y - dy + py_, z), (x + dx + px_, y + dy + py_, z + rng.uniform(0, 0.03)), (x + dx - px_, y + dy - py_, z + rng.uniform(0, 0.03)),
            (x - dx, y - dy, z + 2 * r), (x + dx, y + dy, z + 2 * r + rng.uniform(0, 0.03))]
    tf_ += [(b0, b0 + 1, b0 + 2, b0 + 3), (b0 + 1, b0 + 4, b0 + 5, b0 + 2), (b0 + 4, b0, b0 + 3, b0 + 5)]
    if cleared(x, y) or cleared(x - dx, y - dy) or cleared(x + dx, y + dy): del tv_[b0:]; del tf_[-3:]
mesh_obj("twigs", tv_, tf_, scatter_mat("twig", (0.16, 0.11, 0.07)))
lv_, lf_ = [], []
for _ in range(520):                                                   # dry leaves, 3-7 cm, curled
    if rng.random() < 0.45:                                            # some gather in drifts, as in the look plate
        c = rng.choice([(-0.9, 3.2), (0.6, 1.5), (-1.6, 5.4), (1.2, 4.0), (0.2, 6.5)]); x = c[0] + rng.gauss(0, 0.28); y = c[1] + rng.gauss(0, 0.22)
    else:
        y = rng.uniform(1.0, 10); x = rng.uniform(-0.8 * y - 0.4, 0.56 * y + 0.4)
    if (Vector((x, y, 0)) - HIM).length < 0.3: continue
    s = rng.uniform(0.025, 0.05); a = rng.uniform(0, math.pi * 2); z = ground_h(x, y) + 0.004; b0 = len(lv_); curl = rng.uniform(0.004, 0.02)
    ca, sa = math.cos(a), math.sin(a)
    for (u, v_, w_) in ((-1, -0.62, curl), (1, -0.62, 0), (1, 0.62, curl), (-1, 0.62, 0)):
        lv_.append((x + (u * ca - v_ * sa) * s / 2, y + (u * sa + v_ * ca) * s / 2, z + w_))
    if cleared(x, y): del lv_[b0:]
    else: lf_.append((b0, b0 + 1, b0 + 2, b0 + 3))
mesh_obj("leaves", lv_, lf_, scatter_mat("leaf", (0.30, 0.20, 0.10), 0.7))
if CLEAR is not None: print(f"litter cleared from under the picture: {N_CLEARED[0]} pieces")

# ---------------------------------------------------------------- the car: a relief of its front + a body behind it
cx0, cy0, cx1, cy1 = LY["pieces"]["car"]["crop"]
depth = np.load(f"{ld}/car_depth.npy")
car_img = image(f"{ld}/car.png")
alpha = np.array(car_img.pixels[:]).reshape(car_img.size[1], car_img.size[0], 4)[::-1, :, 3]
ST = 6; ys = list(range(0, depth.shape[0], ST)); xs = list(range(0, depth.shape[1], ST))
F0, HOR0, CH0, CX0, Z0 = TS["focal_px"], TS["horizon_y"], TS["camera_height"], TS["car_centre_x"], TS["car_front_depth"]
cv, cuv = [], []
for j in ys:
    for i in xs:
        zs = float(depth[j, i]); px, py = cx0 + i, cy0 + j
        cv.append(((px - CX0) * zs / F0, zs - Z0, max(CH0 - (py - HOR0) * zs / F0, 0.0)))
        cuv.append((i / depth.shape[1], 1 - j / depth.shape[0]))
cf = []
for a_ in range(len(ys) - 1):
    for b_ in range(len(xs) - 1):
        if alpha[ys[a_]:ys[a_ + 1] + 1, xs[b_]:xs[b_ + 1] + 1].max() < 0.02: continue
        i0 = a_ * len(xs) + b_; cf.append((i0, i0 + len(xs), i0 + len(xs) + 1, i0 + 1))
cm, nt = new_mat("car_front")
tx = N(nt, "ShaderNodeTexImage", image=car_img, extension="CLIP")
bw = N(nt, "ShaderNodeRGBToBW"); link(nt, tx.outputs["Color"], bw.inputs[0])
bump = N(nt, "ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.35; bump.inputs["Distance"].default_value = 0.01; link(nt, bw.outputs[0], bump.inputs["Height"])
pb = N(nt, "ShaderNodeBsdfPrincipled"); link(nt, tx.outputs["Color"], pb.inputs["Base Color"]); link(nt, tx.outputs["Alpha"], pb.inputs["Alpha"])
pb.inputs["Roughness"].default_value = 0.42; pb.inputs["Coat Weight"].default_value = 0.35; pb.inputs["Coat Roughness"].default_value = 0.18
link(nt, bump.outputs[0], pb.inputs["Normal"]); link(nt, tx.outputs["Color"], pb.inputs["Emission Color"])
pb.inputs["Emission Strength"].default_value = float(opt.get("--car_emit", 0.38))      # the photograph's own modelling, held low: a black car is seen by what it reflects
out = N(nt, "ShaderNodeOutputMaterial"); link(nt, pb.outputs[0], out.inputs["Surface"])
cm.surface_render_method = "DITHERED"
car_root = empty("car_root", (CAR["front_centre"][0], CAR["front_centre"][1], 0))
car_root.rotation_euler = (0, 0, math.atan2(-CAR["front_centre"][0], CAR["front_centre"][1]))   # its nose toward the camera
relief = mesh_obj("car_relief", cv, cf, cm, uvs=cuv, smooth_shade=True); relief.parent = car_root
bodym, nt = new_mat("car_body"); pb = N(nt, "ShaderNodeBsdfPrincipled"); pb.inputs["Base Color"].default_value = (0.012, 0.012, 0.013, 1)
pb.inputs["Roughness"].default_value = 0.25; pb.inputs["Coat Weight"].default_value = 1.0
out = N(nt, "ShaderNodeOutputMaterial"); link(nt, pb.outputs[0], out.inputs["Surface"])
def box(name, x0, x1, y0, y1, z0, z1, mat, parent=None):
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    o = mesh_obj(name, v, f, mat); o.parent = parent; return o
hw = CAR["width_m"] / 2
box("car_lower", -hw + 0.08, hw - 0.08, 0.50, CAR["length_m"], 0.38, 1.00, bodym, car_root)
box("car_cabin", -0.78, 0.78, 1.95, CAR["length_m"] - 0.05, 1.00, CAR["height_m"] - 0.06, bodym, car_root)   # behind the relief's windscreen and roof edge
for sx_ in (-1, 1):                                                    # tyres: they carry the car's shadow to the ground
    for yy_ in (1.10, 3.47): box(f"tyre_{sx_}_{yy_}", sx_ * (hw - 0.30), sx_ * (hw - 0.03), yy_ - 0.38, yy_ + 0.38, 0.0, 0.78, bodym, car_root)
# the daytime running lights, MEASURED on the still (x 395-505 and 1068-1177, y 1739-1755 at the fascia)
drlm, nt = new_mat("drl"); em = N(nt, "ShaderNodeEmission"); em.inputs["Color"].default_value = (0.82, 0.90, 1.0, 1)
em.inputs["Strength"].default_value = float(opt.get("--drl", 55)); out = N(nt, "ShaderNodeOutputMaterial"); link(nt, em.outputs[0], out.inputs["Surface"])
for (a_, b_) in ((395, 505), (1068, 1177)):
    xa, xb = (a_ - CX0) * Z0 / F0, (b_ - CX0) * Z0 / F0; za, zb = CH0 - (1755 - HOR0) * Z0 / F0, CH0 - (1739 - HOR0) * Z0 / F0
    o = mesh_obj("drl", [(xa, -0.012, za), (xb, -0.012, za), (xb, -0.012, zb), (xa, -0.012, zb)], [(0, 1, 2, 3)], drlm); o.parent = car_root
    lt = bpy.data.lights.new("drl_light", "SPOT"); lt.energy = 18; lt.color = (0.82, 0.90, 1.0); lt.spot_size = math.radians(110); lt.spot_blend = 0.8
    lo = bpy.data.objects.new("drl_light", lt); coll.objects.link(lo); lo.parent = car_root; lo.location = ((xa + xb) / 2, -0.05, (za + zb) / 2)
    lo.rotation_euler = (math.radians(80), 0, 0)                                       # forward and a little down, onto the track

# ---------------------------------------------------------------- plants: cut-out cards that bend in the wind
card_mats = {}
def card_mat(name):
    if name in card_mats: return card_mats[name]
    m, nt = new_mat("card_" + name); tx = N(nt, "ShaderNodeTexImage", image=image(f"{ld}/card_{name}.png"), extension="CLIP")
    pb = N(nt, "ShaderNodeBsdfPrincipled"); link(nt, tx.outputs["Color"], pb.inputs["Base Color"]); link(nt, tx.outputs["Alpha"], pb.inputs["Alpha"])
    pb.inputs["Roughness"].default_value = 0.85; pb.inputs["Specular IOR Level"].default_value = 0.2
    out = N(nt, "ShaderNodeOutputMaterial"); link(nt, pb.outputs[0], out.inputs["Surface"])
    m.surface_render_method = "DITHERED"; m.use_backface_culling = False
    card_mats[name] = m; return m
CARDS = []
def card(name, x, y, height, z0=None, mirror=False, yaw_jit=0.0, sway=1.0, hang=False):
    """A cut-out of the still at (x, y), `height` metres tall, turned to the camera. hang: a branch held from its top."""
    w_m, h_m = LY["pieces"][name]["size_m"]; wdt = height * w_m / h_m
    nxs, nzs = 8, 12; verts, uvs, faces = [], [], []
    for j in range(nzs + 1):
        for i in range(nxs + 1):
            u, v = i / nxs, j / nzs
            verts.append(((u - 0.5) * wdt, 0, v * height)); uvs.append(((1 - u) if mirror else u, v))
    for j in range(nzs):
        for i in range(nxs):
            a_ = j * (nxs + 1) + i; faces.append((a_, a_ + 1, a_ + nxs + 2, a_ + nxs + 1))
    if z0 is None and any(math.hypot(x - f_["pos"][0], y - f_["pos"][1]) < 1.1 for f_ in P["flares"]): return None
    ob = mesh_obj(f"{name}_{len(CARDS)}", verts, faces, card_mat(name), uvs=uvs)
    z = ground_h(x, y) - 0.03 if z0 is None else z0
    ob.location = (x, y, z); ob.rotation_euler = (0, 0, math.atan2(-x, y) + yaw_jit)
    ob.shape_key_add(name="Basis"); k1 = ob.shape_key_add(name="sway"); k2 = ob.shape_key_add(name="flutter")
    seed = rng.uniform(0, 100)
    for idx, v in enumerate(verts):
        up = (1 - v[2] / height) if hang else v[2] / height                    # 0 where it is held, 1 at its free end
        k1.data[idx].co = (v[0] + 0.11 * height * up ** 1.8, v[1] + 0.04 * height * up ** 1.8, v[2] - 0.02 * height * up ** 2)
        n1 = noise.noise(Vector((v[0] * 2.1, v[2] * 2.1, seed))); n2 = noise.noise(Vector((v[0] * 2.1 + 9, v[2] * 2.1, seed)))
        k2.data[idx].co = (v[0] + 0.030 * height * up * n1, v[1] + 0.030 * height * up * n2, v[2])
    for k in (k1, k2): k.slider_min, k.slider_max = -3, 3
    ph = rng.uniform(0, 0.5); amp = sway * rng.uniform(0.7, 1.2)
    for f in range(1, NFR + 1):
        t = (f - 1) / FPS
        k1.value = amp * (gust(t - ph) - WD["base"] * 0.6) * 0.42; k1.keyframe_insert("value", frame=f)
        k2.value = amp * (0.9 * math.sin(2 * math.pi * (1.7 * t + seed)) + 0.6 * math.sin(2 * math.pi * (2.9 * t + 2 * seed))) * (0.4 + 0.6 * gust(t - ph))
        k2.keyframe_insert("value", frame=f)
    CARDS.append(ob); return ob
left_x = lambda y: -0.74 * y - 0.25
right_x = lambda y: 0.52 * y + 0.30
y = 2.6
while y < 12.5:                                                        # the clearing's left edge: thorn bush over tall grass
    card("thorn_l", left_x(y) - rng.uniform(0.2, 0.9), y + rng.uniform(-0.2, 0.2), rng.uniform(2.3, 3.3), mirror=rng.random() < 0.5, yaw_jit=rng.uniform(-0.3, 0.3))
    card("grass_l", left_x(y) + rng.uniform(-0.35, 0.25), y - 0.3 + rng.uniform(-0.2, 0.2), rng.uniform(1.2, 1.7), mirror=rng.random() < 0.5, yaw_jit=rng.uniform(-0.3, 0.3), sway=1.4)
    y += rng.uniform(0.55, 0.95)
y = 2.9
while y < 12.5:                                                        # the right edge
    card("twigs_r", right_x(y) + rng.uniform(0.3, 1.0), y + rng.uniform(-0.2, 0.2), rng.uniform(2.0, 3.0), mirror=rng.random() < 0.5, yaw_jit=rng.uniform(-0.3, 0.3))
    card("grass_r", right_x(y) + rng.uniform(-0.25, 0.3), y - 0.3 + rng.uniform(-0.2, 0.2), rng.uniform(1.2, 1.8), mirror=rng.random() < 0.5, yaw_jit=rng.uniform(-0.3, 0.3), sway=1.4)
    y += rng.uniform(0.55, 0.95)
for i in range(46):                                                    # the bush behind the car, three rows deep
    yb = rng.uniform(9.8, 15.5); xb = rng.uniform(left_x(yb) - 0.5, right_x(yb) + 0.5)
    nm = rng.choice(["thorn_l", "twigs_r", "far_l", "grass_l", "grass_r"])
    card(nm, xb, yb, {"far_l": rng.uniform(3.5, 5.0), "grass_l": rng.uniform(1.4, 2.0), "grass_r": rng.uniform(1.4, 2.0)}.get(nm, rng.uniform(2.6, 3.8)), mirror=rng.random() < 0.5, yaw_jit=rng.uniform(-0.25, 0.25))
for i in range(10):                                                    # grass beside the car and along the track's verge
    side = rng.choice([-1, 1]); yb = rng.uniform(4.6, 9.5)
    xb = CAR["front_centre"][0] + side * rng.uniform(1.25, 2.0) if rng.random() < 0.6 else (left_x(yb) + 0.5 if side < 0 else right_x(yb) - 0.4)
    card("grass_l" if side < 0 else "grass_r", xb, yb, rng.uniform(0.8, 1.4), mirror=rng.random() < 0.5, yaw_jit=rng.uniform(-0.3, 0.3), sway=1.5)
for (xb, yb, hb, zb, mir) in ((-7.5, 15.5, 9.0, 1.5, False), (2.5, 16.5, 10.0, 1.2, True), (-2.5, 18.0, 11.0, 1.0, False), (6.5, 14.0, 8.5, 1.5, False), (-11.0, 13.0, 8.0, 1.5, True)):
    card("canopy", xb, yb, hb, z0=zb, mirror=mir, sway=0.5)            # the trees behind
for (xb, yb, hb, zb, mir) in ((2.3, 5.2, 3.4, 2.5, False), (-3.6, 4.4, 3.2, 2.7, True), (0.4, 8.2, 4.2, 3.0, True)):
    card("canopy", xb, yb, hb, z0=zb, mirror=mir, sway=0.9, hang=True) # branches hanging over the clearing, near the lens
card("grass_l", -1.72, 2.05, 0.95, mirror=False, sway=1.6); card("grass_r", 1.28, 2.25, 0.85, mirror=True, sway=1.6)   # at the frame's edges, in front of him
# --tuft "x,y,h;x,y,h": extra clumps of dry grass (metres), for a shot that needs something of the set in front of a
# part of him or the creature (PROBLEM_INDEX, 'put a plate object in front of it'): on Hyenas verse 11.56 the
# creature's hindquarters are cut by the take's left edge and a clump stands in front of the cut. The random stream
# is put back afterwards, so the rest of the set is the same with or without them.
if opt.get("--tuft"):
    _st = rng.getstate()
    for i_, spec in enumerate(opt["--tuft"].split(";")):
        tx_, ty_, th_ = (float(v) for v in spec.split(","))
        card("grass_l" if i_ % 2 == 0 else "grass_r", tx_, ty_, th_, mirror=i_ % 3 == 1, sway=1.5)
    rng.setstate(_st)

# ---------------------------------------------------------------- flares: flame + light, flickering
def flicker(seed):
    r = random.Random(seed); comps = [(a, f * r.uniform(0.9, 1.1), r.uniform(0, 6.28)) for a, f in ((0.07, 3.1), (0.06, 7.3), (0.05, 11.9), (0.04, 17.1), (0.03, 23.0))]
    # --flicker_rate R (default 1): every flicker speed times R, the depth of the flicker unchanged. At 24 pictures a
    # second the 12, 17 and 23 Hz parts are faster than the film can show: they land as a jump on every picture, and
    # the ground that only a flare lights (the shadow he and the creature throw) pulses with them (verse 35.7,
    # 13 Nov: that shadow's brightness changed 3.6 % a frame, open ground 0.8 %). 0.25 keeps all five parts under 6 Hz
    comps = [(a, f * float(opt.get("--flicker_rate", 1.0)), ph) for a, f, ph in comps]
    return [1.0 + sum(a * math.sin(2 * math.pi * f * t + ph) for a, f, ph in comps) for t in TIMES]
FLARES = []
flm, nt = new_mat("flare_body"); pb = N(nt, "ShaderNodeBsdfPrincipled"); pb.inputs["Base Color"].default_value = (0.5, 0.04, 0.03, 1)
out = N(nt, "ShaderNodeOutputMaterial"); link(nt, pb.outputs[0], out.inputs["Surface"])
for fl in P["flares"]:
    x, y = fl["pos"]; z = ground_h(x, y); fk = flicker(fl["seed"])
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.016, radius2=0.016, depth=0.26)
    me = bpy.data.meshes.new("flare"); bm.to_mesh(me); bm.free()
    st = bpy.data.objects.new("flare_" + fl["name"], me); coll.objects.link(st); me.materials.append(flm)
    st.visible_shadow = False; st.location = (x, y, z + 0.05); st.rotation_euler = (math.radians(68), 0, rng.uniform(0, 3.14))
    tip = Vector((x, y, z + 0.13))
    fm, nt = new_mat("flame_" + fl["name"]); em = N(nt, "ShaderNodeEmission"); em.inputs["Color"].default_value = (1.0, 0.075, 0.02, 1)
    out = N(nt, "ShaderNodeOutputMaterial"); link(nt, em.outputs[0], out.inputs["Surface"])
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    me = bpy.data.meshes.new("flame"); bm.to_mesh(me); bm.free()
    flame = bpy.data.objects.new("flame_" + fl["name"], me); coll.objects.link(flame); me.materials.append(fm); flame.location = tip + Vector((0, 0, 0.04)); flame.visible_shadow = False
    lt = bpy.data.lights.new("flare_light_" + fl["name"], "POINT"); lt.color = (1.0, 0.045, 0.022); lt.shadow_soft_size = 0.035
    lo = bpy.data.objects.new("flare_light_" + fl["name"], lt); coll.objects.link(lo); lo.location = tip + Vector((0, 0, 0.22))
    for f in range(1, NFR + 1):
        k = fk[f - 1]
        lt.energy = fl["power"] * k * float(opt.get("--flare", 1.7)); lt.keyframe_insert("energy", frame=f)
        em.inputs["Strength"].default_value = 1500 * k; em.inputs["Strength"].keyframe_insert("default_value", frame=f)
        flame.scale = (0.034 * (0.8 + 0.4 * k), 0.034 * (0.8 + 0.4 * k), 0.085 * (0.5 + 0.7 * k) * (1 + 0.25 * math.sin(f * 2.1 + fl["seed"])))
        flame.keyframe_insert("scale", frame=f)
    FLARES.append((fl, tip))

# ---------------------------------------------------------------- the lamp that lit the take: white, from the camera's left
key = bpy.data.lights.new("key", "SPOT"); key.energy = float(opt.get("--key", 950)); key.color = (0.93, 0.96, 1.0)
key.spot_size = math.radians(118); key.spot_blend = 0.9; key.shadow_soft_size = 0.22
ko = bpy.data.objects.new("key", key); coll.objects.link(ko); ko.location = (-1.6, -3.2, 3.1)
aim = empty("key_aim", (-0.4, 5.5, 1.2)); c = ko.constraints.new("TRACK_TO"); c.target = aim; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"

# ---------------------------------------------------------------- smoke: a plume over each flare and a low haze
flow = empty("smoke_flow"); flow2 = empty("haze_flow")
for f in range(1, NFR + 1):
    t = (f - 1) / FPS; run = float(RUN[f - 1])
    flow.location = (0.55 * run * WD["toward_x"], 0.06 * t, 0.95 * t); flow.keyframe_insert("location", frame=f)
    flow2.location = (0.35 * run * WD["toward_x"], 0.10 * t, 0.04 * t); flow2.keyframe_insert("location", frame=f)
def plume(fl, tip):
    sx, sy, sz = 5.0, 3.4, 6.0; lean = 0.24 * WD["toward_x"]
    m, nt = new_mat("plume_" + fl["name"])
    tc = N(nt, "ShaderNodeTexCoord"); sep = N(nt, "ShaderNodeSeparateXYZ"); link(nt, tc.outputs["Object"], sep.inputs[0])
    X, Y, Z = sep.outputs
    zc = math_(nt, "MAXIMUM", Z, 0.0)
    tcf = N(nt, "ShaderNodeTexCoord"); tcf.object = flow
    wr = N(nt, "ShaderNodeTexNoise"); wr.inputs["Scale"].default_value = 0.55; wr.inputs["Detail"].default_value = 2
    link(nt, tcf.outputs["Object"], wr.inputs["Vector"])
    wsep = N(nt, "ShaderNodeSeparateColor"); link(nt, wr.outputs["Color"], wsep.inputs[0])
    billow = math_(nt, "MULTIPLY", math_(nt, "MINIMUM", zc, 2.5), 0.62)                 # it wanders more the higher it gets
    cxn = math_(nt, "ADD", math_(nt, "MULTIPLY", math_(nt, "POWER", zc, 1.25), lean), math_(nt, "MULTIPLY", math_(nt, "SUBTRACT", wsep.outputs[0], 0.5), billow))
    cyn = math_(nt, "MULTIPLY", math_(nt, "SUBTRACT", wsep.outputs[1], 0.5), billow)
    dx = math_(nt, "SUBTRACT", X, cxn); dy = math_(nt, "SUBTRACT", Y, cyn)
    dist = math_(nt, "SQRT", math_(nt, "ADD", math_(nt, "MULTIPLY", dx, dx), math_(nt, "MULTIPLY", dy, dy)))
    rad = math_(nt, "ADD", math_(nt, "MULTIPLY", zc, 0.21), 0.06)
    core = smooth(nt, math_(nt, "DIVIDE", dist, rad), 0.10, 1.0, 1.0, 0.0)
    nz = N(nt, "ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 2.3; nz.inputs["Detail"].default_value = 7; nz.inputs["Roughness"].default_value = 0.66
    nz.inputs["Distortion"].default_value = 0.9
    mixv = N(nt, "ShaderNodeMix", data_type="VECTOR"); mixv.inputs[0].default_value = 0.30
    link(nt, tcf.outputs["Object"], mixv.inputs[4]); link(nt, wr.outputs["Color"], mixv.inputs[5]); link(nt, mixv.outputs[1], nz.inputs["Vector"])
    wisp = smooth(nt, nz.outputs[0], 0.44, 0.63)
    fade = math_(nt, "MULTIPLY", smooth(nt, Z, 0.0, 0.10), smooth(nt, Z, 2.2, 5.6, 1.0, 0.0))
    thin = math_(nt, "DIVIDE", 1.0, math_(nt, "ADD", 1.0, math_(nt, "MULTIPLY", zc, 0.55)))
    dens = math_(nt, "MULTIPLY", math_(nt, "MULTIPLY", math_(nt, "MULTIPLY", core, wisp), math_(nt, "MULTIPLY", fade, thin)), float(opt.get("--smoke", 46.0)))
    pv = N(nt, "ShaderNodeVolumePrincipled"); pv.inputs["Color"].default_value = (0.86, 0.60, 0.56, 1)
    pv.inputs["Anisotropy"].default_value = 0.35; link(nt, dens, pv.inputs["Density"])
    glow = math_(nt, "MULTIPLY", dens, math_(nt, "MULTIPLY", smooth(nt, Z, 0.0, 2.0, 1.0, 0.0), 1.5))   # the flame inside its own smoke
    link(nt, glow, pv.inputs["Emission Strength"]); pv.inputs["Emission Color"].default_value = (1.0, 0.07, 0.035, 1)
    out = N(nt, "ShaderNodeOutputMaterial"); link(nt, pv.outputs[0], out.inputs["Volume"])
    o = box("plume_" + fl["name"], -1.0, sx - 1.0, -sy / 2, sy / 2, 0.0, sz, m); o.location = (tip.x, tip.y, tip.z)
    return o
for fl, tip in FLARES: plume(fl, tip)
hm, nt = new_mat("haze")
tc = N(nt, "ShaderNodeTexCoord"); sep = N(nt, "ShaderNodeSeparateXYZ"); link(nt, tc.outputs["Object"], sep.inputs[0])
tcf = N(nt, "ShaderNodeTexCoord"); tcf.object = flow2
nz = N(nt, "ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 0.42; nz.inputs["Detail"].default_value = 4; link(nt, tcf.outputs["Object"], nz.inputs["Vector"])
hd = math_(nt, "MULTIPLY", math_(nt, "MULTIPLY", smooth(nt, nz.outputs[0], 0.38, 0.72), smooth(nt, sep.outputs[2], 0.15, 2.4, 1.0, 0.0)), float(opt.get("--haze", 0.02)))
pv = N(nt, "ShaderNodeVolumePrincipled"); pv.inputs["Color"].default_value = (0.8, 0.8, 0.8, 1); pv.inputs["Anisotropy"].default_value = 0.4; link(nt, hd, pv.inputs["Density"])
out = N(nt, "ShaderNodeOutputMaterial"); link(nt, pv.outputs[0], out.inputs["Volume"])
box("haze", -11.0, 9.0, 1.2, 17.0, 0.0, 2.6, hm)

# ---------------------------------------------------------------- him and the creature: the take's own picture, in the scene
# --performer <dir> (prep_performer.py's p_0001.png ..., the put-back cut out by the delivered matte) with
# --perf_depth <npz> (hyenas_performer_depth.py). The set camera stands where the phone stood, so each pixel of the
# take lies on a known ray from that point. The picture is laid on one surface along those rays: upright through his
# feet where he is, facing the phone and standing on the ground where the creature lies nearer the camera, and a
# smooth ramp between the two that only the chain crosses. It is then an object in the scene: the lamp and the flares
# light it, it throws its shadows on the ground, the smoke hangs in front of and behind it, and the camera's move
# shifts the creature against him. His pixels are lit, never redrawn; the matte is used as delivered.
if "--performer" in opt:
    # without --perf_depth the whole picture stands on his upright surface (one depth): for a creature that stands
    # at his feet, in front of his legs, where there is no bare floor between the two to step across
    if opt.get("--perf_depth"):
        PD = np.load(opt["--perf_depth"]); wmap = PD["weight"]; pw, ph = (int(v) for v in PD["size"]); crow = float(PD["contact"][1])
    else:
        pw, ph = 1080, 1920; wmap = np.zeros((2, 2), np.float32); crow = ph - 1.0
    # --creature_row R (take row, in the cut-out's pixels): where the creature's BODY meets the ground. Default: its
    # lowest point, which stands the whole animal up on its paws. A creature that lies with its front legs stretched
    # toward the camera rests on the ground at its chest and elbows; given that row, its head and chest stand there and
    # everything lower in the picture (the legs, the paws) is laid on the ground by the rule below, so it throws a
    # lying animal's shadow, not the long legs' shadow of a standing one (Fendi, 13 Nov: "I think the hyenas leg is missing")
    crow = float(opt.get("--creature_row", crow))
    off = int(opt.get("--perf_offset", 0)); files = sorted(f for f in os.listdir(opt["--performer"]) if f.startswith("p_") and f.endswith(".png"))
    assert len(files) - off >= NFR, (len(files), off, NFR)
    fpx = TC["focal_px"] * pw / 1080.0; th = math.pi / 2 + math.radians(TC["pitch_deg"]); sn, cs = math.sin(th), math.cos(th)
    Cc = Vector((0, 0, TC["height"]))
    ray = lambda u, v: Vector(((u - pw / 2) / fpx, -(v - ph / 2) / fpx * cs + sn, -(v - ph / 2) / fpx * sn - cs))
    dg = ray(pw / 2, crow); tg = Cc.z / -dg.z
    for _ in range(3): tg = (Cc.z - ground_h(0.0, (Cc + tg * dg).y)) / -dg.z       # the creature's lowest point rests on the ground
    step = int(opt.get("--perf_step", 4)); nx, ny = pw // step + 1, ph // step + 1
    laid = {}
    def surface(kind):
        """The take's picture along the phone's rays. kind: 'him' (upright through his feet), 'creature' (facing the
        phone, on the ground at --creature_row) or 'ramp' (the weight between the two: what the chain hangs on)."""
        pv, puv = [], []; n_ground = 0
        for j in range(ny):
            for i in range(nx):
                u, v = min(i * step, pw), min(j * step, ph); d = ray(u, v)
                w = 0.0 if kind == "him" else 1.0 if kind == "creature" else \
                    float(wmap[min(int(v * wmap.shape[0] / ph), wmap.shape[0] - 1), min(int(u * wmap.shape[1] / pw), wmap.shape[1] - 1)])
                t = (1 - w) * (HIM.y / d.y) + w * tg                                # d . (the phone's forward) is 1
                # the chain's surface starts exactly on his (the weight is 0 at his hand). Two surfaces in one place
                # rendered him black (13 Nov: him alone lit, him + ramp black, ramp 2 cm nearer lit), so the
                # chain's surface is kept 2 cm nearer the camera than the weight says
                if kind == "ramp" and mimg: t -= 0.02
                # nothing of them is under the ground: a shoe's toe points at the camera and sits lower in the picture
                # than his heel, so on the upright surface it fell below the dirt and the ground hid it (Fendi, 13 Nov:
                # "the gum sole on my shoe was not preserved making my feet look like they are disappearing"). Where
                # the surface would dip under the ground the picture lies on the ground instead, 12 mm above it
                if d.z < 0:
                    tgr = Cc.z / -d.z
                    for _ in range(3):
                        q = Cc + tgr * d; tgr = (Cc.z - ground_h(q.x, q.y) - 0.012) / -d.z
                    if tgr < t: t = tgr; n_ground += 1
                pv.append(Cc + t * d); puv.append((u / pw, 1 - v / ph))
        laid[kind] = n_ground
        return pv, puv, [(j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i) for j in range(ny - 1) for i in range(nx - 1)]
    img = bpy.data.images.load(os.path.abspath(os.path.join(opt["--performer"], files[0]))); img.source = "SEQUENCE"; img.alpha_mode = "STRAIGHT"
    # --perf_masks <dir> (hyenas_performer_depth.py --masks: m_0001.png ..., red = him, green = thin parts between the
    # two, blue = the creature): each pixel of the picture then lies on the surface of what it shows. One surface for
    # everything had to slope from his depth to the creature's, and whatever came near that slope was pulled along it:
    # his shoe's edge ran into the creature's ear where they touch (verse 1.4, 13 Nov). With three surfaces his shoe
    # stays at his feet, the creature stays where it lies, and only the chain crosses between them.
    mimg = None
    if opt.get("--perf_masks"):
        mfiles = sorted(f for f in os.listdir(opt["--perf_masks"]) if f.startswith("m_") and f.endswith(".png"))
        assert len(mfiles) == len(files), (len(mfiles), len(files))
        mimg = bpy.data.images.load(os.path.abspath(os.path.join(opt["--perf_masks"], mfiles[0]))); mimg.source = "SEQUENCE"
        mimg.colorspace_settings.name = "Non-Color"
    def seq(node, image):
        node.image = image; node.extension = "CLIP"
        node.image_user.frame_duration = len(files); node.image_user.frame_start = 1; node.image_user.frame_offset = off; node.image_user.use_auto_refresh = True
    def material(name, channel):
        pm, nt = new_mat(name)
        tx = N(nt, "ShaderNodeTexImage"); seq(tx, img); tx.interpolation = "Cubic"
        gain = N(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY"); gain.inputs[0].default_value = 1.0
        g = float(opt.get("--perf_gain", 1.0)); gain.inputs[7].default_value = (g, g, g, 1); gain.clamp_result = False
        link(nt, tx.outputs["Color"], gain.inputs[6])
        pb = N(nt, "ShaderNodeBsdfPrincipled"); pb.inputs["Roughness"].default_value = 1.0; pb.inputs["Specular IOR Level"].default_value = 0.0
        link(nt, gain.outputs[2], pb.inputs["Base Color"])
        link(nt, tx.outputs["Color"], pb.inputs["Emission Color"]); pb.inputs["Emission Strength"].default_value = float(opt.get("--perf_emit", 0.0))
        # --perf_back: the share of light arriving from behind the picture that shows on its front. A flat picture
        # cannot catch the flares that burn behind him on its edges as a body does; this lets their red reach him
        tl = N(nt, "ShaderNodeBsdfTranslucent"); link(nt, gain.outputs[2], tl.inputs["Color"])
        mb = N(nt, "ShaderNodeMixShader"); mb.inputs[0].default_value = float(opt.get("--perf_back", 0.0))
        link(nt, pb.outputs[0], mb.inputs[1]); link(nt, tl.outputs[0], mb.inputs[2])
        # the picture is lit as one upright picture facing the phone, whatever the surface under it does: where it
        # slopes or lies on the ground under a shoe's toe, its own slant would catch the flares differently from the
        # rest of him (a red wedge between his shoe and the creature, 13 Nov)
        nv = N(nt, "ShaderNodeCombineXYZ"); nv.inputs[0].default_value, nv.inputs[1].default_value, nv.inputs[2].default_value = 0.0, -1.0, 0.0
        link(nt, nv.outputs[0], pb.inputs["Normal"]); link(nt, nv.outputs[0], tl.inputs["Normal"])
        alpha = tx.outputs["Alpha"]
        if channel is not None:
            mt = N(nt, "ShaderNodeTexImage"); seq(mt, mimg); mt.interpolation = "Linear"
            sp = N(nt, "ShaderNodeSeparateColor"); link(nt, mt.outputs["Color"], sp.inputs[0])
            alpha = math_(nt, "MULTIPLY", alpha, sp.outputs[channel])
        tr = N(nt, "ShaderNodeBsdfTransparent"); ma = N(nt, "ShaderNodeMixShader")
        link(nt, alpha, ma.inputs[0]); link(nt, tr.outputs[0], ma.inputs[1]); link(nt, mb.outputs[0], ma.inputs[2])
        out = N(nt, "ShaderNodeOutputMaterial"); link(nt, ma.outputs[0], out.inputs["Surface"])
        pm.surface_render_method = "DITHERED"; pm.use_backface_culling = False
        if hasattr(pm, "use_transparent_shadow"): pm.use_transparent_shadow = True
        return pm
    quads = 0
    only = set(opt.get("--perf_only", "him,ramp,creature").split(","))     # diagnosis: build some of the surfaces only
    for kind, ch in ((("him", 0), ("ramp", 1), ("creature", 2)) if mimg else (("ramp", None),)):
        if mimg and kind not in only: continue
        pv, puv, pf = surface(kind); mesh_obj("performer_" + kind, pv, pf, material("performer_" + kind, ch), uvs=puv); quads += len(pf)
    PERF = {"frames_from": files[off], "frames": NFR, "creature_depth_m": round(tg, 3), "creature_ground_m": [round(v, 3) for v in (Cc + tg * dg)],
            "his_depth_m": HIM.y, "quads": quads, "surfaces": list(laid), "points_laid_on_the_ground": laid}
    print("PERFORMER", json.dumps(PERF))

# ---------------------------------------------------------------- stand-ins (scale check only; never in the delivered set)
if opt.get("--standin") == "1":
    sm_ = scatter_mat("standin", (0.25, 0.25, 0.27))
    box("standin_him", HIM.x - 0.24, HIM.x + 0.24, HIM.y - 0.12, HIM.y + 0.12, 0.0, 1.905, sm_)
    box("standin_dog", DOG.x - 0.30, DOG.x + 0.30, DOG.y - 0.18, DOG.y + 0.18, 0.0, 0.30, sm_)

# ---------------------------------------------------------------- checks, then render
from bpy_extras.object_utils import world_to_camera_view
sc.frame_set(1); bpy.context.view_layer.update()
to_px = lambda p: tuple(round(v, 1) for v in (world_to_camera_view(sc, cam, Vector(p)).x * W, (1 - world_to_camera_view(sc, cam, Vector(p)).y) * H))
meta = {"lens_mm": round(cd.lens, 3), "focal_px": round(F_SET, 1), "his_feet_px": to_px(HIM), "his_head_px": to_px(HIM + Vector((0, 0, 1.95))),
        "dog_px": to_px(DOG), "car_front_ground_px": to_px((CAR["front_centre"][0], CAR["front_centre"][1], 0)),
        "flares_px": [to_px(tip) for _, tip in FLARES], "cards": len(CARDS), "ground_quads": len(gf), "car_quads": len(cf)}
os.makedirs(od, exist_ok=True); json.dump(meta, open(f"{od}/scene.json", "w"), indent=1)
print("SCENE", json.dumps(meta))
if opt.get("--save") == "1":
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(f"{od}/hyenas_set.blend")); print("saved", f"{od}/hyenas_set.blend")
ims = sc.render.image_settings
if hasattr(ims, "media_type"): ims.media_type = "IMAGE"
ims.file_format = "OPEN_EXR"; ims.color_depth = "16"; ims.exr_codec = "DWAA"; ims.color_mode = "RGB"
# --passes full,plate,matte (default full): the layers a finisher needs to light him apart from the set (Fendi, 13 Nov:
# the light match is left to Grokbot in After Effects).
#   full   the shot (exr/)
#   plate  the same set with the shadows he and the creature throw, but without them in the picture (exr_plate/)
#   matte  only them: everything else holds them out (the grass in front of the hyena cuts the matte as it cuts the
#          picture), no smoke, transparent film; alpha = where they are in the finished frame (exr_matte/, RGBA)
PASSES = opt.get("--passes", "full").split(",")
PERF_OBS = [o for o in sc.objects if o.name.startswith("performer_")]
VOL_OBS = [o for o in sc.objects if o.type == "MESH" and any(m and m.node_tree and any(n.bl_idname == "ShaderNodeVolumePrincipled" for n in m.node_tree.nodes) for m in o.data.materials)]
def set_pass(name):
    for o in PERF_OBS: o.visible_camera = name != "plate"
    for o in sc.objects:
        if o.type == "MESH" and o not in PERF_OBS and o not in VOL_OBS: o.is_holdout = name == "matte"
    for o in VOL_OBS: o.hide_render = name == "matte"
    sc.render.film_transparent = name == "matte"; ims.color_mode = "RGBA" if name == "matte" else "RGB"
for pn in PASSES:
    assert pn in ("full", "plate", "matte"), pn
    assert pn == "full" or PERF_OBS, "plate and matte need --performer"
    os.makedirs(f"{od}/exr" + ("" if pn == "full" else "_" + pn), exist_ok=True)
for f in ([ONLY] if ONLY else range(1, NFR + 1)):
    sc.frame_set(f)
    for pn in PASSES:
        set_pass(pn); sc.render.filepath = os.path.abspath(f"{od}/exr{'' if pn == 'full' else '_' + pn}/set_{f:04d}.exr")
        bpy.ops.render.render(write_still=True)
    print("rendered", f, flush=True)
print("DONE")
