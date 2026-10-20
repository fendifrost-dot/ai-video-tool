# Recast (ElevenLabs / Higgsfield) and Runway Seedance 2.5: read-only investigation (20 Oct 2026)

**Scope.** Read-only. I submitted no generation, bought nothing and started no trial, and I changed no setting.
- **Tools called (all read-only):** Higgsfield `balance`, `models_explore`, `apps_search`, `show_plans_and_credits`; Runway `whoami`, `list_workspaces`.
- **Links:** I quote no tokens, keys, signed URLs or checkout links.
- **Spot-checked by the parent session (20 Oct):** the template's public JSON names `minimax-h3-max-recast` and contains "Do not retain"; the ElevenLabs capabilities page states "MiniMax H3 Max is not available in the United States".
- **Labels:** VERIFIED (with a cited URL or tool), OBSERVED, HYPOTHESIS, UNKNOWN, DECISION, RECOMMENDATION.

**Baseline being protected.** The canonical method keeps Fendi's own face and mouth pixels (`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`; approved c033 BODY-ONLY `5482b35b`; face proof max|out − original| = 0).
1. Genjutsu object-swap dresses the frame.
2. `scripts/edit/body_only_swap.py` puts only the garment back onto the original frames.
3. The Blender lane then places that file in the room without redrawing him (`docs/research/results/2026-10-19-blender-showroom/BLENDER_SHOWROOM_C033_2026-10-19.md`).

Generated lip-sync and face-altering passes are forbidden on him in production.

---

## A. ElevenLabs "Recast" (ElevenCreative template `MBz9OuVgBFop3rfCFvHK`)

### A1. What it is and what runs underneath

**VERIFIED: the template's public, unauthenticated JSON names the model.**
- Source: `GET https://api.elevenlabs.io/v1/templates/MBz9OuVgBFop3rfCFvHK`, the endpoint behind https://elevenlabs.io/app/templates/MBz9OuVgBFop3rfCFvHK.
- **Template:**
  - name "Recast"; description "Swap the main character in any video while preserving the original motion, scene, and camera."
  - category `video_effects`; tags Character Swap / Character Replacement.
  - creator an ElevenLabs staff account; published globally, version `5WmCRTEXe3LSNCrRKv7x`, 2026-10-09 19:57 UTC.
- **Three nodes:**
  1. Input video (static asset);
  2. character image (static asset);
  3. one **generation** node with `model_id: "minimax-h3-max-recast"`, `resolution: "1080p"`, `seed: null`.
- So it is a **third-party model**: MiniMax H3 Max Recast. As hosted on fal, that is fal's post-trained "H3 Max" of MiniMax H3.
- **It is not Kling, Wan or Runway Act-Two.**
- **VERIFIED: the template was forked from a different template**, `dOGWy8rU3I4weOSEqKfC` (also called "Recast", link-shared). That one used **`bytedance-seedance-v2.5-edit`** (same public endpoint).
  - So even ElevenLabs' own "Recast" has been on two engines.
  - **DECISION for any test:** record the template version id, because the engine can change under the same name.
- **VERIFIED: the generation node's fixed prompt (excerpt):**
  - "Replace ONLY the main character, fully from head to toe, with the person in [CHARACTER_IMAGE]. Match their facial identity … **Do not retain or blend the original character's face, hair or outfit.**"
  - "LOCK THE SOURCE … environment, … camera …"
  - "PRESERVE THE PERFORMANCE … facial-expression timing … If speaking, preserve dialogue, lip-sync timing and original audio."
- **OBSERVED:** the lip-sync clause is a *prompt request*, not a documented guarantee or control.

**VERIFIED: the underlying model's public API docs** (fal, https://fal.ai/models/minimax/h3-max/recast/llms.txt):
- **What it does:** "replaces the main people in a source video with people from reference photos, tracking each person across shots … aims to preserve the original motion, gestures, camera, shot timing, and soundtrack."
- **Inputs:**
  - `video_url`, required: 5 to 30 s, no single shot over 15 s;
  - `reference_image_urls`, required: one photo per new person, up to 4, mapped left to right by default;
  - optional `prompt`, `resolution` (768P / 1080P), `seed`, `enhance_realism`, `enable_safety_checker`.
