### A — Preserve the artist (hero performance, video route)

```
treatment : Fendi direct to camera on a rooftop at dusk, handheld push-in, city lights behind
options   : {"identity":"preserve","temporal":true}

ADDED:
  + render the referenced person exactly as photographed — keep their own skin, features and proportions, and do not substitute, idealise or regularise any of them
  + light falls off continuously across the subject, with shadow edges as soft or as hard as the source implies
  + a single plane of focus with the rest falling off optically rather than by uniform blur
  + fine sensor or film grain present throughout rather than a denoised plastic surface
  + skin and fabric keep their real surface texture, with specular variation across the surface rather than one uniform sheen
  + light enters the surface slightly before it scatters, instead of stopping at a hard matte boundary
  + highlights roll off without clipping and shadows retain separation
  + hold the same face, wardrobe and lighting across every frame, with no feature drift, no boiling skin texture and no flicker between frames

WITHHELD: (none)

NEGATIVES: identity drift, face replacement, different person, flat even lighting, uniform ambient fill, uniformly blurred background, cut-out subject, denoised, oversharpened, waxy, plastic skin, waxy skin, airbrushed, smooth skin, beauty filter, 3d render, cgi, matte plastic surface, mannequin, blown highlights, crushed blacks, hdr halo, temporal flicker, identity drift between frames, boiling texture, morphing

REQUIRES:
  [caller] a reference image of the person must reach the provider, or 'preserve' asks the model to match something it cannot see
  [unverified] the temporal clause is a REQUEST. No provider guarantees it, and prompt wording is not evidence that a delivered clip holds together
  [unverified] that this wording improves output at all. The 2026-10-04 template audit found 0 of 15 templates guarded against plastic or airbrushed skin, which establishes MISSING VOCABULARY, not measured improvement
```

### B — Invent a new fictional person (background extra, same scene)

```
treatment : a passer-by crossing frame behind the artist, rooftop at dusk
options   : {"identity":"invent"}

ADDED:
  + this person is newly invented for this shot and matches no existing reference
  + light falls off continuously across the subject, with shadow edges as soft or as hard as the source implies
  + a single plane of focus with the rest falling off optically rather than by uniform blur
  + fine sensor or film grain present throughout rather than a denoised plastic surface
  + skin and fabric keep their real surface texture, with specular variation across the surface rather than one uniform sheen
  + light enters the surface slightly before it scatters, instead of stopping at a hard matte boundary
  + highlights roll off without clipping and shadows retain separation
  + an ordinary human face with the small natural variation real faces have, not a symmetrical idealised one
  + skin as it is, without cosmetic retouching

WITHHELD: (none)

NEGATIVES: resembles a specific real person, flat even lighting, uniform ambient fill, uniformly blurred background, cut-out subject, denoised, oversharpened, waxy, plastic skin, waxy skin, airbrushed, smooth skin, beauty filter, 3d render, cgi, matte plastic surface, mannequin, blown highlights, crushed blacks, hdr halo, perfect symmetry, idealised face, doll-like proportions, uncanny valley, retouched, magazine retouching, glamour retouch

REQUIRES:
  [unverified] that this wording improves output at all. The 2026-10-04 template audit found 0 of 15 templates guarded against plastic or airbrushed skin, which establishes MISSING VOCABULARY, not measured improvement
```

### C — Approved recurring character

```
treatment : the recurring driver waiting by the car, night exterior
options   : {"identity":"recurring","temporal":true}

ADDED:
  + render the established character exactly as previously approved — keep their own skin, features and proportions consistent with the reference, and do not restyle them
  + light falls off continuously across the subject, with shadow edges as soft or as hard as the source implies
  + a single plane of focus with the rest falling off optically rather than by uniform blur
  + fine sensor or film grain present throughout rather than a denoised plastic surface
  + skin and fabric keep their real surface texture, with specular variation across the surface rather than one uniform sheen
  + light enters the surface slightly before it scatters, instead of stopping at a hard matte boundary
  + highlights roll off without clipping and shadows retain separation
  + hold the same face, wardrobe and lighting across every frame, with no feature drift, no boiling skin texture and no flicker between frames

WITHHELD: (none)

NEGATIVES: identity drift, character drift, different person, flat even lighting, uniform ambient fill, uniformly blurred background, cut-out subject, denoised, oversharpened, waxy, plastic skin, waxy skin, airbrushed, smooth skin, beauty filter, 3d render, cgi, matte plastic surface, mannequin, blown highlights, crushed blacks, hdr halo, temporal flicker, identity drift between frames, boiling texture, morphing

REQUIRES:
  [gap] AVT has no record of an approved recurring character: continuity_entities covers location, prop and lighting only, and a 'character' row would be dropped by entityFromRow. This mode relies entirely on references the caller supplies by hand
  [unverified] the temporal clause is a REQUEST. No provider guarantees it, and prompt wording is not evidence that a delivered clip holds together
  [unverified] that this wording improves output at all. The 2026-10-04 template audit found 0 of 15 templates guarded against plastic or airbrushed skin, which establishes MISSING VOCABULARY, not measured improvement
```

