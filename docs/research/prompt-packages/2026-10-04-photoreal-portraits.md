# Source package — photoreal portrait prompts · supplied 4 October 2026

Supplied by Fendi as **source examples**, kept here verbatim so the realism modifier
(`src/lib/prompts/realism.ts`) can be traced back to what it was drawn from. These are
**not** AVT templates and are not loaded by anything. Nothing here is in the live
`prompt_templates` table.

---

## What was taken, and what was deliberately left behind

The modifier takes the package's **vocabulary for how a real lens and real skin behave**.
It leaves behind **everything that describes the two specific people in these prompts**,
because that is what would turn every invented extra in a music video into the same face.

| taken | left behind |
|---|---|
| surface texture as a material property (pores, vellus hair, specular variation) | olive / Mediterranean complexion, ice-blue eyes, almond shape |
| light falloff, shadow-edge hardness, highlight roll-off | freckles, beauty marks, facial proportions, stubble |
| grain present rather than denoised | gender (the package has one woman and one man) |
| the anti-plastic negative vocabulary | the camera body, focal length and aperture |
| Portra as an opt-in colour register | "RAW capture", "straight from the sensor", "zero post-processing" |

A test enforces this: `realism.test.ts` → *"the modifier never leaks the source package's
specific people"* asserts none of those terms appears in any identity mode, with any
combination of looks.

## Which parts of the package are load-bearing

**Load-bearing.** Film-stock names, texture nouns and negative terms demonstrably move a
diffusion model toward a region of its training set. The negative block is the single most
valuable part, and the part AVT was missing entirely.

**Decoration.** No image model shoots RAW — there is no sensor and nothing is exposed.
"Sony A7R V, 85mm GM at f/1.8" is not physics to a generative model; it is a token pointing
at an aesthetic. The package contradicts itself about which one: prompt 1 names a **90mm G
Macro** and an **85mm GM at f/1.8** three sentences apart. The modifier describes lens
*behaviour* instead, which is the part a model can render.

**Actively wrong for AVT, as written.** Prompt 2 says *"DO NOT copy either person's
identity… Generate an entirely new woman."* That is the correct instruction for an invented
extra and exactly the wrong one for the artist or an approved recurring character. The
modifier's `identity` mode exists because of this line.

**Status: HYPOTHESIS.** The 2026-10-04 audit found 0 of 15 live templates guarded against
plastic or airbrushed skin, which establishes *missing vocabulary*. It does not establish
*improved output*. No paid generation was authorised for this work, so nothing here has
been run against a real AVT route.

---

## The package, verbatim

### 1 · Editorial close-up portrait

> A professional editorial portrait photograph of a young Mediterranean woman shot in extreme close-up, filling the entire frame with her face. She has warm golden olive skin with natural texture—visible pores, fine peach fuzz, subtle skin oil on the cheekbones and bridge of the nose, tiny pigmentation variations, and delicate capillaries showing through translucent skin. The photo is shot on a Sony A7R V, 90mm Sony G Macro lens, natural warm skin tones, real lifestyle framing, high detail, not polished. Her eyes are striking crystal ice-blue with almond shape, intricate iris fiber detail visible in high resolution, framed by thick dark brown eyebrows and naturally curled long eyelashes. She has a scattering of authentic freckles across her nose and cheeks, and one small beauty mark on her left cheek. Her lips are naturally full with soft nude color, showing realistic lip texture with slight natural dryness and fine lines. Her dark brown wavy hair falls loosely around her face with flyaway strands catching the light. Her expression is natural and candid, with a soft relaxed gaze directly into the camera lens. Gentle natural asymmetry in her features adds to the realism.
>
> Lighting is warm afternoon sunlight streaming through a window, creating soft directional illumination with authentic skin translucency and a natural golden warmth. The light picks up individual hair strands and creates subtle shadows that define her bone structure.
>
> Shot on Sony A7R V with 85mm GM lens at f/1.8 aperture, creating natural optical bokeh in the shallow depth of field. RAW capture with Kodak Portra 400 color science—warm skin tones, gentle contrast, natural saturation. Documentary photography style with completely untouched skin showing realistic sensor grain and micro-detail. The image has the physical authenticity of film with digital precision, impossible to distinguish from a real unedited photograph. No beauty filters, no CGI smoothing, no airbrush effects, no artificial enhancement—pure photographic realism with all natural imperfections intact.

