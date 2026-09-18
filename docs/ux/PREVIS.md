# Animated Previs (Lane E)

**Grok-initiated · Treatment UX · Wave 2**

Short animated previews per shot, derived **deterministically** from a
[Shot Spec](./SHOT_SPECIFICATION.md). Zero paid model calls, zero network, zero
randomness: the same spec always yields byte-identical output.

A previs **blocks out framing and camera motion** — it does not fabricate
footage. The subject is a neutral head+torso placeholder; the backdrop is a
palette derived from the environment/lighting keywords. This is intentionally a
*mock/sketch* asset, orthogonal to (and never a substitute for) the locked
video-swap production path in [`VIDEO_SWAP_ARCHITECTURE.md`](../VIDEO_SWAP_ARCHITECTURE.md).

## Pipeline

```
ShotSpec ──buildPrevisPlan──▶ PrevisPlan ──renderPrevisSvg──▶ animated SVG ──▶ data: URI
                (pure)                        (pure)                    (previs.uri)
```

| Stage | Module | Responsibility |
|-------|--------|----------------|
| Derive | `src/lib/previs/previsPlan.ts` | Spec → `PrevisPlan` (palette, framing box, camera-motion transform, seed, captions). Pure, deterministic. |
| Palette | `src/lib/previs/palette.ts` | FNV-1a hash + keyword tone → stable HSL palette. |
| Render | `src/lib/previs/renderSvg.ts` | `PrevisPlan` → self-contained animated SVG (SMIL `animateTransform`). Also `previsSvgToDataUri`. |
| Generate | `src/lib/previs/generatePrevis.ts` | One-call entry: `generatePrevis(spec)` → `{ plan, svg, dataUri, previs }`. `applyPrevisToSpec` merges a sketch into a spec's `previs` field. |
| Present | `src/features/previs/ShotPrevis.tsx` | Component treatment cards import. Renders the animated sketch inline, status badge, caption; reveals derivation details in engineering mode. |

## Contracts consumed

- **Shot Spec** (`src/lib/treatment/shotSpec.ts`) — reads `framing`, `cameraMotion`,
  `timeline`, `wardrobe`, `environment`, `lighting`, `lens`; writes the existing
  `PrevisSchema` field (`status`/`uri`/`notes`).
- **Engineering mode** (`src/lib/ux/engineeringMode.ts`) — gates the technical
  derivation footer (seed / lens / motion transform / payload size). Hidden in
  the default creative mode; visible in engineering mode.

## Camera motion → animation

Modest, looping amplitudes — the previs *suggests* the move.

| Motion | SVG transform |
|--------|---------------|
| `static` | none (locked off) |
| `pan` / `truck` / `whip_pan` / `steadicam` / `gimbal` | `translate` (x) |
| `tilt` / `pedestal` / `crane` / `jib` | `translate` (y) |
| `dolly` / `zoom` / `drone` | `scale` |
| `orbit` | `rotate` about centre |
| `handheld` | fast `translate` jitter |

## Guarantees

- **Deterministic** — no `Date.now`/`Math.random`; identical spec → identical asset.
- **Free** — never calls a provider/edge function; nothing to redeploy.
- **Non-destructive** — `applyPrevisToSpec` refuses to overwrite a *real*
  rendered/approved asset (a non-`data:` URI); it only fills sketch placeholders.
- **Additive (Class A/B)** — greenfield `src/lib/previs/**` + `src/features/previs/**`;
  touches no storage/provider/rendering/timeline code.
