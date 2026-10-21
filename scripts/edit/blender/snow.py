"""Snow outside the showroom windows: a Blender particle system in the plate's measured camera, $0.
usage (Blender 4.5 LTS, headless):
  blender -b --factory-startup -P snow.py -- <params.json> <out_dir> [--frames N] [--only FRAME] [--probe]
Writes <out_dir>/snow_0001.png ... (16-bit RGBA, straight alpha): flakes only, rendered through the same camera as
the plate (focal, horizon, height MEASURED in params.json), with motion blur, so room_motion.py lays them into the
glass. Flakes fall between the glass and the far trees, carried by a gusting wind; the gust curve is the one the
branches sway with (params room_v5.wind). Every flake is placed by the particle seed: a rerun renders the same snow.
--probe prints the flakes' measured fall and drift speeds instead of rendering."""
import json, math, os, sys
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
params_path, out_dir = argv[:2]
opt = dict(zip(argv[2::2], argv[3::2])) if "--probe" not in argv else {}
PROBE = "--probe" in argv
P = json.load(open(params_path)); V = P["room_v5"]; SN = V["snow"]; WD = V["wind"]
W, H = 1080, 1920
NFR = int(opt.get("--frames", P["frames"])); FPS = 60000 / 1001
F = P["plate"]["focal_px"]; HOR = P["plate"]["horizon_y"]; CH = P["plate"]["camera_height"]

def gust(t):
    """The wind's strength over the shot (0..1.4), shared with the branch sway in room_motion.py."""
    return WD["base"] + sum(a * math.sin(2 * math.pi * t / p + ph) for a, p, ph in WD["gusts"])

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
sc.render.fps, sc.render.fps_base = 60000, 1001
sc.frame_start, sc.frame_end = 1, NFR
sc.render.film_transparent = True
sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
sc.cycles.samples = SN["samples"]; sc.cycles.use_denoising = False; sc.cycles.seed = 33
sc.cycles.max_bounces = 0
sc.render.use_motion_blur = True; sc.render.motion_blur_shutter = SN["shutter"]
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
sc.render.image_settings.color_depth = "16"
sc.render.use_border = True; sc.render.use_crop_to_border = False
x0, y0, x1, y1 = SN["render_box_1080"]
sc.render.border_min_x, sc.render.border_max_x = x0 / W, x1 / W
sc.render.border_min_y, sc.render.border_max_y = 1 - y1 / H, 1 - y0 / H
world = bpy.data.worlds.new("black"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs[1].default_value = 0.0; sc.world = world

# ---- the plate's camera (MEASURED), locked off ----
cd = bpy.data.cameras.new("PlateCam"); cd.sensor_fit = "VERTICAL"; cd.sensor_height = 36.0
cd.lens = F * 36.0 / H; cd.shift_y = -(H / 2 - HOR) / H; cd.clip_start, cd.clip_end = 0.05, 300
cd.shift_x = (W / 2 - P["plate"].get("principal_x", W / 2)) / H     # optical axis off centre (MEASURED), yaw 0
cam = bpy.data.objects.new("PlateCam", cd); sc.collection.objects.link(cam)
cam.location = (0, 0, CH); cam.rotation_euler = (math.pi / 2, 0, 0); sc.camera = cam

# ---- the flake: a small emissive sphere, dimmer with distance (snow haze) ----
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=SN["flake_radius_m"], location=(0, 0, -50))
flake = bpy.context.active_object; flake.name = "flake"
m = bpy.data.materials.new("snow"); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
em = nt.nodes.new("ShaderNodeEmission"); out = nt.nodes.new("ShaderNodeOutputMaterial")
col = SN["colour_linear"]; em.inputs["Color"].default_value = (col[0], col[1], col[2], 1)
camd = nt.nodes.new("ShaderNodeCameraData"); info = nt.nodes.new("ShaderNodeParticleInfo")
def math_(op, a, b):
    n = nt.nodes.new("ShaderNodeMath"); n.operation = op; n.use_clamp = op == "MULTIPLY_ADD"
    for i, v in enumerate((a, b)):
        if isinstance(v, (int, float)): n.inputs[i].default_value = v
        else: nt.links.new(v, n.inputs[i])
    return n.outputs[0]
