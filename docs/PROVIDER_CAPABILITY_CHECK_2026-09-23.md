# Provider capability check before S08 spend (2026-09-23)

Requested by ChatGPT via Fendi: verify current xAI and Runway capabilities against the one operation the section needs — **real performance video + approved canonical Look-on-artist truth + edit instruction → same performance / identity / motion with the canonical wardrobe** — before paying for S08 best-of-N rolls. $0 reconnaissance; nothing was migrated, nothing paid.

## 1. What AVT actually calls today (from the code, not the announcements)

| Lane | Function | Model slug | Endpoint | Verified limit |
|---|---|---|---|---|
| Video wardrobe edit (E1) | `grok-video-edit-proxy` | `grok-imagine-video` (default; `-1.5` priced but unused) | `POST /v1/videos/edits` | 5 `reference_images` accepted (observed); prompt ≤ 4096 chars (400, unbilled, 2026-09-22) |
| Hero stills (E2, tooling) | `grok-image-garment-proxy` | `grok-imagine-image-quality` | `POST /v1/images/edits` | 3 input images (400 on 5, 2026-09-21) |
| Runway | Control Center `video-providers/runway/generate` only | `gen3a_turbo` (retired on Runway Dev 2026-07-30) | text/image-to-video | no video-to-video route; `RUNWAY_API_KEY` lives in Control Center (locked) |

## 2. Current xAI capabilities (docs.x.ai, read 2026-09-23)

- **Image editing.** The 3→5 change is real but belongs to a *different model*: release note 2026-08-28 "Image editing now accepts up to 5 source images per request (was 3)" applies to `grok-imagine-image-2.0`. Our slug `grok-imagine-image-quality` is the 3-image model, and it is **retired on 2026-11-02**; after that the slug is served by `grok-imagine-image-2.0` (`quality: "low"`, $0.01/image cheaper, same request shape). So `maxReferenceImages = 3` was correct for the model we call and wrong as an endpoint constant. Fixed as architecture: capabilities are now keyed `provider:operation[:model]` (`xai:images/edits:grok-imagine-image-quality` = 3 verified, `xai:images/edits:grok-imagine-image-2.0` = 5 per the note, endpoint default = the most conservative model), both proxies pass their model, and the image proxy's default model is data (`XAI_IMAGE_EDIT_MODEL` secret). Switching to `grok-imagine-image-2.0` is a one-secret change when Fendi wants it.
- **Video editing.** The official video-editing page documents `grok-imagine-video` only, input ≤ 8.7 s, output capped at 720p, "strong scene preservation", and **no reference images at all**. Our E1 lane sends `reference_images` and the API accepts them, but the conditioning is undocumented — consistent with what we measured: the anchor pulls the realisation toward one look (E1 worked across shots) without pinning construction.
- **Reference-to-video** (`grok-imagine-video-1.5`, `/v1/videos/generations`): up to 7 reference images "for specific people, objects, clothing" — virtual try-on is a named use case — but it is **generation only** ("cannot be combined with video editing"), 720p, ≤ 15 s. It would replace Fendi's performance with a generated one. Out by mandate.
- **Grok 4.7** (2026-09-21, 500k context): text/agent model. AVT's only Grok text call is `grok-voice-director-proxy` (`GROK_DIRECTOR_MODEL`, default `grok-4.6`, already a secret) — a one-secret upgrade whenever wanted; the video pipeline does not touch it. Control Center orchestration is outside this repo and untouched.

## 3. Current Runway capabilities (docs.dev.runwayml.com OpenAPI + pricing, read 2026-09-23)

One endpoint, `POST /v1/video_to_video`, hosts several models; three of them **edit an existing video in place**:

| Model | Contract | Conditioning | Input | Output | Price |
|---|---|---|---|---|---|
| `aleph2` (Aleph 2.0, 2026-06-02) | `videoUri` + `promptText` (≤ 1000) + up to 5 **keyframes** `{uri, seconds \| at, range}` | "Edit one frame and Aleph 2.0 modifies the rest of your video to match — changing only what you ask for while preserving everything else"; keyframes are edited frames of *this* video at timestamps; optional edit windows | ≤ 30 s | mp4 / ProRes / PNG sequence (surcharges); resolution not stated on the pricing page | 28 credits/s = **$0.28/s**, 56-credit minimum |
| `gemini_omni_flash_1.1` | `videoUri` + `mode: "edit"` + `promptText` (≤ 4000) + up to 5 image `references` | "`edit` transforms it according to the prompt", guided by references | ≤ 10 s | ratios up to 2160:3840 (portrait 720:1280 / 1080:1920 / 2160:3840) | 10 credits/s = **$0.10/s** (t2v/i2v rate; edit not separately listed) |
| `seedance2_5` | `videoUri` + `mode: "edit"` + `duration: "auto"` + up to **30** image `references` (+ reference videos/audio) | "`edit` modifies the input video in place" | ≤ 10 s | 480p / 720p / 1080p | 720p: 30 + 15 (input) credits/s = **$0.45/s**; 1080p $1.02/s |

