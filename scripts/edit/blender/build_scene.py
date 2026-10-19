"""Blender scene for c033 BODY-ONLY in the moving showroom: the plate's camera, proxy room, his card, and the passes.
usage (Blender 4.5 LTS, headless):
  blender -b --factory-startup -P build_scene.py -- <params.json> <plate_seq_dir> <perf_seq_dir> <out_dir>
        --pass env|refl|fg|depth|save  [--move static|dolly|tight] [--frames N] [--only FRAME]

The plate is a locked-off still image animated by Kling, so its "camera" is measured from the picture (params.json).
Every room surface is a proxy carrying the plate projected from that camera (an emission shader through a static
projector), so the matched camera reproduces the plate and a camera move gets real parallax. His card is the take's
frame at his plane, scaled from the take's own measurements, standing behind the island. Passes, all rendered by
the camera Blender animates (the path stays Blender's; nothing generative sees it):
  env    the room only                       (PNG 16-bit, sRGB)
  refl   his reflection in the island top    (PNG 16-bit, sRGB; room black, only the card visible to gloss)
  fg     his card alone, straight alpha      (PNG 16-bit RGBA)
  depth  camera-axis depth of the room       (PNG 16-bit, metres/50; the room in front of him occludes him)
  save   writes the .blend only
No grade is applied here: comp_scene.py lights him from measured values."""
import json, math, os, sys
import bpy, bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
params_path, plate_dir, perf_dir, out_dir = argv[:4]
opt = dict(zip(argv[4::2], argv[5::2]))
PASS = opt.get("--pass", "save"); MOVE = opt.get("--move", "static"); NF = int(opt.get("--frames", "0"))
P = json.load(open(params_path))
W, H = 1080, 1920
DEPTH_RANGE = 50.0                                   # depth pass: metres / 50 in a 16-bit PNG (0.8 mm steps)
NFR = P["frames"]