haze = math_("MAXIMUM", math_("SUBTRACT", 1.0, math_("DIVIDE", camd.outputs["View Distance"], SN["haze_m"])), 0.15)
rnd = nt.nodes.new("ShaderNodeMath"); rnd.operation = "FRACT"
nt.links.new(math_("MULTIPLY", info.outputs["Index"], 0.618034), rnd.inputs[0])
var = math_("ADD", math_("MULTIPLY", rnd.outputs[0], 0.6), 0.55)
nt.links.new(math_("MULTIPLY", math_("MULTIPLY", haze, var), SN["strength"]), em.inputs["Strength"])
nt.links.new(em.outputs[0], out.inputs["Surface"])
flake.data.materials.append(m)

# ---- emitter: a sheet above the yard, between the glass and the far trees ----
z0, z1 = SN["depth_m"]; xa, xb = SN["x_m"]; top = SN["top_m"]
me = bpy.data.meshes.new("sky"); me.from_pydata([(xa, z0, top), (xb, z0, top), (xb, z1, top), (xa, z1, top)], [], [(0, 1, 2, 3)])
sky = bpy.data.objects.new("sky", me); sc.collection.objects.link(sky)
ps_mod = sky.modifiers.new("snow", "PARTICLE_SYSTEM"); ps = ps_mod.particle_system; st = ps.settings
ps.seed = SN["seed"]
pre = int(SN["preroll_s"] * FPS)
st.count = SN["count"]; st.frame_start = -pre; st.frame_end = NFR; st.lifetime = pre + NFR + 10
st.emit_from = "FACE"; st.distribution = "RAND"; st.use_emit_random = True
st.physics_type = "NEWTON"; st.mass = 1.0
st.normal_factor = 0.0; st.object_align_factor = (0, 0, -SN["fall_mps"])
st.factor_random = SN["fall_jitter_mps"]
st.damping = SN["damping"]
st.effector_weights.gravity = SN["gravity"]          # snow drifts down at its own speed (set above), not in free fall
st.render_type = "OBJECT"; st.instance_object = flake
st.particle_size = 1.0; st.size_random = SN["size_random"]
st.use_rotations = False
sc.frame_start = -pre                                  # the cache starts where the emission starts

# ---- wind and flutter ----
bpy.ops.object.effector_add(type="WIND", location=(xa - 2, (z0 + z1) / 2, top / 2))
wind = bpy.context.active_object; wind.rotation_euler = (0, -math.pi / 2, 0)  # blows toward +X (left to right), MEASURED by --probe
wind.field.flow = SN["wind_flow"]
for f in range(-pre, NFR + 1, 6):
    wind.field.strength = SN["wind_strength"] * gust(max(f, 0) / FPS if f > 0 else 0)
    wind.field.keyframe_insert("strength", frame=f)
bpy.ops.object.effector_add(type="TURBULENCE", location=(0, (z0 + z1) / 2, top / 2))
turb = bpy.context.active_object
turb.field.strength = SN["turbulence_strength"]; turb.field.size = SN["turbulence_size_m"]
turb.field.noise = 0.0; turb.field.seed = SN["seed"]

# ---- bake the flight once (the preroll fills the yard with snow before frame 1) ----
pc = ps.point_cache; pc.frame_start = -pre; pc.frame_end = NFR
with bpy.context.temp_override(point_cache=pc, scene=sc, active_object=sky):
    bpy.ops.ptcache.bake(bake=True)
sc.frame_start = 1

if PROBE:
    dg = bpy.context.evaluated_depsgraph_get()
    def snap(f):
        sc.frame_set(f); e = sky.evaluated_get(dg).particle_systems[0]
        return {i: Vector(p.location) for i, p in enumerate(e.particles) if p.alive_state == "ALIVE"}
    a, b = snap(1), snap(61)
    common = [i for i in a if i in b]
    d = [(b[i] - a[i]) for i in common]
    vx = sorted(v.x for v in d); vz = sorted(-v.z for v in d)
    secs = 60 / FPS
    print("PROBE alive", len(a), "fall m/s median", round(vz[len(vz) // 2] / secs, 3), "drift m/s median",
          round(vx[len(vx) // 2] / secs, 3), "drift p10/p90", round(vx[len(vx) // 10] / secs, 3), round(vx[-len(vx) // 10] / secs, 3))
    inview = sum(1 for p in a.values() if p.z > 0 and z0 <= p.y <= z1)
    print("PROBE in the yard at frame 1:", inview)
    sys.exit(0)

os.makedirs(out_dir, exist_ok=True)
frames = [int(opt["--only"])] if "--only" in opt else range(1, NFR + 1)
for f in frames:
    path = os.path.join(out_dir, "snow_%04d.png" % f)
    if os.path.exists(path): continue                  # resume
    sc.frame_set(f); sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
print("DONE snow", len(list(frames)))
