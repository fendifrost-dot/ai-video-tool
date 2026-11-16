"""The Partnership storm-verse set as a 3D scene in Blender (EEVEE): the storm blows memories and debris past him.
$0 and deterministic (fixed seeds; every object rides one wind curve, no simulation cache).
usage (Blender 5.3, headless):
  blender -b --factory-startup -P storm_set_build.py -- <storm_set.json> <out_dir>
        [--frames N] [--only FRAME] [--pct 50] [--samples 16] [--standin 1] [--passes full,plate] [--save 1]
Writes <out_dir>/png[_<pass>]/storm_0001.png ... (8-bit sRGB); storm_set_comp.py adds rain, grain and the mp4.

What is in it (params: storm_set.json; every number there is labelled MEASURED / SPEC / ESTIMATE / DECISION):
  camera      a phone at 2x, level, at his chest height, 2.5 m from him, locked off (knees to above his head)
  sky         storm clouds that run with the wind; lightning flashes seen by the camera only (they never light him)
  ground      wet dark ground to the horizon, far silhouettes fading into the storm haze
  light       one big soft cool key from camera-left (his right) and a weak fill: the light he copies on set
  dust        a volume whose noise the wind carries
  debris      picture frames (stand-ins for his photos of the two of them), glowing hologram cards (memories), cars
              tumbling far behind, chunks and paper; each crosses the frame left to right on the wind curve, tumbling.
              Frames passing IN FRONT of him stay below his face box (params him.face_box_m): his real mouth stays readable
  standin     --standin 1 (default): a 1.905 m grey figure where he stands, for scale and light only
Passes: full (everything), plate (no stand-in). The in-front / behind split for his take comes with the footage."""
import json, math, os, random, sys
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
pp, od = argv[:2]
opt = dict(zip(argv[2::2], argv[3::2]))
P = json.load(open(pp)); C, HM, KL, WD, DB, R = P["camera"], P["him"], P["key_light"], P["wind"], P["debris"], P["render"]
W, H = R["size"]; FPS = R["fps"]; NFR = int(opt.get("--frames", R["frames"]))
ONLY = int(opt.get("--only", 0)); PCT = int(opt.get("--pct", 50))
rng = random.Random(DB["seed"])

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, PCT
sc.render.fps, sc.render.fps_base = FPS, 1
sc.frame_start, sc.frame_end = 1, NFR
sc.render.use_motion_blur = True
if hasattr(sc.render, "motion_blur_shutter"): sc.render.motion_blur_shutter = 0.5
ee = sc.eevee
ee.taa_render_samples = int(opt.get("--samples", 16))
ee.volumetric_start, ee.volumetric_end = 0.3, 60.0
ee.volumetric_tile_size = "8"; ee.volumetric_samples = 48; ee.volumetric_sample_distribution = 0.8
for k, v in (("use_volumetric_shadows", True), ("volumetric_shadow_samples", 8), ("use_shadows", True)):
    if hasattr(ee, k): setattr(ee, k, v)
sc.view_settings.view_transform = "AgX"
coll = sc.collection

TIMES = [(f - 1) / FPS for f in range(1, NFR + 1)]
def gust(t): return WD["base"] + sum(a * math.sin(2 * math.pi * t / p + ph) for a, p, ph in WD["gusts"])
GUST = [gust(t) for t in TIMES]
RUN = [0.0]
for g in GUST[:-1]: RUN.append(RUN[-1] + g / FPS)                    # seconds of base wind carried so far
T_END = TIMES[-1]
def run_at(t):                                                         # RUN extended before 0 and after the end at base speed
    if t <= 0: return t * WD["base"]
    if t >= T_END: return RUN[-1] + (t - T_END) * WD["base"]
    i = int(t * FPS); return RUN[i] + (t * FPS - i) * GUST[i] / FPS