pl = P["plate"]; src = P["source"]; isl = P["island"]; perf = P["performer"]
F = pl["focal_px"]; HOR = pl["horizon_y"]
# The plate fixes the room only up to scale (one picture). room_scale sets it: the measured room and the camera
# height scale together about the camera's foot, so the plate's image is unchanged and only his size relative to
# the room moves (DECISION, params.json).
RS = P.get("room_scale", 1.0)
CH = pl["camera_height"] * RS

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
sc.render.fps, sc.render.fps_base = 60000, 1001
sc.frame_start, sc.frame_end = 1, (NF or NFR)
sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
sc.view_settings.exposure = 0; sc.view_settings.gamma = 1
sc.cycles.use_denoising = False          # never denoise: it would repaint his pixels
sc.cycles.max_bounces = 2; sc.cycles.glossy_bounces = 1; sc.cycles.diffuse_bounces = 0
sc.cycles.transmission_bounces = 0; sc.cycles.transparent_max_bounces = 8
sc.cycles.filter_width = 1.0
sc.cycles.seed = 33
world = bpy.data.worlds.new("black"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs[1].default_value = 0.0
sc.world = world

# ---- camera (measured) ----
def make_cam(name):
    cd = bpy.data.cameras.new(name)
    cd.sensor_fit = "VERTICAL"; cd.sensor_height = 36.0
    cd.lens = F * 36.0 / H
    cd.shift_y = -(H / 2 - HOR) / H             # horizon above centre (measured), pitch 0
    cd.clip_start, cd.clip_end = 0.05, 200
    ob = bpy.data.objects.new(name, cd); sc.collection.objects.link(ob)
    ob.location = (0, 0, CH); ob.rotation_euler = (math.pi / 2, 0, 0)
    return ob
cam = make_cam("RenderCam"); proj = make_cam("PlateProjector")
sc.camera = cam
if MOVE == "tight":
    # the same camera, a longer lens: an exact crop of the matched shot (same position, same perspective), framed
    # on him. Lens shift keeps the camera level; the frame centre lands on the wide frame's point TIGHT_CENTRE.
    k = P["tight"]["lens_factor"]; cxw, cyw = P["tight"]["centre_px"]
    cam.data.lens *= k
    cam.data.shift_x = k * (cxw - W / 2) / H
    cam.data.shift_y = k * (HOR - cyw) / H
if MOVE == "dolly":
    # restrained: 0.20 m straight in over the shot, eased; the path is keyed here and rendered from here.
    # 0.20 m keeps the proxies' depth errors under ~2 px of parallax (the plate's AI geometry is not exact)
    for f, y in ((1, 0.0), (NFR, 0.20)):
        cam.location = (0, y, CH); cam.keyframe_insert("location", frame=f)
    for fc in cam.animation_data.action.fcurves:
        for k in fc.keyframe_points: k.interpolation = "BEZIER"; k.easing = "AUTO"

# ---- plate projection material ----
def seq_image(d, prefix):
    first = sorted(x for x in os.listdir(d) if x.startswith(prefix))[0]
    img = bpy.data.images.load(os.path.join(d, first)); img.source = "SEQUENCE"
    return img
plate_img = seq_image(plate_dir, "plate_")
perf_img = seq_image(perf_dir, "p_")
perf_img.alpha_mode = "STRAIGHT"

def seq_node(nt, img):
    n = nt.nodes.new("ShaderNodeTexImage"); n.image = img
    n.image_user.frame_duration = NFR; n.image_user.frame_start = 1; n.image_user.frame_offset = 0
    n.image_user.use_auto_refresh = True; n.interpolation = "Linear"; n.extension = "CLIP"
    return n

def projection_material(name, gloss=0.0, rough=0.1):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord"); tc.object = proj
    sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Object"], sep.inputs[0])
    def math_(op, a, b):
        n = nt.nodes.new("ShaderNodeMath"); n.operation = op
        for i, v in enumerate((a, b)):
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: nt.links.new(v, n.inputs[i])
        return n.outputs[0]
    negz = math_("MULTIPLY", sep.outputs["Z"], -1.0)
    u = math_("ADD", math_("MULTIPLY", math_("DIVIDE", sep.outputs["X"], negz), F / W), 0.5)
    v = math_("ADD", math_("MULTIPLY", math_("DIVIDE", sep.outputs["Y"], negz), F / H), 1 - HOR / H)
    comb = nt.nodes.new("ShaderNodeCombineXYZ"); nt.links.new(u, comb.inputs[0]); nt.links.new(v, comb.inputs[1])
    tex = seq_node(nt, plate_img); nt.links.new(comb.outputs[0], tex.inputs[0])
    em = nt.nodes.new("ShaderNodeEmission"); nt.links.new(tex.outputs["Color"], em.inputs["Color"])
    em.inputs["Strength"].default_value = 1.0
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    if gloss > 0:
        gl = nt.nodes.new("ShaderNodeBsdfGlossy")
        gl.inputs["Color"].default_value = (gloss, gloss, gloss, 1); gl.inputs["Roughness"].default_value = rough
        add = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(em.outputs[0], add.inputs[0]); nt.links.new(gl.outputs[0], add.inputs[1])
        nt.links.new(add.outputs[0], out.inputs["Surface"])
    else:
        nt.links.new(em.outputs[0], out.inputs["Surface"])
    m["emission_node"] = em.name
    return m

room_mat = projection_material("plate_room")
top_mat = projection_material("plate_island_top", gloss=P["reflection"]["strength"], rough=P["reflection"]["roughness"])

def mesh_obj(name, verts, faces, mat):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); ob.data.materials.append(mat)
    return ob

room = []
# floor and ceiling (ceiling height ESTIMATE 3.3 m)
room.append(mesh_obj("floor", [(-30, 0.3, 0), (30, 0.3, 0), (30, 60, 0), (-30, 60, 0)], [(0, 1, 2, 3)], room_mat))
room.append(mesh_obj("ceiling", [(-30, 0.3, 3.3), (-30, 60, 3.3), (30, 60, 3.3), (30, 0.3, 3.3)], [(0, 1, 2, 3)], room_mat))
# island: measured footprint, standard counter height (ESTIMATE 0.91)
ax = Vector((isl["long_axis"][0], isl["long_axis"][1], 0)).normalized()
A_ = Vector((isl["corner_far"][0], isl["corner_far"][1], 0)); B_ = Vector((isl["corner_near"][0], isl["corner_near"][1], 0))
L = isl["length"]; T = isl["top"]
fp = [A_, B_, B_ + ax * L, A_ + ax * L]
body_v = [tuple(p) for p in fp] + [tuple(p + Vector((0, 0, T - 0.001))) for p in fp]
room.append(mesh_obj("island_body", body_v, [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], room_mat))
room.append(mesh_obj("island_top", [tuple(p + Vector((0, 0, T))) for p in fp], [(0, 1, 2, 3)], top_mat))
# kitchen run behind the penguin, parallel to the island (its lines share the island's vanishing point, MEASURED)
k0 = Vector((-2.1, 6.84, 0))
# it ends where the plate's kitchen ends (the tall column at x ~490 px): beyond that the car and windows take over
k1 = k0 + ax * 3.15
room.append(mesh_obj("kitchen_wall", [tuple(k0 - ax * 6), tuple(k1), tuple(k1 + Vector((0, 0, 3.3))),
                                      tuple(k0 - ax * 6 + Vector((0, 0, 3.3)))], [(0, 1, 2, 3)], room_mat))