- **Output:** "The recast video, with the source sound."
- **Price on fal:** $0.30/s at 768p, $0.45/s at 1080p; listed `licenseType: commercial`, dated 2026-10-01 (https://fal.ai/models/minimax/h3-max/recast/api).

**OBSERVED (third party):** https://www.all-ai.de/news/news26/elevenlabs-recast-start (15 Oct 2026) repeats the limits: 5–30 s, shots of 15 s or less, paid plan needed for video. Its source is the ElevenCreative post https://x.com/ElevenCreative/status/2109992635326988365, which I could not read (HTTP 402).

### A2. Inputs and limits

| Input | Status |
|---|---|
| Source video | Yes, required. VERIFIED (template + fal) |
| Character image | Yes. The template takes one; fal allows up to 4 people. VERIFIED |
| Separate driving-performance video | **No.** VERIFIED (no such port in the template or fal schema) |
| Target or replacement audio | **No.** The output keeps the source's sound. VERIFIED (fal output schema) |
| Text prompt | Fixed inside the template. Optional on the fal API. VERIFIED |
| Duration | 5–30 s; each shot 15 s or less. VERIFIED (fal) |
| Resolution | 768p / 1080p; the template is fixed at 1080p. VERIFIED |
| Aspect ratio, including 9:16 | **UNKNOWN.** Neither the fal docs nor the template state it. HYPOTHESIS: it follows the source, as fal's other video-to-video endpoints do. Untested. |
| Frame rate of the output | UNKNOWN |

### A3. Which job it does

**VERIFIED: character replacement (identity swap, head to toe).** The source performance is carried over as the model re-renders it.

- **Not performance transfer** in the Act-Two sense (a driving video onto a separate character asset). That model is listed separately in ElevenLabs as "Runway Act-Two" (https://elevenlabs.io/docs/eleven-creative/playground/image-video.md).
- **Not audio-driven lip correction.** It takes no audio input. ElevenLabs' lip-sync tools (e.g. "Veed LipSync") are separate (same page).

### A4. Face and mouth

**VERIFIED: it regenerates the face and mouth by design.** The template prompt orders "Do not retain or blend the original character's face". The fal API exposes no mask, protected region, keep-original-face or face-lock control.

- "Preserves audio" means the soundtrack is copied (VERIFIED). It does **not** mean the mouth is the original's.
- The mouth is redrawn on a new face. Its timing "aims to" follow the source (fal wording). **Lip-sync fidelity: UNKNOWN until measured.**
- **Identity:** it matches a *photo*. It does not keep the take's pixels.
- **On Fendi, a Recast output can never be the final performance picture.** At most it is an intermediate whose face is discarded.

### A5. Cost, plan, API, region

- **Credits:** "Templates consume credits … at the same rate as running the same models manually … no additional markup … preview the estimated cost before running." VERIFIED (https://elevenlabs.io/docs/eleven-creative/products/templates).
  - **The per-second credit rate for `minimax-h3-max-recast` is not public.** It shows only as an in-app estimate after upload. UNKNOWN without logging in.
  - The underlying list price on fal is $0.30–0.45/s (VERIFIED, above).
- **Plan:** "video generation is only available on paid subscriptions". Templates are in beta. VERIFIED (same page).
  - Plans: Starter $6, Creator $22, Pro $99 (https://elevenlabs.io/pricing). VERIFIED.
- **API:** "Running templates through the API requires a Pro plan or above. Templates that use a model which is not available through the API cannot be run this way." VERIFIED (same page; Template API endpoints added 28 Sep 2026, https://elevenlabs.io/docs/changelog/2026/9/28.md).
  - **OBSERVED:** the public Create Video Generation reference lists only `bytedance-seedance-v2`, `-v2-fast`, `-v2-mini`, `-v2.5`, `creatify-aurora`, `veo-3.1-fast-generate-001` and `veo-3.1-generate-001` (https://elevenlabs.io/docs/api-reference/flows/video/create.md). `minimax-h3-max-recast` is not listed.
  - **HYPOTHESIS:** Recast may therefore not run through the Templates API. It needs a Pro-plan test call to confirm.
- **Region:** ElevenLabs docs state "MiniMax H3 is not available in the United States" and "MiniMax H3 Max is not available in the United States". The same holds for Seedance 2.x, Kling and others. VERIFIED (https://elevenlabs.io/docs/overview/capabilities/image-video.md).
  - **HYPOTHESIS:** if Fendi's ElevenLabs account is US-based, the Recast template (an H3 Max variant) is unavailable to him.
  - UNKNOWN until checked logged in. This may be the single biggest practical blocker.
- **Direct route:** the same engine is on fal (`minimax/h3-max/recast`). CC holds `FAL_KEY`.
  - **OBSERVED:** the endpoint is **not** in CC's `fal-run` allowlist (`fendi-control-center/supabase/functions/switchx-restyle/index.ts` ~L652). That checkout is commit `6573ab2`, 2026-10-17, not re-synced to `main` in this session.
  - Adding it is a provider change: Class C under AVT policy.

---

## B. Higgsfield "Recast"

- **VERIFIED (web page):** https://higgsfield.ai/apps/recast is titled "Character Swap — Transform Characters in Videos".
  - **Steps:** upload your video → upload a character image → generate.
  - **FAQ:** "start using it for free with daily credits"; generation "30 seconds to 2 minutes".
  - **The page names no model.**
- **OBSERVED (third party, Jan 2026):** "Powered by Kling's latest multimodal model", with optional voice and dubbing (https://perplexityaimagazine.com/ai-news/higgsfield-ai-character-swap-photorealistic-video/).
  - Tutorials describe 1 photo + 1 video, single person only, about 15 credits per example clip (https://lilys.ai/it/notes/higgsfield-ai-20260128/higgsfield-recast-any-character-quickly). Possibly stale.
- **VERIFIED (MCP):**
  - `models_explore search "recast"` returns **nothing**, and `apps_search "recast"` returns **nothing**. So the web "Recast" app is not exposed as such over MCP or API.
  - The MCP `motion_control` tool's own description reads: "Animate an existing character image with the motion and camera movement from a reference video using **Kling 3.0 Motion Control** … when the user asks to recast, puppeteer, transfer motion".
  - Its inputs are `image_id` (character still), `motion_video_id` (driving video), resolution 720p/1080p, and `scene_control` (background from the image or the video).
  - That is **performance transfer onto a still**: a fully generated frame.
  - Help center: Motion Control 3–30 s; "transfers motion from real footage onto a character image" (https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-kling).
  - Model `kling3_0_motion_control` (std/pro, `background_source` input_image/input_video) is also listed. Higgsfield additionally lists `minimax_h3_max`, but only as t2v/i2v/reference generation, **not** a recast endpoint.
- **Face pixels:** every one of these routes generates the frame. None documents a mask or keep-original-face option. **VERIFIED by absence** in the schemas: no mask parameter.
- **Cost and account:**
  - **VERIFIED (`balance`):** the MCP-connected Higgsfield account is on the **free plan with 0.68 credits**. It cannot run a Recast or Motion Control job as is.
  - Per-job credit cost for Recast or Motion Control: UNKNOWN; the pricing widget does not itemise it.
  - **UNKNOWN:** whether AVT's own Higgsfield provider route (used for the Genjutsu jobs) is the same account.
- **Same engine as ElevenLabs Recast?** **No evidence that it is, and evidence that it is not.**
  - ElevenLabs Recast = MiniMax H3 Max Recast (VERIFIED).
  - The Higgsfield web Recast model is undisclosed; reportedly Kling (OBSERVED, third party).
  - The Higgsfield MCP "recast" path = Kling 3.0 Motion Control (VERIFIED, tool description), which is an image + driving-video model, a different job.
  - **The same name does not mean the same engine.**

---

## C. Runway Seedance 2.5 (help article, updated 2026-10-13)

Source: https://help.runwayml.com/hc/en-us/articles/53542207042323-Creating-with-Seedance-2-5. The page itself returned 403 to the fetcher, so I read it through the help centre's public article API.

| Claim | Result |
|---|---|
| 4–30 s output | **Confirmed**: "4s to 30s, or Auto". VERIFIED |
| 9:16 up to 1080p | **Confirmed** for Reference and Keyframe: aspect ratios Auto, 21:9, 16:9, 4:3, 1:1, 3:4, 9:16; 480p/720p/1080p. **Correction:** in **Edit**, aspect ratio and duration *match the input*, and the settings table shows **no resolution control** ("—") for Edit and Extend. VERIFIED |
| Up to 50 refs (30 images, 10 videos of up to 30 s each, 10 audio) | **Confirmed** as written. VERIFIED. Note: Runway's *API* pricing caps combined input+reference video at 30 s for billing (https://docs.dev.runwayml.com/guides/pricing.md), and ElevenLabs' Seedance 2.5 Edit lists "up to 10, 30s combined". Treat "30 s each" as UI wording; the effective combined cap may be 30 s (HYPOTHESIS). |
| Reference, Keyframe, Edit, Extend modes | **Confirmed**, in Tools. Workflows uses a separate "Seedance 2.5 (Edit/Extend Video)" node. Draft mode is Tools only. VERIFIED. Extend returns only the new footage as a standalone clip. |
| Edit duration may shift slightly | **Confirmed**: "Editing may shift the output length very slightly against the source." VERIFIED |
| Prompt timestamps are not frame-accurate | **Confirmed**: "Timestamps guide pacing rather than mark frame-accurate edit points … For frame-level timing, edit the generated video in post." VERIFIED |

**Pricing:**
- **Web (VERIFIED, article):** 1080p 68 credits/s (+34 per input-video second); 720p 30 (+15); 480p and Draft 20 (+10); Enhance Draft 68 (+34).
- **API (VERIFIED):** "$0.01 per credit"; `seedance2_5` at the same rates, 80-credit minimum (https://docs.dev.runwayml.com/guides/pricing.md). So 1080p = $0.68/s output + $0.34/s input video.
- The web plans (https://runwayml.com/pricing) list "Unlimited Seedance 2.5" among the Pro and Max plan features. OBSERVED; the terms were not read.

**This account:**
- **VERIFIED (`whoami`):** the MCP is pinned to personal workspace "Fendi", **free plan**.
  - `availableVideoModels: []`.
  - Gated: "Generating video", "Editing video".
  - Credits: 2 purchased.
- **VERIFIED (`list_workspaces`):** two other workspaces exist (names withheld here: the repo is public). Their plans are UNKNOWN. Switching requires reconnecting the MCP.
- **OBSERVED:** AVT already has a separate API route (`supabase/functions/runway-video-edit-proxy/index.ts`, `seedance2_5`, video_to_video mode=edit, 720p). Seedance 2.5 reference-to-video also runs via CC Higgsfield (`montage-shot`). So the MCP workspace's free plan does not describe AVT's API access.

**ElevenLabs note:** ElevenLabs' Seedance 2.5 Video Edit is 480p/720p only and "not available in the United States". VERIFIED (capabilities page above).

---

## D. The "50% off" ad: USER-REPORTED, NOT VERIFIED

Fendi's report of a 50% off ad is recorded as USER-REPORTED. Which vendor and which offer: UNKNOWN. What the official sources show today:

- **ElevenLabs:** the official pricing page shows **"Creator $22 — First month 50% off — $11 per month"**. The FAQ says "Creator $22 (121,000 credits, $11 for the first month)" (https://elevenlabs.io/pricing). VERIFIED, read 20 Oct.
  - It applies to the **web subscription's first month** on the Creator plan. It is not a credit-pack, API-usage or per-generation discount.
  - No expiry date or eligibility terms are shown (e.g. new subscribers only). UNKNOWN.
  - Creator is below Pro, so **it does not include Template API runs** (Pro+). The US availability question in A5 applies.
  - A third-party banner claimed 50% off all ElevenLabs models through 19 Oct 2026 (OpenRouter), which has now expired (OBSERVED, search result only).
- **Higgsfield:** the pricing widget (`show_plans_and_credits`, VERIFIED) shows **no 50% offer**:
  - Plus $49/mo, or $39/mo annual (20% off);
  - Ultra $129/mo, or $99/mo annual (23% off);
  - several "unlimited" model bundles with "Buy until: Oct 21";
  - a 3-day MCP-only $0 trial that **auto-renews at $49/mo**. Not started.
- **Runway:** the official pricing page shows "Yearly −20% off" and "Enterprises get 2 months of usage free. Sign by 10/31" (https://runwayml.com/pricing). VERIFIED.
  - **No official 50% Seedance 2.5 promotion found.**
  - The 50% Seedance 2.5 offers found are other resellers:
    - Figma Weave, 7–21 Aug, ended (https://help.weavy.ai/en/articles/16211624-seedance-2-5-launch-promotion);
    - an OpenArt win-back for churned users, 1–14 Oct, ended;
    - C Dance yearly, to 31 Oct.
  - These are OBSERVED from search results only.
- **fal:** H3 Max had a "50% off for the first week" launch discount (https://blog.fal.ai/introducing-h3-max-by-fal/). Expired. OBSERVED.
- **Most likely match:** the ElevenLabs Creator first-month offer. HYPOTHESIS; only Fendi can confirm against the ad.

---

## Evaluation of the two uses

### Use 1: repair an existing Genjutsu or Seedance clip whose mouth is wrong

**Recast cannot do this.**
- It has no audio input, and it copies the *source clip's* performance. VERIFIED (schema).
- A clip with a wrong mouth would pass that wrong mouth through on a newly drawn face. It is not lip correction.

**Source-aligned Genjutsu shots:**
- The proven fix already exists: the clothing-only put-back onto the original frames.
- The mouth becomes the take's own pixels (face proof 0). Nothing to add.

**Seedance montage and E1/E2 shots:**
- The model drew a *new* performance: new pose, head path, articulation and frame timing (24 fps, 10.04 s or 4.04 s).
- `PERFORMANCE_SYNC_TRACE_2026-10-18.md` records that no audio drove the montage mouths, and that the E1/E2 body reference came from a different song window than their placement.
- The original take's mouth **no longer lines up** with these frames, in position, scale, angle or moment. A face put-back would paste a mouth onto a head that is elsewhere or turned differently, which is a misalignment, not a repair.
- Recast run over such a clip would keep the wrong articulation.
- **The only non-forbidden fixes:**
  - re-cut to a source-aligned shot;
  - regenerate so the shot is driven by the real take (the Genjutsu + body-only route), then place it.
- Generated lip-sync is forbidden on him. **RECOMMENDATION:** do not use Recast for mouth repair.

### Use 2: start from the correctly synced original take, change appearance, keep the performance

- This is what Recast is built for: character replacement with the source's motion kept.
- But the output's face and mouth are **regenerated** to match a photo (VERIFIED, template prompt). So it cannot be the final picture.
- The only lawful way to use it is as a **swap engine inside the existing body-only lane**:
  1. Recast the take using a photo of Fendi in the target wardrobe;
  2. discard Recast's face;
  3. put only the garment back onto the original frames with `body_only_swap.py`.
- **What that needs (HYPOTHESIS, untested):**
  - Recast keeps his position and scale closely enough for ECC alignment, as it claims;
  - its output frame count conforms to the source.
- **Possible gains over Genjutsu (all HYPOTHESIS):**
  - 1080p; a single-photo identity lock across turns;
  - maybe a higher output frame rate than Genjutsu's 22.25 fps clothing updates;
  - a cleaner cap edge.
- **Likely losses:**
  - The garment is specified only through **one photo of a person**, not separate jacket/cap/jeans references. Exact product construction and the stripe/logo is the bar, and that is likely weaker.
  - **5 s minimum source length.**
  - **US availability** on ElevenLabs.
  - **Not allowlisted** in CC for direct fal use.
- Under `docs/VIDEO_SWAP_ARCHITECTURE.md` it falls in the benchmark (b) category: a video-native video-to-video model.

### Recommendation

**RECOMMENDATION:** Recast adds **no new capability** for the performance itself. The take's own face and mouth (already proven) beat any regenerated face, and Recast cannot correct mouths.

The only possibly meaningful addition is a **candidate garment-swap engine** for the body-only lane. It is worth **at most one bounded benchmark** against Genjutsu. Do it only once access is confirmed:
- either fal via CC: add `minimax/h3-max/recast` to the allowlist (Class C, sign-off);
- or ElevenLabs: a paid plan, the US check, and no API below Pro.

**Nothing here is a solution until compared.**

---

## Draft comparison plan (NOT to be run without approval)

- **Clip:**
  - The c033 hero-take window: take 56.056–60.056 (song 56.9098 at frame 0), as approved, framed thighs-up.
  - Recast needs **5 s or more** of source. Send take **55.556–60.556 (5.0 s)**: the approved 4 s window plus 0.5 s handles each side, cut from hero `70304981` exactly as Dress cuts it.
  - **Evaluate only the inner 2–4 s:** song 57.4–60.4 within the c033 window.
- **Character image:** one approved still of Fendi wearing the YSL_JACKET v2 + cap + jeans. For example, a frame of the approved body-only final `5482b35b` at the window centre, which is real face and approved garment.
- **Engine and settings:** `minimax/h3-max/recast`, 1080P, fixed seed recorded, `enhance_realism` off.
  - Record the template version or endpoint, the input sha256 values and the prompt.
  - Est. **$2.25** on fal at 1080p ($0.45 × 5 s; list price, VERIFIED rate). One run.
- **Pipeline:** Recast output → conform to the source length (record the frame count and fps) → `scripts/edit/body_only_swap.py` unchanged → compare.
- **Controls:**
  1. the original take (source cut `c45e30c6`);
  2. the approved body-only result `5482b35b`.
- **Score both raw Recast and Recast + body-only.**

**Pass/fail checks** (all must pass on the body-only version; the raw Recast face is reported, never shipped):

| Check | Method | Pass |
|---|---|---|
| Face proof | max\|out − original\| over protected pixels, before encode | **0** (as `5482b35b`) |
| Word-by-word articulation | per-word side-by-side, original vs output, at 1× and 0.25× on the song (album master `067a4cbf` at 56.9098) | every word's mouth shape matches the original; on the raw Recast face, list each word that differs |
| Timing | frame map of output to source; GCC or landmark-motion cross-correlation of mouth opening | within 1 frame (≤ 17 ms at 59.94), no drift over the window |
| Face and identity (raw Recast only, diagnostic) | face PSNR vs original; visual | report only. Raw Recast fails by definition if used as final |
| Glasses | his own glasses present, unchanged, in every frame | identical pixels (protected) after put-back; raw Recast: note any redraw or loss |
| Head movement | head-landmark trajectory vs original | within 2 px mean after alignment; no extra or missing motion |
| Clothing | jacket construction, stripe/logo placement and colour vs product refs; per-frame stability; update rate (vs Genjutsu's 22.25 fps); cap edge | no flicker or morphing at 1×; logo and stripe correct in every frame; equal to or better than `5482b35b` |
| Scene stability | background diff outside the garment-outline change; ECC fit residual per frame | no boiling; alignment converges on every frame |
| Kill criterion | `VIDEO_SWAP_ARCHITECTURE.md` | any visible flicker or morphing of the garment, or alignment failure → stop; Genjutsu + body-only remains canonical |

**What to report back:** the output asset ids, the frame count and fps, the face proof value, the per-word table, the timing offset, and the clothing verdict side by side with `5482b35b`. Fendi's eye is the approval. Nothing is filed to a shot.
