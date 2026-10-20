# AVT next-project planning notes

Dated entries. Each entry says what it rests on: VERIFIED, OBSERVED, HYPOTHESIS, DECISION or RECOMMENDATION.
**Nothing here authorises a paid run, a purchase, a production replacement or a new integration.**

---

## 20 October 2026: Recast, Seedance 2.5 and the "50% off" ad (read-only investigation)

Full evidence, with URLs: [`docs/research/results/2026-10-20-recast-seedance/RECAST_SEEDANCE_INVESTIGATION_2026-10-20.md`](../research/results/2026-10-20-recast-seedance/RECAST_SEEDANCE_INVESTIGATION_2026-10-20.md).
**Nothing was generated or bought.**

### The baseline stays

Fendi's approved performance method is unchanged:
- the original take;
- Genjutsu object-swap;
- `scripts/edit/body_only_swap.py`: only the garment goes back onto the original frames, and the face proof is 0;
- then the composite or the Blender lane.

References: [`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`](../recipes/FACE_PRESERVING_CLOTHING_SWAP.md); approved c033 BODY-ONLY `5482b35b`; showroom results in [`docs/research/results/2026-10-19-blender-showroom/`](../research/results/2026-10-19-blender-showroom/BLENDER_SHOWROOM_C033_2026-10-19.md).

### ElevenLabs Recast: what it actually is

- **Engine:** MiniMax H3 Max Recast (`minimax-h3-max-recast`, 1080p), named in the template's public JSON. VERIFIED.
  - It forks an earlier "Recast" template that ran on Seedance 2.5 Edit, so the engine behind the name can change. Record the template version in any test.
- **Inputs:** one source video (5–30 s, each shot 15 s or less) and one character photo. VERIFIED.
  - **No** separate driving-performance video.
  - **No** target audio: the output keeps the source's sound.
  - 9:16 support: UNKNOWN.
- **What it does:** character replacement only. It is not performance transfer and not audio-driven lip correction. VERIFIED.
- **Face and mouth:** it **regenerates** them. VERIFIED.
  - The fixed prompt says "Do not retain or blend the original character's face".
  - There is no mask, protected region or keep-original-face control.
  - "Preserve lip-sync" is a prompt request, not a control.
  - Keeping the audio does not mean keeping the lip-sync. Matching identity to a photo does not keep his facial pixels.
- **Cost, plan and API:**
  - fal list price $0.30/s at 768p, $0.45/s at 1080p. VERIFIED.
  - The ElevenLabs credit rate shows only in-app after upload. UNKNOWN.
  - Video needs a paid plan, and running templates through the API needs Pro or above. VERIFIED.
  - The public video API does not list this model. OBSERVED.
- **Possible blocker:** ElevenLabs states MiniMax H3 and H3 Max are "not available in the United States". VERIFIED, page text. Whether it blocks Fendi's account: UNKNOWN until checked logged in.

### Higgsfield "Recast" is a different engine

- Its web app names no model; a third-party source says Kling. OBSERVED.
- The MCP exposes no "recast" model or app. Its tool described as recast is **Kling 3.0 Motion Control** (character still plus driving video), a fully generated frame. VERIFIED.
- **Access:** Fendi uses Higgsfield through the **API** (AVT / Control Center), so the MCP connector's plan does not matter (Fendi, 20 Oct). Do not cite the connector's plan or credits.
  - Whether the API account can call Higgsfield's Recast app or Kling 3.0 Motion Control: UNKNOWN. Check it through the API's own model list, not the connector.
- **The same name does not mean the same engine.**

### The two uses Fendi asked about

1. **Repairing a clip whose mouth is wrong: no.** Recast has no audio input and copies the source clip's performance, so a wrong mouth passes through on a newly drawn face.
   - **Source-aligned Genjutsu shots:** the proven fix is the clothing-only transfer onto the original frames. The take's own mouth comes back pixel for pixel.
   - **Seedance shots with different poses or articulation:** the model drew a new performance, with a new head path, scale, angle and timing. The original take's mouth no longer lines up with those frames, so neither a put-back nor Recast can repair them.
   - **The fix there:** re-cut to a source-aligned shot, or rebuild the shot from the real take. Generated lip-sync stays forbidden on him.