### 2 · Two-reference macro portrait (ultra photorealistic human portrait)

> Use TWO reference images.
>
> **REFERENCE IMAGE 1** Use ONLY the visual style, skin tone, lighting, color palette, facial skin realism, composition quality, atmosphere, and photographic aesthetic.
> **REFERENCE IMAGE 2** Use ONLY the camera angle, macro crop, framing, perspective, head position, lip composition, mouth shape positioning, lip texture, and facial crop.
>
> DO NOT copy either person's identity, facial structure, or unique features. Generate an entirely new woman with her own unique facial proportions.
>
> **CHARACTER** — Warm sun-kissed Mediterranean complexion · Neutral golden undertones · Bright almond-shaped ice-blue eyes · Thick natural dark brown eyebrows · Long natural eyelashes · Defined cheekbones · Soft jawline · Slight natural facial asymmetry · Tiny freckles across cheeks and nose · Small natural beauty mark · Naturally imperfect human skin
>
> **LIPS** — Match the framing and angle from Reference 2. Large naturally full lips. Soft pink nude tone. Natural hydration. Visible lip lines. Tiny lip wrinkles. Natural vertical texture. Slightly parted. No lipstick. No lip filler appearance. No glossy cosmetic finish. Only natural moisture.
>
> **CAMERA ANGLE** — Extreme close-up macro portrait. Same crop as Reference 2. Same camera distance. Same perspective. Same head angle. Same mouth position. Same facial orientation. Same framing. Only a portion of the face visible. The lips occupy the visual focus.
>
> **SKIN** — Use the photorealism quality of Reference 1. Extremely realistic skin. Visible pores. Peach fuzz illuminated by sunlight. Natural skin oil. Tiny freckles. Micro skin texture. Fine facial hairs. Natural pigmentation. Slight redness around nose. Visible capillaries. Natural uneven skin tone. No smoothing. No retouching. No beauty filter. No plastic appearance. No AI skin. No wax texture.
>
> **EYES** — Only partially visible because of the macro framing. If visible: Bright ice-blue irises. Realistic iris fibers. Natural reflections. Subtle scleral veins. Wet waterline.
>
> **HAIR** — Natural dark brown wavy hair. Loose strands around the face. Tiny flyaway hairs.
>
> **LIGHTING** — Copy the lighting quality from Reference 1 exactly. Warm natural sunlight. Soft directional light. Natural highlight roll-off. Soft shadows. No artificial lighting. No studio lighting.
>
> **COLOR** — Kodak Portra-inspired color science. Warm highlights. Natural skin colors. Balanced exposure. Organic contrast. No HDR. No oversaturation.
>
> **CAMERA** — Sony A7R V · 90mm Macro Lens · f/2.8 · RAW photograph · Eye autofocus · Ultra-high dynamic range · Natural optical depth of field · Professional macro photography
>
> **TEXTURE** — Extreme micro-detail. Visible pores. Peach fuzz. Tiny facial hairs. Dry skin flakes where naturally present. Natural lip texture. Realistic skin translucency. Authentic sensor grain.
>
> **STYLE** — Authentic documentary portrait. Captured naturally. Looks like an untouched smartphone or mirrorless RAW photo. Not editorial. Not beauty campaign. Not CGI. Not AI generated.
>
> **NEGATIVE PROMPT** — plastic skin, beauty filter, airbrushed, CGI, 3D render, wax skin, oversharpened, fake freckles, artificial lips, lip filler look, makeup, lipstick, glossy cosmetic lips, perfect symmetry, anime, illustration, painting, excessive blur, HDR, oversaturated colors, uncanny valley, duplicate features, low detail, smooth skin, magazine retouching