# ---------------------------------------------------------------- helpers
def new_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; m.node_tree.nodes.clear(); return m, m.node_tree
def N(nt, kind, **props):
    n = nt.nodes.new(kind)
    for k, v in props.items(): setattr(n, k, v)
    return n
def link(nt, a, b): nt.links.new(a, b)
def principled(name, rgb, rough=0.6, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0):
    m, nt = new_mat(name)
    b = N(nt, "ShaderNodeBsdfPrincipled"); b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*emit, 1); b.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        if hasattr(m, "surface_render_method"): m.surface_render_method = "BLENDED"
    o = N(nt, "ShaderNodeOutputMaterial"); link(nt, b.outputs[0], o.inputs["Surface"]); return m
def mesh_obj(name, verts, faces, mat=None):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces]); me.update()
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    if mat: me.materials.append(mat)
    return ob
def box_mesh(name, sx, sy, sz, mat, center=(0, 0, 0)):
    cx, cy, cz = center; hx, hy, hz = sx / 2, sy / 2, sz / 2
    v = [(cx + x * hx, cy + y * hy, cz + z * hz) for z in (-1, 1) for y in (-1, 1) for x in (-1, 1)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return mesh_obj(name, v, f, mat)
def quad(name, sx, sz, mat, y=0.0):
    return mesh_obj(name, [(-sx / 2, y, -sz / 2), (sx / 2, y, -sz / 2), (sx / 2, y, sz / 2), (-sx / 2, y, sz / 2)], [(0, 1, 2, 3)], mat)
def empty(name):
    e = bpy.data.objects.new(name, None); coll.objects.link(e); return e

# ---------------------------------------------------------------- camera: a phone at 2x, level, locked off
cd = bpy.data.cameras.new("StormCam"); cd.sensor_fit = "VERTICAL"; cd.sensor_height = 36.0
cd.lens = C["focal_px"] * 36.0 / H
cd.clip_start, cd.clip_end = 0.05, 600
cam = bpy.data.objects.new("StormCam", cd); coll.objects.link(cam); sc.camera = cam
cam.location = (0, 0, C["height"]); cam.rotation_euler = (math.pi / 2 + math.radians(C["pitch_deg"]), 0, 0)
HW = (W / 2) / C["focal_px"]; HH = (H / 2) / C["focal_px"]           # half-width / half-height per metre of depth

# ---------------------------------------------------------------- sky: clouds on the wind, lightning for the camera only
world = bpy.data.worlds.new("storm"); world.use_nodes = True; sc.world = world
nt = world.node_tree; nt.nodes.clear()
tc = N(nt, "ShaderNodeTexCoord"); mp = N(nt, "ShaderNodeMapping"); link(nt, tc.outputs["Generated"], mp.inputs[0])
cl = N(nt, "ShaderNodeTexNoise"); cl.inputs["Scale"].default_value = 2.2; cl.inputs["Detail"].default_value = 9; cl.inputs["Roughness"].default_value = 0.62
link(nt, mp.outputs[0], cl.inputs["Vector"])
cr = N(nt, "ShaderNodeValToRGB"); link(nt, cl.outputs["Fac"], cr.inputs[0])
cr.color_ramp.elements[0].position = 0.38; cr.color_ramp.elements[0].color = (0.010, 0.012, 0.016, 1)
cr.color_ramp.elements[1].position = 0.72; cr.color_ramp.elements[1].color = (0.105, 0.115, 0.13, 1)
sep = N(nt, "ShaderNodeSeparateXYZ"); link(nt, tc.outputs["Generated"], sep.inputs[0])
hz = N(nt, "ShaderNodeMapRange"); link(nt, sep.outputs["Z"], hz.inputs[0])
hz.inputs[1].default_value = 0.5; hz.inputs[2].default_value = 0.62; hz.inputs[3].default_value = 1.6; hz.inputs[4].default_value = 0.7
mul = N(nt, "ShaderNodeMixRGB", blend_type="MULTIPLY"); mul.inputs[0].default_value = 1.0
link(nt, cr.outputs["Color"], mul.inputs[1]); link(nt, hz.outputs[0], mul.inputs[2])
bg_cam = N(nt, "ShaderNodeBackground"); link(nt, mul.outputs[0], bg_cam.inputs["Color"])
bg_lit = N(nt, "ShaderNodeBackground"); bg_lit.inputs["Color"].default_value = (0.055, 0.062, 0.075, 1); bg_lit.inputs["Strength"].default_value = 1.0
lp = N(nt, "ShaderNodeLightPath"); mix = N(nt, "ShaderNodeMixShader")
link(nt, lp.outputs["Is Camera Ray"], mix.inputs[0]); link(nt, bg_lit.outputs[0], mix.inputs[1]); link(nt, bg_cam.outputs[0], mix.inputs[2])
wo = N(nt, "ShaderNodeOutputWorld"); link(nt, mix.outputs[0], wo.inputs["Surface"])
def flash(t):                                                           # a strike: two quick peaks, then a tail
    v = 0.0
    for t0 in P["lightning"]["times_s"]:
        for dt, a, k in ((0.0, 5.0, 0.05), (0.13, 3.0, 0.07), (0.30, 1.2, 0.18)):
            u = t - (t0 + dt)
            if u >= 0: v += a * math.exp(-u / k)
    return v
for f, t in zip(range(1, NFR + 1), TIMES):
    mp.inputs["Location"].default_value = (-0.045 * WD["toward_x"] * run_at(t), 0.0, 0.0); mp.inputs["Location"].keyframe_insert("default_value", frame=f)
    bg_cam.inputs["Strength"].default_value = 1.0 + flash(t); bg_cam.inputs["Strength"].keyframe_insert("default_value", frame=f)

# ---------------------------------------------------------------- ground and far silhouettes
gm, gnt = new_mat("wet_ground")
b = N(gnt, "ShaderNodeBsdfPrincipled"); b.inputs["Base Color"].default_value = (0.022, 0.023, 0.026, 1)
gtc = N(gnt, "ShaderNodeTexCoord"); pn = N(gnt, "ShaderNodeTexNoise"); pn.inputs["Scale"].default_value = 0.35; pn.inputs["Detail"].default_value = 4
link(gnt, gtc.outputs["Object"], pn.inputs["Vector"])
rr = N(gnt, "ShaderNodeMapRange"); link(gnt, pn.outputs["Fac"], rr.inputs[0])
rr.inputs[1].default_value = 0.45; rr.inputs[2].default_value = 0.6; rr.inputs[3].default_value = 0.55; rr.inputs[4].default_value = 0.08
link(gnt, rr.outputs[0], b.inputs["Roughness"])
go = N(gnt, "ShaderNodeOutputMaterial"); link(gnt, b.outputs[0], go.inputs["Surface"])
mesh_obj("ground", [(-300, -5, 0), (300, -5, 0), (300, 400, 0), (-300, 400, 0)], [(0, 1, 2, 3)], gm)
fm, fnt = new_mat("far_haze")                                            # silhouettes fade into the haze with distance
cdat = N(fnt, "ShaderNodeCameraData"); fr = N(fnt, "ShaderNodeMapRange"); link(fnt, cdat.outputs["View Distance"], fr.inputs[0])
fr.inputs[1].default_value = 40; fr.inputs[2].default_value = 220; fr.inputs[3].default_value = 0.25; fr.inputs[4].default_value = 0.95
fmix = N(fnt, "ShaderNodeMixRGB"); fmix.inputs[1].default_value = (0.006, 0.007, 0.009, 1); fmix.inputs[2].default_value = (0.07, 0.077, 0.088, 1)
link(fnt, fr.outputs[0], fmix.inputs[0])
fe = N(fnt, "ShaderNodeEmission"); link(fnt, fmix.outputs[0], fe.inputs["Color"])
fo = N(fnt, "ShaderNodeOutputMaterial"); link(fnt, fe.outputs[0], fo.inputs["Surface"])
x = -160.0
while x < 160:
    w_ = rng.uniform(4, 22); h_ = rng.uniform(3, 26) if rng.random() < 0.6 else rng.uniform(8, 14); y_ = rng.uniform(90, 200)
    box_mesh(f"far_{int(x)}", w_, 6, h_, fm, center=(x + w_ / 2, y_, h_ / 2)); x += w_ + rng.uniform(-2, 6)

# ---------------------------------------------------------------- light he copies on set
def kelvin(k):                                                           # rough blackbody white for 5000-8000 K
    t = (k - 5000) / 3000; return (1.0 - 0.18 * t, 0.97 - 0.05 * t, 0.92 + 0.10 * t)
HIM = Vector((HM["x"], C["his_distance"], 0))
az, el = math.radians(KL["azimuth_deg"]), math.radians(KL["elevation_deg"])
kd = bpy.data.lights.new("key", "AREA"); kd.shape = "DISK"; kd.size = KL["size"]; kd.energy = KL["power_w"]; kd.color = kelvin(KL["kelvin"])
key = bpy.data.objects.new("key", kd); coll.objects.link(key)
aim = HIM + Vector((0, 0, 1.45))
key.location = aim + Vector((-math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * KL["distance"]
key.rotation_euler = (aim - key.location).to_track_quat("-Z", "Y").to_euler()
fd = bpy.data.lights.new("fill", "AREA"); fd.shape = "DISK"; fd.size = 1.5; fd.energy = P["fill"]["power_w"]; fd.color = kelvin(P["fill"]["kelvin"])
fil = bpy.data.objects.new("fill", fd); coll.objects.link(fil)
fil.location = aim + Vector((2.2, -1.6, 0.2)); fil.rotation_euler = (aim - fil.location).to_track_quat("-Z", "Y").to_euler()

# ---------------------------------------------------------------- dust carried by the wind
dm, dnt = new_mat("dust")
dtc = N(dnt, "ShaderNodeTexCoord"); dmp = N(dnt, "ShaderNodeMapping"); link(dnt, dtc.outputs["Object"], dmp.inputs[0])
dn = N(dnt, "ShaderNodeTexNoise"); dn.inputs["Scale"].default_value = 0.09; dn.inputs["Detail"].default_value = 5; link(dnt, dmp.outputs[0], dn.inputs["Vector"])
dr = N(dnt, "ShaderNodeMapRange"); link(dnt, dn.outputs["Fac"], dr.inputs[0])
dr.inputs[1].default_value = 0.42; dr.inputs[2].default_value = 0.75; dr.inputs[3].default_value = 0.0; dr.inputs[4].default_value = 0.05
pv = N(dnt, "ShaderNodeVolumePrincipled"); pv.inputs["Color"].default_value = (0.62, 0.6, 0.57, 1); pv.inputs["Anisotropy"].default_value = 0.35
link(dnt, dr.outputs[0], pv.inputs["Density"])
dout = N(dnt, "ShaderNodeOutputMaterial"); link(dnt, pv.outputs[0], dout.inputs["Volume"])
dust = box_mesh("dust", 60, 58, 9, dm, center=(0, 31, 4.5))
for f, t in zip(range(1, NFR + 1), TIMES):
    dmp.inputs["Location"].default_value = (-9.0 * WD["toward_x"] * run_at(t), 0, -0.6 * t); dmp.inputs["Location"].keyframe_insert("default_value", frame=f)

# ---------------------------------------------------------------- debris on the wind
FACE = HM["face_box_m"]
def path_obj(ob, y, z, cross, t0, size, tumble, bob=0.25, avoid_face=False):
    """Crosses the frame at depth y, left to right, entering at t0, taking `cross` s at base wind."""
    hw = HW * y + size; span = 2 * hw; v = span / cross
    w = [rng.uniform(-1, 1) * tumble for _ in range(3)]; r0 = [rng.uniform(0, 6.283) for _ in range(3)]
    ph = rng.uniform(0, 6.283); r_enter = run_at(t0)
    for f, t in zip(range(1, NFR + 1), TIMES):
        s = run_at(t) - r_enter
        x = WD["toward_x"] * (-hw + v * s)
        zz = z + bob * math.sin(1.7 * s + ph) + 0.05 * y * math.sin(0.6 * s + 2 * ph)
        if avoid_face:                                                   # its shadow on his plane stays under his face box
            top = C["height"] + (zz + size * 0.6 - C["height"]) * C["his_distance"] / y
            if top > FACE[2] - 0.05: zz -= (top - (FACE[2] - 0.05)) * y / C["his_distance"]
        ob.location = (x, y, zz); ob.keyframe_insert("location", frame=f)
        ob.rotation_euler = tuple(r + wi * s for r, wi in zip(r0, w)); ob.keyframe_insert("rotation_euler", frame=f)
def schedule(n, cross_lo, cross_hi):
    """n entry times spread over the shot so the stream is steady from frame 1 (some entered before it)."""
    out = []
    for i in range(n):
        cross = rng.uniform(cross_lo, cross_hi)
        t0 = -cross + (T_END + cross) * (i + rng.uniform(0.15, 0.85)) / n
        out.append((cross, t0))
    rng.shuffle(out); return out
def band(y):                                                              # visible height range at depth y
    return C["height"] - HH * y, C["height"] + HH * y

frame_mats = [principled(f"frame_{c}", rgb, rough=0.45) for c, rgb in (("black", (0.015, 0.014, 0.013)), ("gold", (0.45, 0.33, 0.12)), ("white", (0.75, 0.74, 0.7)), ("wood", (0.16, 0.08, 0.035)))]
photo_mat = principled("photo_standin", (0.36, 0.35, 0.33), rough=0.25)   # until his photos of the two of them arrive
def picture_frame(name, w_, h_):
    e = empty(name); fm_ = rng.choice(frame_mats); t = 0.035 + 0.02 * rng.random()
    for nm, sx, sz, cx, cz in (("t", w_, t, 0, h_ / 2 - t / 2), ("b", w_, t, 0, -h_ / 2 + t / 2), ("l", t, h_, -w_ / 2 + t / 2, 0), ("r", t, h_, w_ / 2 - t / 2, 0)):
        p = box_mesh(f"{name}_{nm}", sx, 0.025, sz, fm_, center=(cx, 0, cz)); p.parent = e
    ph_ = quad(f"{name}_photo", w_ - 2 * t, h_ - 2 * t, photo_mat, y=-0.004); ph_.parent = e
    back = quad(f"{name}_back", w_, h_, frame_mats[3], y=0.012); back.parent = e
    return e
T = DB["cross_s"]
for i, (cross, t0) in enumerate(schedule(DB["frames_behind"], *T["mid"])):
    y = rng.uniform(3.4, 12.0); lo, hi = band(y); w_ = rng.uniform(0.3, 0.6); h_ = w_ * rng.choice((1.25, 1.5, 0.8))
    path_obj(picture_frame(f"frame_b{i}", w_, h_), y, rng.uniform(max(lo, 0.4), hi), cross, t0, max(w_, h_), tumble=rng.uniform(0.6, 2.2))
for i, (cross, t0) in enumerate(schedule(DB["frames_front"], *T["front"])):
    y = rng.uniform(0.9, 1.7); lo, _ = band(y); w_ = rng.uniform(0.22, 0.4); h_ = w_ * 1.3
    path_obj(picture_frame(f"frame_f{i}", w_, h_), y, rng.uniform(lo + 0.1, C["height"] - 0.15), cross, t0, max(w_, h_), tumble=rng.uniform(1.0, 2.5), avoid_face=True)
hm, hnt = new_mat("hologram")                                             # memories: glowing, see-through, flickering
he = N(hnt, "ShaderNodeEmission"); he.inputs["Color"].default_value = (0.35, 0.75, 1.0, 1)
htc = N(hnt, "ShaderNodeTexCoord"); hw_ = N(hnt, "ShaderNodeTexWave"); hw_.inputs["Scale"].default_value = 40; link(hnt, htc.outputs["Object"], hw_.inputs["Vector"])                    # scan lines across the card
hs = N(hnt, "ShaderNodeMapRange"); link(hnt, hw_.outputs["Fac"], hs.inputs[0]); hs.inputs[3].default_value = 1.2; hs.inputs[4].default_value = 3.2
link(hnt, hs.outputs[0], he.inputs["Strength"])
htr = N(hnt, "ShaderNodeBsdfTransparent"); hmx = N(hnt, "ShaderNodeMixShader"); hmx.inputs[0].default_value = 0.55
link(hnt, htr.outputs[0], hmx.inputs[1]); link(hnt, he.outputs[0], hmx.inputs[2])
hout = N(hnt, "ShaderNodeOutputMaterial"); link(hnt, hmx.outputs[0], hout.inputs["Surface"])
if hasattr(hm, "surface_render_method"): hm.surface_render_method = "BLENDED"
for i, (cross, t0) in enumerate(schedule(DB["holograms"], *T["near"])):
    y = rng.uniform(3.2, 6.0); lo, hi = band(y); w_ = rng.uniform(0.5, 0.9)
    path_obj(quad(f"holo_{i}", w_, w_ * 1.25, hm), y, rng.uniform(max(lo, 0.7), hi - 0.2), cross * 1.4, t0, w_, tumble=0.35, bob=0.15)
car_mats = [principled(f"car_{i}", rgb, rough=0.3, metal=0.6) for i, rgb in enumerate(((0.02, 0.02, 0.022), (0.18, 0.18, 0.19), (0.05, 0.12, 0.06)))]
for i, (cross, t0) in enumerate(schedule(DB["cars"], *T["far"])):
    y = rng.uniform(28, 55); e = empty(f"car_{i}"); m_ = car_mats[i % len(car_mats)]
    body = box_mesh(f"car_{i}_body", 4.6, 1.8, 0.75, m_, center=(0, 0, 0.0)); body.parent = e
    cab = box_mesh(f"car_{i}_cab", 2.4, 1.6, 0.55, m_, center=(-0.2, 0, 0.62)); cab.parent = e
    lo, hi = band(y); path_obj(e, y, rng.uniform(2.5, min(hi - 3, 14)), cross, t0, 4.6, tumble=rng.uniform(0.25, 0.7), bob=0.8)
chunk_mats = [principled(f"chunk_{i}", rgb, rough=0.8) for i, rgb in enumerate(((0.05, 0.045, 0.04), (0.12, 0.1, 0.08), (0.2, 0.19, 0.17), (0.03, 0.03, 0.035)))]
for i, (cross, t0) in enumerate(schedule(DB["chunks"], *T["mid"])):
    y = rng.choice((rng.uniform(1.4, 2.2), rng.uniform(3.0, 9.0), rng.uniform(9.0, 30.0)))
    s = rng.uniform(0.02, 0.07) * (1 + y / 6); lo, hi = band(y)
    ob = box_mesh(f"chunk_{i}", s * rng.uniform(0.5, 2.5), s * rng.uniform(0.3, 1.5), s * rng.uniform(0.2, 1.2), rng.choice(chunk_mats))
    k = 0.45 if y < 2.4 else 1.0
    path_obj(ob, y, rng.uniform(max(lo, 0.05), hi), cross * k * (0.6 + y / 25), t0, s, tumble=rng.uniform(2, 7), avoid_face=y < 2.4)
paper_mats = [principled(f"paper_{i}", rgb, rough=0.7) for i, rgb in enumerate(((0.7, 0.69, 0.65), (0.55, 0.52, 0.45), (0.8, 0.8, 0.78)))]
for i, (cross, t0) in enumerate(schedule(DB["papers"], *T["near"])):
    y = rng.uniform(2.9, 14.0); lo, hi = band(y); s = rng.uniform(0.15, 0.3)
    path_obj(quad(f"paper_{i}", s, s * 1.3, rng.choice(paper_mats)), y, rng.uniform(max(lo, 0.1), hi), cross, t0, s, tumble=rng.uniform(2.5, 6), bob=0.4)

# ---------------------------------------------------------------- the stand-in: him, for scale and light only
STAND = []
if opt.get("--standin", "1") == "1":
    sm = principled("standin", (0.18, 0.18, 0.19), rough=0.7)
    parts = [("cyl", 0.075, 0.86, (-0.11, 0.43)), ("cyl", 0.075, 0.86, (0.11, 0.43)),     # legs
             ("cyl", 0.2, 0.62, (0.0, 1.17)), ("cyl", 0.06, 0.12, (0.0, 1.62)),           # torso, neck
             ("cyl", 0.055, 0.6, (-0.27, 1.19)), ("cyl", 0.055, 0.6, (0.27, 1.19)),       # arms
             ("sph", 0.115, 0, (0.0, 1.905 - 0.13))]                                      # head, top at 1.905 m
    for kind, r, d, (dx, z) in parts:
        if kind == "cyl": bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d, location=(HIM.x + dx, HIM.y, z), vertices=24)
        else: bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(HIM.x + dx, HIM.y, z))
        STAND.append(bpy.context.object)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(HIM.x, HIM.y, 1.45)); sh = bpy.context.object  # shoulders
    sh.scale = (0.25, 0.13, 0.07); STAND.append(sh)
    for o in STAND:
        o.data.materials.append(sm)
        for poly in o.data.polygons: poly.use_smooth = True