2. **Changing appearance on the correctly synced original take: only as a candidate swap engine.**
   - It would sit *before* `body_only_swap.py`, with Recast's face thrown away. It can never be the final picture.
   - **Untested assumptions:**
     - it keeps him aligned enough for the put-back;
     - one outfit photo is enough to hold the jacket's construction and stripe/logo.

### RECOMMENDATION

- Recast adds **no new capability for the performance**.
- At most it earns **one bounded benchmark** against Genjutsu as a garment-swap engine, and only after access is confirmed:
  - **Either:** fal through Control Center, which needs `minimax/h3-max/recast` added to the `fal-run` allowlist (Class C sign-off);
  - **or:** ElevenLabs, which needs a paid plan, the US check, and Pro for the API.
- **Prepared plan, not to be run without approval:** the comparison-plan section of the investigation.
  - c033 take 55.556–60.556 s (Recast's 5 s minimum), scoring only the inner 2–4 s; about $2.25 on fal.
  - Controls: the original take and `5482b35b`.
  - Checks: word-by-word articulation, timing, face, glasses, head movement, clothing and scene stability, plus the face proof after the put-back.
- **It is not a solution until that comparison is done.**

### Runway Seedance 2.5, for reference-rich B-roll in the next project

- **Confirmed** against Runway's guide (https://help.runwayml.com/hc/en-us/articles/53542207042323-Creating-with-Seedance-2-5, updated 13 Oct 2026). VERIFIED:
  - 4–30 s output;
  - 9:16 up to 1080p in Reference and Keyframe modes;
  - up to 50 references (30 images, 10 videos, 10 audio);
  - Reference, Keyframe, Edit and Extend modes;
  - edit length "may shift … very slightly";
  - prompt timestamps "guide pacing rather than mark frame-accurate edit points".
- **Correction:** in Edit mode, duration and aspect ratio follow the input, and there is no resolution setting.
- **Price:** web 68 credits/s at 1080p (+34 per input-video second). On the API that is $0.68/s (+$0.34/s input). VERIFIED.
- **Access:** AVT reaches Seedance 2.5 through its own API routes: `runway-video-edit-proxy`, and reference-to-video through Control Center / Higgsfield `montage-shot`. The MCP connector's workspace plan does not describe that access.
- **DECISION for planning:** evaluate it for reference-rich B-roll and coherent sequences that we cut into 1.5–2 s shots.
  - More references and longer output are capabilities, **not proof** of identity, wardrobe or lip-sync fidelity.
  - Any shot of Fendi still goes through the baseline above.

### The "50% off" ad: USER-REPORTED, NOT VERIFIED

- **Source:** Fendi reports it was a **Runway ML** ad for **Seedance 2.5** (20 Oct). USER-REPORTED. The ad itself is not seen.
- **What Runway's own posts show (OBSERVED, search 20 Oct):**
  - **Seedance 2.0 launch (April 2026):** the code `SEEDANCE` gave **50% off 3 months of paid plans**, for new customers only (https://x.com/runwayml/status/2042336701557703020).
  - **Seedance 2.5 launch:** 7 days of unlimited access at launch for a **new Max plan** sign-up (https://x.com/runwayml/status/2085009500474343689).
  - No current official 50% Seedance 2.5 offer was found on Runway's pages. Reseller and coupon-site 50% codes are unverified or expired.
- **What it would and would not cover:**
  - Each Runway offer found is a **web subscription** discount, mostly for new customers.
  - AVT's Seedance 2.5 runs bill **API credits** at $0.01 per credit ($0.68/s at 1080p). HYPOTHESIS: a web-plan discount does not lower API spend.
- **Before budgeting:** confirm against the ad itself:
  - the code or link;
  - eligibility (new customer only?);
  - the expiration date;
  - whether it applies to the web plan, "unlimited" web generation, the API, or credit packs.
- **No purchase.**
