"""A museum bench in the gallery foreground, rendered in Blender, $0 (Fendi's take: the desk in front of the phone
hides his shoes on most frames of the Allen window; PROBLEM_INDEX "frame the failing part out ... or put a plate object
in front of it"). The gallery photo is kept as measured; the bench is a real object of the rebuilt set
(gallery_rebuild_allen.py camera and room): a solid walnut plinth with a black leather seat (the bear wall's
photoreal materials, bear_wall/matlib.py), 0.45 m high, 1.70 m long, 0.40 m deep, front face 2.15 m from the lens,
x 0.25 .. 1.95 m. It stands in front of him (he is 2.79-2.85 m away), so its seat line crosses his lower shins.

Renders (1920x1080):
  bench_rgba.png   the bench and the shadow it throws, over a transparent room (wall and floor are shadow catchers)
  bench_mask.png   the bench alone (its alpha = coverage), for the occlusion depth
  calib.png        the proxy room without the bench, lit the same: its wall brightness against the photo's sets the
                   bench's exposure and white balance in the comp (the photo was not lit by our light units)
usage: Blender -b --factory-startup -P gallery_bench.py -- <bear_wall dir (matlib.py)> <out dir> [samples]
"""
import math, os, sys
import bpy, bmesh
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
BW, out = argv[0], argv[1]; SAMP = int(argv[2]) if len(argv) > 2 else 128
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene; scene = sc
exec(open(os.path.join(BW, "matlib.py")).read(), globals())
patterns()
W, H, F, CX, CY, CAMH, FLOOR_ROW = 1920, 1080, 860.25, 931.0, 558.0, 1.49, 933.5
D = CAMH * F / (FLOOR_ROW - CY)
def gray(name, col):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (col, col, col, 1); b.inputs["Roughness"].default_value = 0.9
    return m
def quad(name, vs, m):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); q = [bm.verts.new(v) for v in vs]; bm.faces.new(q); bm.to_mesh(me)
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(m); return o
wm = gray("wall", 0.75)
wall = quad("wall", [(-30, D, 0), (30, D, 0), (30, D, 15), (-30, D, 15)], wm)
floor = quad("floor", [(-30, 0.2, 0), (30, 0.2, 0), (30, D, 0), (-30, D, 0)], gray("floor", 0.45))
xl = (145 - CX) / F * D
lwall = quad("left_wall", [(xl, 0.2, 0), (xl, D, 0), (xl, D, 15), (xl, 0.2, 15)], wm)
room = [wall, floor, lwall]
# the bench: plinth (walnut) inset 3 cm under a leather seat
def block(name, x0, x1, y0, y1, z0, z1, m, bevel=0.012):
    bpy.ops.mesh.primitive_cube_add(size=1); o = bpy.context.object; o.name = name
    o.scale = (x1 - x0, y1 - y0, z1 - z0); o.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    bpy.ops.object.transform_apply(scale=True)
    bv = o.modifiers.new("bevel", "BEVEL"); bv.width = bevel; bv.segments = 4
    o.data.materials.append(m); return o
walnut = mat_wood("bench_walnut", lin("#5A3A24"), lin("#24140A"), True, 1.0)
leather = mat_leather("bench_leather", lin("#141210"))
X0, X1, Y0, Y1 = 0.25, 1.95, 2.15, 2.55
bench = [block("plinth", X0 + 0.03, X1 - 0.03, Y0 + 0.03, Y1 - 0.03, 0.0, 0.37, walnut, 0.006),
         block("seat", X0, X1, Y0, Y1, 0.37, 0.45, leather, 0.02)]
cam = bpy.data.cameras.new("cam"); cam.sensor_fit = "HORIZONTAL"; cam.sensor_width = 36.0; cam.lens = 36.0 * F / W
cam.shift_x = (W / 2 - CX) / W; cam.shift_y = (CY - H / 2) / W
co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co); co.location = (0, 0, CAMH); co.rotation_euler = (math.radians(90), 0, 0)
sc.camera = co
win = bpy.data.lights.new("window", "AREA"); win.shape = "RECTANGLE"; win.size, win.size_y = 2.2, 2.6; win.energy = 60
wo = bpy.data.objects.new("window", win); sc.collection.objects.link(wo)
wo.location = (xl + 0.02, 1.2, 1.6); wo.rotation_euler = (0, math.radians(-90), 0)
wd = bpy.data.worlds.new("w"); sc.world = wd; wd.use_nodes = True; wd.node_tree.nodes["Background"].inputs[1].default_value = 0.08
sc.render.engine = "CYCLES"; sc.cycles.samples = SAMP; sc.cycles.use_denoising = True; sc.cycles.seed = 0
try:
    p = bpy.context.preferences.addons["cycles"].preferences; p.compute_device_type = "METAL"; p.get_devices()
    for dv in p.devices: dv.use = True
    sc.cycles.device = "GPU"
except Exception as e: print("GPU not set", e)
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_depth = "16"
sc.view_settings.view_transform = "Standard"
os.makedirs(out, exist_ok=True)
def go(name, rgba):
    sc.render.film_transparent = rgba; sc.render.image_settings.color_mode = "RGBA" if rgba else "RGB"
    sc.render.filepath = os.path.join(out, name); bpy.ops.render.render(write_still=True); print("wrote", name, flush=True)
for o in room: o.is_shadow_catcher = True
go("bench_rgba.png", True)
for o in room: o.hide_render = True
go("bench_mask.png", True)
for o in room: o.hide_render = False; o.is_shadow_catcher = False
for o in bench: o.hide_render = True
go("calib.png", False)