# ---------------------------------------------------------------- record and render
def to_px(p):
    d = p.y; return [round(W / 2 + C["focal_px"] * p.x / d, 1), round(H / 2 - C["focal_px"] * (p.z - C["height"]) / d, 1)]
meta = {"lens_mm_on_36mm_vertical": round(cd.lens, 2), "his_feet_px": to_px(HIM), "his_head_top_px": to_px(HIM + Vector((0, 0, 1.905))),
        "frame_at_his_plane_m": [round(2 * HW * C["his_distance"], 3), round(2 * HH * C["his_distance"], 3)],
        "frame_bottom_at_his_plane_m": round(C["height"] - HH * C["his_distance"], 3), "frame_top_at_his_plane_m": round(C["height"] + HH * C["his_distance"], 3),
        "key_light_pos": [round(v, 2) for v in key.location], "objects": len(sc.objects), "frames": NFR, "fps": FPS}
os.makedirs(od, exist_ok=True); json.dump(meta, open(f"{od}/storm_set_meta.json", "w"), indent=1); print("META", json.dumps(meta))
if opt.get("--save") == "1":
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(f"{od}/storm_set.blend")); print("saved", f"{od}/storm_set.blend")
ims = sc.render.image_settings
if hasattr(ims, "media_type"): ims.media_type = "IMAGE"
ims.file_format = "PNG"; ims.color_depth = "8"; ims.color_mode = "RGB"
PASSES = opt.get("--passes", "full").split(",")
for pn_ in PASSES:
    assert pn_ in ("full", "plate"), pn_
    os.makedirs(f"{od}/png" + ("" if pn_ == "full" else "_" + pn_), exist_ok=True)
for f in ([ONLY] if ONLY else range(1, NFR + 1)):
    sc.frame_set(f)
    for pn_ in PASSES:
        for o in STAND: o.hide_render = pn_ == "plate"
        sc.render.filepath = os.path.abspath(f"{od}/png{'' if pn_ == 'full' else '_' + pn_}/storm_{f:04d}.png")
        bpy.ops.render.render(write_still=True)
    print("rendered", f, flush=True)
print("DONE")