# far window wall (ESTIMATE ~12 m, behind the car) and the car as a box (ESTIMATE ~10.6 m, MEASURED wheel line)
room.append(mesh_obj("window_wall", [(-30, 13, 0), (30, 13, 0), (30, 13, 3.3), (-30, 13, 3.3)], [(0, 1, 2, 3)], room_mat))
cz = 10.6                                           # spans x 335-965 px in the plate (MEASURED)
room.append(mesh_obj("car", [(-1.4, cz, 0), (2.8, cz, 0), (2.8, cz, 1.9), (-1.4, cz, 1.9)], [(0, 1, 2, 3)], room_mat))
# penguin card at its measured depth so a camera move moves it correctly against the kitchen
pg = P["penguin"]; px_, pz_ = pg["position"]
room.append(mesh_obj("penguin", [(px_ - 0.45, pz_, 0), (px_ + 0.45, pz_, 0), (px_ + 0.45, pz_, 1.4), (px_ - 0.45, pz_, 1.4)],
                     [(0, 1, 2, 3)], room_mat))

for ob in room: ob.scale = (RS, RS, RS)              # the room, built in measured units, scaled about the camera's foot
A_, B_, T = A_ * RS, B_ * RS, T * RS

# ---- his card: the take's frame at his plane, standing behind the island's far edge ----
n_back = Vector((-ax.y, ax.x, 0))                   # away from the camera, off the far long edge
Pp = A_ + ax * perf["along_edge"] * RS + n_back * perf["behind_edge"]   # clearance to the stone is his real size
ppm = src["px_per_metre_at_face"]
cw, chh = W / ppm, H / ppm                          # the frame's size at his plane (m)
centre_h = src["eye_height"] - (src["horizon_y"] - src["eye_y"]) / ppm   # the take's horizon row: its camera's height
yaw = -math.atan2(Pp.x, Pp.y)                       # face the plate camera
eye_off = (src["eye_x"] - W / 2) / ppm
me = bpy.data.meshes.new("performer")
bm = bmesh.new()
vs = [bm.verts.new((x * cw / 2, 0, z * chh / 2)) for x, z in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
fa = bm.faces.new(vs); uvl = bm.loops.layers.uv.new()
for lp, uv in zip(fa.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): lp[uvl].uv = uv
bm.to_mesh(me); bm.free()
card = bpy.data.objects.new("performer", me); sc.collection.objects.link(card)
card.rotation_euler = (0, 0, yaw)
card.location = Pp + Vector((-eye_off * math.cos(yaw), -eye_off * math.sin(yaw), centre_h))
pm = bpy.data.materials.new("performer"); pm.use_nodes = True; nt = pm.node_tree; nt.nodes.clear()
uvn = nt.nodes.new("ShaderNodeUVMap")
tex = seq_node(nt, perf_img); nt.links.new(uvn.outputs[0], tex.inputs[0])
em = nt.nodes.new("ShaderNodeEmission"); nt.links.new(tex.outputs["Color"], em.inputs["Color"])
tr = nt.nodes.new("ShaderNodeBsdfTransparent")
mix = nt.nodes.new("ShaderNodeMixShader"); nt.links.new(tex.outputs["Alpha"], mix.inputs[0])
nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(em.outputs[0], mix.inputs[2])
out = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(mix.outputs[0], out.inputs["Surface"])
card.data.materials.append(pm)
card.visible_shadow = False; card.visible_diffuse = False; card.visible_transmission = False
card.visible_volume_scatter = False

def png_width(path):                                # the IHDR width; Blender sizes a sequence only once it loads it
    with open(path, "rb") as fh: fh.seek(16); return int.from_bytes(fh.read(4), "big")
meta = {"room_scale": RS, "texture_scale": round(png_width(bpy.path.abspath(perf_img.filepath)) / W, 4),
        "performer_position": [round(Pp.x, 4), round(Pp.y, 4)], "card_size_m": [round(cw, 4), round(chh, 4)],
        "card_centre_height": round(centre_h, 4), "yaw_deg": round(math.degrees(yaw), 3),
        "lens_mm": round(cam.data.lens, 4), "shift_y": round(cam.data.shift_y, 5), "move": MOVE}

# sanity: the plate's horizon and the island's far corner land where they were measured
from bpy_extras.object_utils import world_to_camera_view
sc.frame_set(1); bpy.context.view_layer.update()
def to_px(p):
    c = world_to_camera_view(sc, cam, Vector(p)); return round(c.x * W, 1), round((1 - c.y) * H, 1)
meta["check_horizon_px"] = to_px((0, 50, CH)); meta["check_far_corner_px"] = to_px((A_.x, A_.y, T))
meta["check_near_corner_px"] = to_px((B_.x, B_.y, T))

def per_frame_depth():
    out = []
    for f in range(1, sc.frame_end + 1):
        sc.frame_set(f); m = cam.matrix_world.inverted() @ card.matrix_world.translation
        out.append(round(-m.z, 4))
    sc.frame_set(1); return out
meta["performer_depth_per_frame"] = per_frame_depth()
def card_corners():   # where the card's corners (UV 00, 10, 11, 01) land on screen, per frame: the take->shot map
    out = []
    for f in range(1, sc.frame_end + 1):
        sc.frame_set(f)
        out.append([to_px(card.matrix_world @ v.co) for v in card.data.vertices])
    sc.frame_set(1); return out
meta["card_corners_px_per_frame"] = card_corners()
os.makedirs(out_dir, exist_ok=True)
json.dump(meta, open(os.path.join(out_dir, f"scene_{MOVE}.json"), "w"), indent=1)
print("SCENE", json.dumps({k: v for k, v in meta.items() if not k.endswith("_per_frame")}))

# ---- passes ----
def border_for(objs, pad=24):
    """The screen box (all frames) where these objects can appear, as Blender's render border."""
    xs, ys = [], []
    for f in range(sc.frame_start, sc.frame_end + 1, 8):
        sc.frame_set(f)
        for ob in objs:
            for v in ob.data.vertices:
                c = world_to_camera_view(sc, cam, ob.matrix_world @ v.co); xs.append(c.x); ys.append(c.y)
    sc.frame_set(1)
    px, py = pad / W, pad / H
    r = sc.render; r.use_border = True; r.use_crop_to_border = False
    r.border_min_x, r.border_max_x = max(0, min(xs) - px), min(1, max(xs) + px)
    r.border_min_y, r.border_max_y = max(0, min(ys) - py), min(1, max(ys) + py)
for ob in room: ob.visible_glossy = False
img_set = sc.render.image_settings
if PASS == "env":
    card.hide_render = True
    sc.cycles.samples = 8
elif PASS == "refl":
    card.visible_camera = False                     # seen only in the island top's gloss
    for m in (room_mat, top_mat):
        m.node_tree.nodes[m["emission_node"]].inputs["Strength"].default_value = 0.0
    sc.cycles.samples = 32; sc.cycles.use_adaptive_sampling = True
    border_for([o for o in room if o.name == "island_top"])
elif PASS == "fg":
    for ob in room: ob.hide_render = True
    sc.render.film_transparent = True
    sc.cycles.samples = 32
    border_for([card])
elif PASS == "depth":
    card.hide_render = True
    dm = bpy.data.materials.new("depth"); dm.use_nodes = True; nt = dm.node_tree; nt.nodes.clear()
    cdn = nt.nodes.new("ShaderNodeCameraData"); e = nt.nodes.new("ShaderNodeEmission")
    sc_ = nt.nodes.new("ShaderNodeMath"); sc_.operation = "MULTIPLY"; sc_.inputs[1].default_value = 1 / DEPTH_RANGE
    nt.links.new(cdn.outputs["View Z Depth"], sc_.inputs[0]); nt.links.new(sc_.outputs[0], e.inputs["Color"])
    o = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(e.outputs[0], o.inputs["Surface"])
    bpy.context.view_layer.material_override = dm
    sc.cycles.samples = 4; sc.cycles.filter_width = 0.01
if PASS in ("env", "refl", "fg"):
    img_set.file_format = "PNG"; img_set.color_depth = "16"; img_set.compression = 15
    img_set.color_mode = "RGBA" if PASS == "fg" else "RGB"
elif PASS == "depth":
    sc.view_settings.view_transform = "Raw"         # linear values written as is: depth / DEPTH_RANGE
    img_set.file_format = "PNG"; img_set.color_depth = "16"; img_set.color_mode = "BW"; img_set.compression = 15
blend_path = os.path.join(out_dir, f"showroom_c033_{MOVE}.blend")
if PASS == "save":
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, relative_remap=False)
    print("saved", blend_path); sys.exit(0)
if PASS == "depth" and MOVE != "dolly":
    sc.frame_end = 1                                 # a locked-off camera has one depth
if "--only" in opt: sc.frame_start = sc.frame_end = int(opt["--only"])
sc.render.filepath = os.path.join(out_dir, f"{MOVE}_{PASS}", "f_")
sc.render.use_overwrite = False                     # resume: frames already on disk are kept (start from an empty dir to rebuild)
bpy.ops.render.render(animation=True)
print("rendered", PASS, MOVE, sc.frame_start, sc.frame_end)