### D — CONFLICT: a deliberate high-fashion beauty look

```
treatment : glossy editorial makeup, high fashion beauty lighting, contoured highlighter
options   : {"identity":"invent"}

ADDED:
  + this person is newly invented for this shot and matches no existing reference
  + light falls off continuously across the subject, with shadow edges as soft or as hard as the source implies
  + a single plane of focus with the rest falling off optically rather than by uniform blur
  + fine sensor or film grain present throughout rather than a denoised plastic surface
  + skin and fabric keep their real surface texture, with specular variation across the surface rather than one uniform sheen
  + light enters the surface slightly before it scatters, instead of stopping at a hard matte boundary
  + highlights roll off without clipping and shadows retain separation
  + an ordinary human face with the small natural variation real faces have, not a symmetrical idealised one

WITHHELD (the treatment outranked it):
  - skin as it is, without cosmetic retouching
      ...conflicts with: "makeup"

NEGATIVES: resembles a specific real person, flat even lighting, uniform ambient fill, uniformly blurred background, cut-out subject, denoised, oversharpened, waxy, plastic skin, waxy skin, airbrushed, smooth skin, beauty filter, 3d render, cgi, matte plastic surface, mannequin, blown highlights, crushed blacks, hdr halo, perfect symmetry, idealised face, doll-like proportions, uncanny valley

REQUIRES:
  [unverified] that this wording improves output at all. The 2026-10-04 template audit found 0 of 15 templates guarded against plastic or airbrushed skin, which establishes MISSING VOCABULARY, not measured improvement
```

### E — CONFLICT: artificial stage light, with looks requested anyway

```
treatment : hard neon stage lighting, strobe hits on the downbeat, club interior
options   : {"identity":"invent","looks":["windowLight","portra"]}

ADDED:
  + this person is newly invented for this shot and matches no existing reference
  + light falls off continuously across the subject, with shadow edges as soft or as hard as the source implies
  + a single plane of focus with the rest falling off optically rather than by uniform blur
  + fine sensor or film grain present throughout rather than a denoised plastic surface
  + skin and fabric keep their real surface texture, with specular variation across the surface rather than one uniform sheen
  + light enters the surface slightly before it scatters, instead of stopping at a hard matte boundary
  + highlights roll off without clipping and shadows retain separation
  + an ordinary human face with the small natural variation real faces have, not a symmetrical idealised one
  + skin as it is, without cosmetic retouching

WITHHELD (the treatment outranked it):
  - soft directional daylight from one side, as from a window
      ...conflicts with: "strobe"
  - colour in the register of Kodak Portra 400 — warm, gentle contrast, restrained saturation
      ...conflicts with: "neon"

NEGATIVES: resembles a specific real person, flat even lighting, uniform ambient fill, uniformly blurred background, cut-out subject, denoised, oversharpened, waxy, plastic skin, waxy skin, airbrushed, smooth skin, beauty filter, 3d render, cgi, matte plastic surface, mannequin, blown highlights, crushed blacks, hdr halo, perfect symmetry, idealised face, doll-like proportions, uncanny valley, retouched, magazine retouching, glamour retouch

REQUIRES:
  [unverified] that this wording improves output at all. The 2026-10-04 template audit found 0 of 15 templates guarded against plastic or airbrushed skin, which establishes MISSING VOCABULARY, not measured improvement
```

### F — Surreal environment (NOT a conflict)

```
treatment : a surreal floating cathedral of melting glass, dreamlike scale
options   : {"identity":"invent"}

ADDED:
  + this person is newly invented for this shot and matches no existing reference
  + light falls off continuously across the subject, with shadow edges as soft or as hard as the source implies
  + a single plane of focus with the rest falling off optically rather than by uniform blur
  + fine sensor or film grain present throughout rather than a denoised plastic surface
  + skin and fabric keep their real surface texture, with specular variation across the surface rather than one uniform sheen
  + light enters the surface slightly before it scatters, instead of stopping at a hard matte boundary
  + highlights roll off without clipping and shadows retain separation
  + an ordinary human face with the small natural variation real faces have, not a symmetrical idealised one
  + skin as it is, without cosmetic retouching

WITHHELD: (none)

NEGATIVES: resembles a specific real person, flat even lighting, uniform ambient fill, uniformly blurred background, cut-out subject, denoised, oversharpened, waxy, plastic skin, waxy skin, airbrushed, smooth skin, beauty filter, 3d render, cgi, matte plastic surface, mannequin, blown highlights, crushed blacks, hdr halo, perfect symmetry, idealised face, doll-like proportions, uncanny valley, retouched, magazine retouching, glamour retouch

REQUIRES:
  [unverified] that this wording improves output at all. The 2026-10-04 template audit found 0 of 15 templates guarded against plastic or airbrushed skin, which establishes MISSING VOCABULARY, not measured improvement
```
