# Thuggpapi's Bando — the Seedance 2.5 montage prompts (reference)

Fendi's reference for "something absurd that catches attention, shot like it is normal" and for fast multi-angle
cutting (16 Oct 2026: "the tiger being rescued by the firemen … me rapping into the camera, a quick shot to the side,
a zoom in of the polar bear, all on the same platform … a child walking up to the polar bear and petting it … Quick,
very quick").

Source: two public Higgsfield blog posts by `@bandoowner`, read on 16 Oct 2026 (the pages render client-side; the
text below is copied from the rendered page, prompts word for word).

| Post | URL | Date |
|---|---|---|
| THUGGPAPI'S BANDO PT. 14 | https://higgsfield.ai/@bandoowner/blogs/thuggpapi-s-bando-pt-14 | 7 Oct 2026 |
| THUGGPAPI'S BANDO PT. 17 | https://higgsfield.ai/@bandoowner/blogs/thuggpapi-s-bando-pt-17 | 10 Oct 2026 |

**VERIFIED (from the "you can recreate that here" link, `https://higgsfield.ai/s/thuggpapi-thuggpapi-GhUvoi`):** the
tool is Higgsfield **Create Video → Seedance 2.5 → References** ("Add references: Image, Video or Audio", references
named with `@` in the prompt), **5 s**, 1080p. That is the same model and mode AVT's restage lane uses
(`seedance_ref`, reference-to-video, `@Video1` = the take, `@Image1` = the place).

## The method, in his own words

> Use frames from the video as references. Generate the two parts separately, then assemble the clips in DaVinci
> Resolve.

So: ONE prompt makes a whole montage of 6–9 scenes in ONE 5 s generation (a "Show in order:" list, one dash per
scene), with one global style line that every scene obeys; frames of a reference video are the `@` references;
two such generations are cut together afterwards.

## PT. 14 — "Firefighters rescue a tiger, grandma fixes a robber's scarf, and a city bus serves champagne. Everyone treats the impossible like another normal day, with shaky camerawork, quick zooms, and a grainy film look."

### Prompt 1 — Grandma's Neighborhood

```
Photorealistic retro hip-hop montage, 4:3. Every scene uses
shaky handheld camerawork, quick optical zooms, 35mm film
grain, muted warm colors, and fast cuts. Deadpan reactions.

Show in order:
— Firefighters rescue a full-sized tiger from a tree
and carry it back to an older woman on her porch.
— Elevator doors open directly onto a sunny beach.
Two men in white tank tops carry coolers toward the hallway,
where an older woman waits.
— A man mows a lawn into a giant portrait of a smiling
grandmother wearing glasses and a crown.
— At a bank counter, grandma wraps a striped scarf around
a robber wearing a matching red-and-yellow knitted ski mask
with a pom-pom, while he points a revolver at the teller.
— Two masked men fish for gold jewelry through a rooftop
skylight, with a metal bucket beside them.
— At night, a man lifts a bulky chrome three-cylinder machine
from a car trunk. Cut to an older woman watching from her porch.
— Grandma waters porch plants around a masked man hiding
in green foliage, with little cloth sacks hanging nearby.
— An open bank vault overflows with cream-colored fluff.
Masked men scoop it into sacks while one dives into the pile.
```

### Prompt 2 — Luxury Everywhere

```
Continue the photorealistic retro hip-hop montage in 4:3.
Every scene uses shaky handheld camerawork, quick optical
zooms, 35mm film grain, muted warm colors, and fast cuts.
Keep the performances casual and serious.

Show in order:
— Older women eat at a church picnic while police chase
masked men on tiny children's tricycles behind them.
— Masked men carrying duffel bags walk on towering stilts
above a street packed with cars.
— A gray safe falls from an apartment window.
A masked man catches it in his arms on the sidewalk.
— Two men play cards across prison-visitation glass.
— A city bus has lounge seating and crystal chandeliers.
A waiter serves champagne to an older woman carrying groceries.
— Inside a chandelier-lit jail cell, seated men receive
champagne bottle service with a burning sparkler.
— Four people ride in a Mercedes convertible filled with
bath bubbles. The driver wears a white towel around their head.
— A police officer writes beside a boy on a red tricycle.
The boy offers a red candy; the officer eats it and smiles.
— Finish at an interrogation table beneath an enormous
crystal chandelier. A man reads a folder beside an officer.
Overlay white handwritten "thugg" above large serif "PAPI."
```

## PT. 17 — "A cymbal crash breaks the sky, commuters dream out loud, and a gospel performance makes objects float. Everyday neighborhood life turns magical through warm light, playful details, and a grainy retro hip-hop look."

### Prompt 1 — Everyday Magic

```
Photorealistic retro hip-hop montage, 4:3. Every shot uses
shaky handheld camerawork, quick optical zooms, 35mm film grain,
muted colors, and fast cuts. Warm sunlight, natural reactions.

Show in order:
— A marching-band member in a burgundy uniform crashes
gold cymbals. The blue sky shatters like glass, revealing
darkness above the stadium.
— Two friends hug beside a sunlit orange brick wall.
Their giant shadows separate while they keep hugging.
— Golden sunset light fills an old subway car. Commuters
relax on the benches, with water visible through the windows.
— An older woman waters plants on a fire escape. Vines
and giant tropical leaves rapidly cover the brick building.
— Inside a dim, green-lit subway, cloud-shaped dream bubbles
float above sleeping passengers: a tropical beach above
a nurse, and a mansion with a pool above a construction worker.
— In a church, an older woman opens her handbag.
White doves fly out and rise through the window light.
```

### Prompt 2 — Let It Lift

```
Continue the photorealistic retro hip-hop montage in 4:3.
Every shot uses shaky handheld camerawork, quick optical zooms,
35mm film grain, muted colors, and fast cuts.

Show in order:
— View from inside a car at a drive-through. A server
in gold sequins and headphones hands over a paper takeout
bag, with musicians behind them in smoky golden light.
— Return to the sleeping subway passengers. Floating
dream bubbles show a basketball game and a woman at a table
with food.
— A man opens a black flip phone beside an old Cadillac.
His friends look over. Quickly zoom to a neighbor leaning
out of an upstairs window.
— A barber trims a flat-top haircut. A lightning-bolt
design shaved into the side begins glowing electric blue.
— A gospel soloist in purple-and-gold robes raises her hand
in front of a choir. Hymnbooks, loose pages, and microphones
with trailing cables float through the church. Stained glass
and warm amber light fill the background.
— Zoom closer to the singer and overlay white handwritten
"thugg" above large serif "PAPI."

Keep the mood warm, joyful, and casually surreal.
```

## What carries over to AVT (DECISION candidates, not yet verified on our footage)

1. **One prompt, one montage.** A "Show in order:" list of 4–6 very short scenes in a single Seedance 2.5
   reference-to-video call, with one global style line, is how he gets the fast-cut multi-angle feel — not one call
   per angle. AVT's restage lane already sends a timed script to the same model (`restageTemporalPlan`,
   `timed_script`), so the montage is a prompt shape, not a new provider.
2. **The style line is the rule every scene obeys:** "shaky handheld camerawork, quick optical zooms, 35mm film grain,
   muted warm colors, and fast cuts. Deadpan reactions." Our equivalent must add what he does not need: the
   performer is `@Video1` and his mouth stays in sync with the take on every shot that shows his face.
3. **"Deadpan reactions" / "treats the impossible like another normal day"** is the realism trick: nobody in the
   scene reacts to the tiger. The polar bear on the 79th St platform gets the same rule.
4. **References are frames of a real video**, the place and the people come from pictures, the surreal event comes
   from the words. For us: `@Video1` = the dressed take (face, jacket, lips), `@Image1` = the plate still with the
   bear on the platform (the place and the animal, the same in every cut).
5. **Cut in the edit.** He generates parts separately and assembles in Resolve; AVT's treatment grid fast re-cut is
   the equivalent — the micro-shots land on the song clock there.