### 3 · Side profile on a pillow

> A naturally beautiful Mediterranean woman lies on her side on a white linen pillow beside a sunlit window, photographed in ultra-photorealistic side profile. Her warm golden skin glows softly in the directional natural light streaming through the window. She has crystal ice-blue eyes gazing sideways toward the camera, thick dark eyebrows, tiny scattered freckles across her nose and cheeks, and soft full pink nude lips with realistic lip lines and natural texture. Her loose brown hair falls naturally around her face and across the pillow.
>
> Warm directional sunlight enters from the window side, creating soft highlights on her cheekbone, the bridge of her nose, and the high points of her face, with gentle shadow falloff that sculpts her features. The skin shows naturally imperfect texture: visible pores, fine peach fuzz, tiny facial hairs catching the light, natural skin oils creating subtle sheen, and authentic human imperfections.
>
> Shot with a Sony A7R V camera and 90mm macro lens in RAW format. Shallow depth of field isolates the face with the pillow and window softly blurred in the background. The color grading recalls Kodak Portra film tones: warm, creamy highlights with gentle saturation and authentic skin rendering. Natural film grain texture throughout. The photograph has an untouched, documentary quality—no retouching, no digital smoothing, capturing the subject exactly as she appears in real life.
>
> Professional editorial portrait photography with extreme realism, natural lighting, and authentic human detail.

### 4 · Male close-up portrait

> A hyper-realistic close-up portrait photograph of a handsome Mediterranean man with naturally tanned olive skin and striking crystal ice-blue eyes. He has thick dark eyebrows, medium stubble across his jaw and upper lip, and tiny freckles scattered naturally across his cheekbones and nose bridge. A subtle beauty mark sits near his jawline. His textured lips show natural vertical lines and natural color variation. His dark brown wavy hair moves gently in a soft breeze, with individual strands catching the light.
>
> Golden afternoon sunlight illuminates his face from a three-quarter angle, creating warm highlights on his cheekbones, forehead, and the bridge of his nose while casting soft shadows that define his facial structure. The natural light brings out the warm undertones in his olive complexion.
>
> The skin texture is completely authentic and unretouched: visible pores across the nose and cheeks, individual beard stubble hairs with varying lengths and directions, fine peach fuzz catching the backlight along his jawline and temples, a natural oil sheen on the T-zone, tiny imperfections like minor texture variations and subtle skin tone inconsistencies preserved exactly as they would appear in real life.
>
> Shot on Sony A7R V with an 85mm f/1.8 lens wide open, capturing that signature shallow depth of field where only the eyes and central facial features remain tack sharp while the ears and hair edges fall into a creamy bokeh. RAW unprocessed photograph with the organic color palette and gentle contrast of Kodak Portra 400 film stock. Realistic fine film grain throughout. Documentary realism aesthetic—an untouched, authentic photograph that looks like a candid moment frozen in time rather than a styled fashion image.

### 5 · Documentary reading portrait

