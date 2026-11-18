# Shooting sheet: the storm verse ("Ralph umbrellas for the rain" to the end)

For Fendi, on set. The storm is already built in 3D (16 Nov 2026), so this take must match it: same camera, same
light, same wind. If you match this sheet, your take drops straight into the storm with no relighting.

The scene: `scripts/edit/blender/storm_set_build.py` + `storm_set.json`. Preview and frames: T7,
`/Volumes/T7/PARTNERSHIP:CEASE & DESIST AVT Edit/storm_scene/`. The war cry before it is a separate set of takes (below).

## Camera (16:9, shot in a small room: Fendi, 17 Nov 2026, "I have about 5-6 ft of space")

The video is **16:9** for YouTube (a 9:16 cut is cropped from the same take later). In the storm, the camera stands
far back (6 m), low, tilted up, and slides slowly from "you off to one side" (D) to "you centred" (C) and back. **None
of that happens on set:** you shoot one locked-off take, close, and the edit shrinks you into the storm and does the slide.
Shooting close gives your face and mouth more pixels.

| | Set it like this |
|---|---|
| Phone | on a tripod, **horizontal**, **1x** lens (not 2x; not 0.5x, it warps you at the edges), **4K at 24 fps** |
| Distance | the tripod **as far back as the room allows** (5-6 ft is fine); you stand **at least 1 ft in front of the back wall** |
| Height | lens at about **4 ft / 1.2 m (chest height)** |
| Tilt | **level**: no tilt (grid / level in the camera app) |
| Framing check | you in the **middle**; the **top of your head a little below the top edge**; the bottom cuts at your **knees or mid-thigh** (either is fine). The storm sky above you is added in 3D |
| Lock it | tap and hold on your face for **AE/AF lock**; never move or zoom the phone during a take |

## Light (the storm's light comes from your right)

| | Set it like this |
|---|---|
| Key light | **one big soft light on your right** (camera-left), about **3 ft to your right, 3 ft in front of you, a bit above your head**, aimed at your chest. A softbox, a big diffusion frame or a window works |
| Colour | **cool daylight** (6000–6500 K). No warm bulbs |
| Other side | a **weak fill** or just a white board on your left, so that side stays darker but not black |
| Behind you | **no lights behind you**. The lightning in the storm stays in the sky and does not hit you |

## Wind (the storm blows from behind the camera, straight past you: front to back)

> **CORRECTION, 17 Nov 2026: NO FAN on any take that gets a clothing swap.** This sheet told Fendi to shoot with a fan,
> without accounting for the swap that follows. The swap (Genjutsu) redraws the coat on every frame; fabric whipped by
> a fan gives it nothing steady to follow, and the Prada coat came back changing shape frame to frame (test on take S5,
> job `100f9dfb`; Fendi: "a lot of drift", "this is a disaster"). It is the same failure as the YSL train and
> headlights: anything fast-moving IN THE FOOTAGE THAT IS SWAPPED breaks the swap. Shoot swap takes with still air and
> nothing draped or moving behind him; the wind, rain and debris are added after the swap, as layers the swap never
> sees. The fan advice below stands only for a take that is used in the clothes he is actually wearing.

Fendi, 16 Nov: "I wanted the debris coming from the direction of the camera going past me" / "Front to back".

| | Set it like this |
|---|---|
| Fan / leaf blower | **next to the tripod**, just out of frame, at chest height or a little lower, **blowing straight at you** |
| What it does | your clothes press against your front and flap **behind you**, like the debris flying past you from the camera side |
| Strength | strong and **gusting**: vary it (someone moving it or changing speed) |
| Keep it out of frame | never in the picture and never between the lens and you |

## Background and space

- A **plain, evenly lit wall or open sky** behind you, nothing moving behind you, no people, no passing cars or lights.
- Keep your arms inside the frame's sides; nothing between you and the camera.
- **Tape a mark for your feet** and stay on it: the debris is placed around that spot.

## Performance

- Stand **centre frame** (always centred: the slide to one side is done in the edit), **face toward the camera**, and rap **the whole verse** each take. Several takes.
- Hands and arms are fine; keep them inside the frame's sides.
- The debris comes **from the camera side** and flies **past your sides and over your head** into the storm behind you. Nothing covers your face or mouth on any line.
- After the last take, record **5 seconds of the empty spot** with the same settings (the light with nobody in it).

## Wardrobe for these takes

The swap puts the chosen clothes on afterwards (`WARDROBE_PARTNERSHIP_CEASE_DESIST.md`). On set, wear something
**close in shape** to the look for that part: for the **last shot**, a long coat with something high at the neck and
any bucket hat (the Prada coat with the yellow capelet and the Fendi FF bucket hat go on in the swap). Button-ups fully
buttoned. Your face and mouth always stay your real footage.

## The war cry (before the verse, on "Yo yo yo yo")

Separate takes, same light from your right: **face and clenched upper body filling the frame**, mouth wide, held longer
than feels natural. Several takes.

---

Numbers behind this sheet (for an agent): the 3D camera (`storm_set.json` `camera`) is `focal_px 2450` on 1920x1080, 1.0 m up,
pitch 7.7°, him at 6.0 m (frame 4.70 x 2.65 m at his plane, 0.50 m to 3.20 m above the floor), `camera.move` slides x
-0.75 m (D) → 0 (C) → -0.75 m on an eased curve. His real take is shot close (1x, ~1.6 m, lens 1.2 m, level) and
scaled onto his mark at 6 m in the comp; a 1.2 m level lens at ~1.6 m sees his chest from about the same slight
low angle as the 3D camera does from 6 m. Key area light in 3D at (-1.84, 4.16, 2.95) m, 2.2 m disk, 6200 K; wind
`from_camera` (+Y): every debris path starts out of frame (at every camera position of the slide), passes beside him
(0.45 m from his centre line) or over his head, and is rejected if it covers his face box from any point of the slide.
All in `storm_set.json`, labelled.
