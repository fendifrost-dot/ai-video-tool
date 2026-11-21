"""The gallery (plate 348d1c96, Allen's living portrait) rebuilt in Blender at MEASURED sizes, for his shadow and
contact shading, $0. Fendi, 21 Nov: "the background needs to be recreated in blender so my feet aren't floating and I
don't look pasted in. Measurements need to be precise".

Camera, MEASURED on the plate (1920x1080 as the comp uses it):
  - level, no roll: every vertical and horizontal line of the plate is parallel (measure_camera_vps.py: two vanishing
    points at infinity);
  - eye level row 558, principal column 931: the window wall's floor line and the doorway's floor line on the right
    meet there (the depth vanishing point; image centre 960,540);
  - floor / wall line row 933.5 (the strongest horizontal edge, rows 880-990);
  - lens height 1.49 m = HIS take's measured lens height (solve_camera_height.py on the wall take: his height on two
    straight-standing frames, 1.480 and 1.489 m) so he can be placed by a pure scale; focal 860.25 px = his take's
    (the plate's one-point view fixes everything but the focal; using his keeps his perspective). Wall at
    1.49 * 860.25 / (933.5 - 558) = 3.413 m.
Pieces: their outlines in plate pixels (MEASURED), front faces at their depth (ESTIMATE: shadow box 0.15 m, gilt frame
0.08, plaque 0.03, canvas 0.04). Light (ESTIMATE from the plate's own shadows: the gilt frame's falls ~15 px right
and ~10 px down): a soft sun from the upper left and front (0.75, 1, -0.51), 10 deg wide, plus the room's ambient.
Renders s_0000 (the set without him) and s_0001.. (with his placed cut-out at his measured depth per frame,
level_and_place.py placement.json), the card invisible to the camera, casting shadow only.

usage: Blender -b --factory-startup -P gallery_rebuild.py -- <static_fg dir> <placement.json> <out> [pct] [samples] [feet.json]
Shoes: two shadow-only blocks (0.11 x 0.29 x 0.07 m) at his measured contact points per frame (feet_from_placed.py).
"""
import json, math, os, sys
import bpy, bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
fgdir, place_p, out = argv[:3]; PCT = int(argv[3]) if len(argv) > 3 else 50; SAMP = int(argv[4]) if len(argv) > 4 else 64
PL = json.load(open(place_p)); N = len(PL["depth_m_per_frame"])
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
W, H, F, CX, CY, CAMH, FLOOR_ROW = 1920, 1080, 860.25, 931.0, 558.0, 1.49, 933.5
D = CAMH * F / (FLOOR_ROW - CY)
def world(x, y, z):   # plate pixel at camera depth z -> world (camera at origin height CAMH, looking +y)
    return Vector(((x - CX) / F * z, z, CAMH - (y - CY) / F * z))
def mat(name, col=0.7):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (col, col, col, 1); b.inputs["Roughness"].default_value = 0.9
    return m
def quad(name, vs, m):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); q = [bm.verts.new(v) for v in vs]; bm.faces.new(q); bm.to_mesh(me)
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(m); return o
def box(name, x0, y0, x1, y1, depth, m):
    zf = D - depth; a, b = world(x0, y0, zf), world(x1, y1, zf)
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object; o.name = name
    o.scale = ((b.x - a.x), depth, (a.z - b.z)); o.location = ((a.x + b.x) / 2, D - depth / 2, (a.z + b.z) / 2)
    o.data.materials.append(m); return o
wm = mat("wall", 0.75)
quad("wall", [(-30, D, 0), (30, D, 0), (30, D, 15), (-30, D, 15)], wm)
quad("floor", [(-30, 0.2, 0), (30, 0.2, 0), (30, D, 0), (-30, D, 0)], mat("floor", 0.45))
xl = (145 - CX) / F * D                  # the window wall meets the back wall at plate column ~145 on the floor line
quad("left_wall", [(xl, 0.2, 0), (xl, D, 0), (xl, D, 15), (xl, 0.2, 15)], wm)
pm = mat("pieces", 0.5)
for n, r, dep in (("shadow_box", (290, 243, 690, 715), 0.15), ("gilt_frame", (765, 248, 1135, 702), 0.08),
                  ("plaque", (1196, 387, 1338, 608), 0.03), ("canvas", (1437, 402, 1632, 597), 0.04)):
    box(n, *r, dep, pm)