> An ultra photorealistic documentary close-up portrait of a unique person sitting indoors reading a book near a large window. The camera captures the moment just as they briefly glance upward toward the lens with a natural, unguarded expression. The book remains partially visible in the lower foreground, slightly out of focus.
>
> The subject has warm Mediterranean complexion with realistic pigmentation variation across the face. Bright crystal ice-blue eyes with individual visible eyelashes casting delicate shadows. Natural lips with visible fine lip lines and texture. Individual eyebrow hairs are distinctly visible, not appearing as solid blocks of color. Micro facial hair and fine peach fuzz are illuminated and backlit by the soft diffused window light, creating a subtle halo effect along the jawline and cheeks. Visible skin pores across the nose, cheeks, and forehead. Natural skin oils create subtle shine on the T-zone. Tiny scattered freckles with organic placement. Loose natural hair with individual strands catching the light, showing natural texture and movement.
>
> The person sits in a relaxed, natural posture—shoulders slightly rounded, body angled casually toward the window. Soft directional window light enters from the side, creating gentle shadows that reveal facial structure and skin texture without harsh contrast. The light has a clean, neutral-warm quality typical of overcast daylight or shaded indirect sun.
>
> Shot on Sony A7R V with 85mm GM lens at shallow aperture. Natural optical bokeh gradually softens the background into creamy out-of-focus tones while keeping facial details in sharp focus. The color rendering mimics Kodak Portra 400 film stock—muted, organic color palette with natural skin tone accuracy, slightly warm overall cast, gentle contrast, and fine grain texture. This is a professional documentary photography style RAW photograph with zero post-processing, zero retouching, and zero digital enhancement. The image looks identical to a genuine untouched file straight from a high-end camera sensor—authentic, unvarnished, human, and real.
>
> Avoid: beauty filters, artificial skin smoothing, plastic or wax-like skin texture, CGI rendering artifacts, digital illustration qualities, HDR tone mapping, oversaturated colors, glamour studio lighting, magazine editorial retouching, anime or stylized features, doll-like facial proportions.

### 6 · Extreme macro — nose, side profile

> A flawlessly executed extreme macro photograph of a completely original person's nose captured in a perfect 90-degree side profile. The subject is a unique individual with warm sun-kissed Mediterranean complexion featuring natural olive and golden undertones, subtle asymmetry, and authentic pigmentation variation. The entire composition is dedicated to the nose, which occupies approximately 70% of the vertical 9:16 frame, with only small portions of the upper cheek, nostril, philtrum, and upper lip visible.
>
> Shot with a professional 100mm macro lens at f/4 aperture, the focus point centers on the nose bridge extending toward the tip, creating shallow depth of field with gradual optical blur toward the edges. Soft natural daylight enters from a nearby window, warm late-afternoon sunlight creating a gentle highlight rolling across the bridge of the nose, with subtle shadow beneath the nostril and natural light falloff. No flash, no studio lighting, no ring light—only one directional light source revealing every microscopic detail.
>
> The skin displays highest possible photorealism with absolutely no beauty filter or smoothing. Visible skin pores of varying sizes cover every area—smaller on the bridge, larger on the sidewall and tip. Clearly visible sebaceous filaments naturally emerge from enlarged pores. Tiny blackheads scatter naturally around the nose tip. Natural oiliness concentrates on the bridge and tip, creating slight shine. Micro skin texture shows individual sweat pores, subsurface scattering, natural translucency, and tiny capillaries visible beneath thin skin. Very slight redness around the nostril edge. Subtle pigmentation differences, natural unevenness, soft freckles, and tiny beauty marks preserved. Realistic skin compression around the nostril with no airbrushed appearance, no artificial texture, no AI-generated repeating pore patterns.
>
> Tiny translucent peach fuzz covers the nose and upper cheek—short vellus hairs catching warm side light, each hair rendered individually with random growth direction. Tiny fine hairs emerge around the nostril edge, natural facial fuzz extending onto the upper cheek with realistic density.
>
> Highly realistic nostril anatomy with natural cartilage definition, visible skin folds around the nostril, realistic soft shadow inside, authentic skin thickness, and tiny imperfections preserved. The upper lip appears partially at the bottom edge with natural nude pink color, visible vertical lip texture, slight dryness, no lipstick, no gloss, no cosmetic enhancement.
>
> Ultra-high resolution RAW image with true optical macro rendering, authentic depth compression, natural lens characteristics, sharp center focus, natural edge softness, minimal film grain. Neutral white balance with warm realistic skin tones, no HDR, no excessive contrast, no oversaturation—true-to-life color science. The photograph looks completely authentic and impossible to distinguish from a genuine close-up captured by a real photographer using flagship smartphone Macro Mode or professional macro lens, revealing every pore, peach fuzz hair, skin oil, and natural imperfection in medical-grade documentary realism.