`gen4_aleph` and `gen3a_turbo` are gone (2026-07-30). Act-Two is motion capture, not editing. Aleph 2.0's own prompting guide lists wardrobe/clothing changes first among its edit types.

## 4. Mechanism comparison

| Criterion | A · xAI E1 (current) | B · best-of-N E1 + scorer | C · Architecture C propagation | D1 · Aleph 2.0 (keyframe) | D2 · Gemini Omni Flash 1.1 (edit + 5 refs) | D3 · Seedance 2.5 (edit + refs) |
|---|---|---|---|---|---|---|
| Real performance preserved | yes (edit lane) | yes | yes (pixels from footage) | documented yes ("preserving everything else") | documented edit-in-place; untested | documented edit-in-place; untested |
| Identity / pose / motion | yes | yes | yes | expected yes; untested | untested | untested |
| Canonical garment consistency | one realisation per Look, construction varies per roll | picks the best roll; cannot exceed the generator's variance | inherits the hero exactly within ±8 frames, needs re-anchor every 12–16 | inherits the keyframe's construction across the shot by design — *if* we can make a correct keyframe of this shot | reference-guided; unknown whether it pins construction | 30 references; unknown |
| Reference conditioning | undocumented `reference_images` | same | n/a (deterministic) | keyframes (this video's frames) | 5 images | 30 images |
| Temporal stability | good (residual 2.7–4.1) | same | good within reach, switch points otherwise | designed for it | unknown | unknown |
| Exact branding | deterministic layer on top | same | same | same layer applies (720p output still trackable) | same | same |
| Resolution | 720p | 720p | native | not stated (ProRes/PNG exports exist) | up to 4K portrait | up to 1080p |
| Duration | ≤ 8.7 s | ≤ 8.7 s | any | ≤ 30 s | ≤ 10 s | ≤ 10 s |
| Cost per useful second | $0.08 | $0.16–0.24 (N=2–3) | $0 + heroes | $0.28 (+ keyframe) | $0.10 | $0.45 (720p) |
| Deterministic repair compatibility | yes | yes | is the repair | yes | yes | yes |
| AVT integration | live | live + `construction_score.py` | scripts exist | new edge function (written, `runway-video-edit-proxy`) + `RUNWAY_API_KEY` in Lovable Cloud | same function | same function |

## 5. What changed / what does not matter

- **Changed:** Runway now documents three in-place video editors with image or keyframe conditioning at ≤ $0.45/s. Aleph 2.0's premise is exactly Architecture C's (one correct frame → the rest of the shot follows), executed by the provider instead of our flow engine. That attacks our actual failure (construction drifting between rolls of the same shot) *if* a correct keyframe of S08 exists.
- **Changed for AVT:** our image-edit model is retired in six weeks; capability data is now bound to the model.
- **Does not matter:** the 5-image announcement (it is the other model, and E2 stills are not our production path); reference-to-video (generation only); Grok 4.7 (orchestration, one secret); `grok-imagine-video-1.5` for edits (not listed on the editing page; 1080p is documented for generation only).
- **Caveat that matters:** the whole E1 lane rests on an undocumented parameter. It works empirically; it may change without notice.

## 6. Recommended next smoke (S08, ≈ $4.5, Fendi's call)

Identical S08 source range, identical Look truth, identical construction target, scored by `scripts/qa/construction_score.py` (pass = within the accepted shots' band on every zone, no foreign-class intrusion) + one targeted Astra part (≈ $0.6):

1. **E1 best-of-2** (control, xAI): 2 anchored rolls, $1.12.
2. **Aleph 2.0**: keyframe = the highest-scoring frame of the existing S08 E1 roll (pose-exact, canonical realisation) placed at its timestamp, edit window = the shot; ≈ $2.07 (7.4 s incl. handles).
3. **Gemini Omni Flash 1.1**: mode=edit with the Look's 5 references (anchor first) — $0.74.

Seedance 2.5 is held back (3–7× the price) unless the two above fail. Kill criterion: a mechanism whose S08 output does not `pass` the scorer is out; between passers, lowest cost per useful second wins; a passer also has to survive the targeted Astra part on temporal stability.

**Needs Fendi:** `RUNWAY_API_KEY` as an edge-function secret in AVT's Lovable Cloud (the Control Center proxy has no video-to-video route and is locked), deploy of `runway-video-edit-proxy`, and the go on ≈ $4.5 of the ≈ $43 remaining.