cam = bpy.data.cameras.new("cam"); cam.sensor_fit = "HORIZONTAL"; cam.sensor_width = 36.0; cam.lens = 36.0 * F / W
cam.shift_x = (W / 2 - CX) / W; cam.shift_y = (CY - H / 2) / W
co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co); co.location = (0, 0, CAMH); co.rotation_euler = (math.radians(90), 0, 0)
sc.camera = co
# the window: daylight through the left wall (the plate's frames throw soft shadows to the right; the direct sun
# patch on the upper left of the wall does not reach where he stands), as a window-sized soft light on that wall,
# plus a weak bounce from the room (21 Nov: a strong even ambient put his shadow straight behind him: wrong)
win = bpy.data.lights.new("window", "AREA"); win.shape = "RECTANGLE"; win.size, win.size_y = 2.2, 2.6; win.energy = 60
wo = bpy.data.objects.new("window", win); sc.collection.objects.link(wo)
wo.location = (xl + 0.02, 1.2, 1.6); wo.rotation_euler = (0, math.radians(-90), 0)     # emits along -Z: rotated -90 about Y it faces +x, into the room (VERIFIED by the render)
wd = bpy.data.worlds.new("w"); sc.world = wd; wd.use_nodes = True; wd.node_tree.nodes["Background"].inputs[1].default_value = 0.08
# his card at the first frame's depth, square to the camera axis, covering the frame; scaled per frame to his depth
z0 = PL["depth_m_per_frame"][0]
hw, hh = z0 * (W / 2) / F, z0 * (H / 2) / F; ox, oy = z0 * (W / 2 - CX) / F, z0 * (CY - H / 2) / F
me = bpy.data.meshes.new("card"); bm = bmesh.new()
vs = [bm.verts.new(v) for v in ((ox - hw, oy - hh, -z0), (ox + hw, oy - hh, -z0), (ox + hw, oy + hh, -z0), (ox - hw, oy + hh, -z0))]
f = bm.faces.new(vs); uv = bm.loops.layers.uv.new()
for lp, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): lp[uv].uv = t
bm.to_mesh(me)
card = bpy.data.objects.new("card", me); sc.collection.objects.link(card); card.parent = co
for k in ("visible_camera", "visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter"): setattr(card, k, False)
img = bpy.data.images.load(os.path.join(fgdir, "f_0001.png")); img.source = "SEQUENCE"; img.colorspace_settings.name = "Non-Color"
m = bpy.data.materials.new("card"); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
tx = nt.nodes.new("ShaderNodeTexImage"); tx.image = img; tx.image_user.frame_duration = N; tx.image_user.frame_start = 1; tx.image_user.use_auto_refresh = True
df = nt.nodes.new("ShaderNodeBsdfDiffuse"); tr = nt.nodes.new("ShaderNodeBsdfTransparent"); mx = nt.nodes.new("ShaderNodeMixShader"); ou = nt.nodes.new("ShaderNodeOutputMaterial")
nt.links.new(tx.outputs["Alpha"], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(df.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], ou.inputs["Surface"])
me.materials.append(m)
FEET = json.load(open(argv[5]))["feet_per_frame"] if len(argv) > 5 else None
shoes = []
if FEET:
    for n in range(2):
        bpy.ops.mesh.primitive_cube_add(size=1); s_ = bpy.context.object; s_.name = f"shoe{n}"; s_.scale = (0.10, 0.27, 0.06)
        for k_ in ("visible_camera", "visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter"): setattr(s_, k_, False)
        shoes.append(s_)
sc.render.engine = "CYCLES"; sc.cycles.samples = SAMP; sc.cycles.use_denoising = True; sc.cycles.seed = 0
try:
    p = bpy.context.preferences.addons["cycles"].preferences; p.compute_device_type = "METAL"; p.get_devices()
    for dv in p.devices: dv.use = True
    sc.cycles.device = "GPU"
except Exception as e: print("GPU not set", e)
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, PCT
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_depth = "16"; sc.render.image_settings.color_mode = "RGB"
sc.view_settings.view_transform = "Standard"
os.makedirs(out, exist_ok=True)
card.hide_render = True
for s_ in shoes: s_.hide_render = True
sc.frame_set(1); sc.render.filepath = os.path.join(out, "s_0000.png"); bpy.ops.render.render(write_still=True)
card.hide_render = False
for s_ in shoes: s_.hide_render = False
for i in range(1, N + 1):
    sc.frame_set(i); r = PL["depth_m_per_frame"][i - 1] / z0; card.scale = (r, r, r)
    if FEET:
        for s_, ft in zip(shoes, FEET[i - 1]): s_.location = (ft["x_m"], ft["depth_m"], 0.035)
    sc.render.filepath = os.path.join(out, f"s_{i:04d}.png"); bpy.ops.render.render(write_still=True); print("shadow frame", i, flush=True)
print("D", round(D, 3))
