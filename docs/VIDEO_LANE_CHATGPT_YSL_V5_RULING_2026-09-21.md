# Video lane — ChatGPT architecture ruling on YSL section v5 (2026-09-21)

**Authority:** ChatGPT, after reading `main` @ `6e26138` and `docs/handoffs/CHATGPT_REVIEW_YSL_SECTION_V5_2026-09-21.md`; relayed by Fendi. Recorded verbatim by Claude so "check the repo" carries the ruling without copy-paste.
**Owner:** Claude (video lane, $0 architecture/implementation work). **Fendi:** approvals and account/action boundaries only (proxy redeploy, spend).

## Directive (verbatim)

> ChatGPT architecture ruling — YSL v5
>
> 1. Do not run Astra review #4 yet. Review #3 has exposed mechanism-level failures. Another full review before changing a mechanism is unnecessary spend.
> 2. Make canonical Look consistency the next primary architecture task. Stop relying on independent /videos/edits samples to establish wardrobe truth across cuts. Investigate whether the current xAI video-edit contract can condition source video on an approved canonical Look-on-artist hero frame in addition to garment references. Verify capability before redesigning AVT around it. If unavailable, evaluate Architecture C temporal propagation as the mechanism for carrying canonical garment state across the real performance.
> 3. Use a Look truth hierarchy: composed outfit sheet → primary garment/product refs → detail refs → structured Look specification. Keep per-piece references. Store default reference_policy on the Look; artist/project defaults may provide fallback. Move provider reference limits toward provider-capability configuration; temporary safety ceiling of 8 is acceptable.
> 4. Build deterministic moving-brand repair as a generalized AVT capability. Do not accept unstable Saint Laurent typography as unavoidable generation debt. Do not simply port the failed still implementation unchanged. Design garment-relative graphic tracking: canonical graphic → tracked garment coordinates/plane → perspective warp → illumination adaptation → occlusion → composite → temporal QA. It must handle arms passing in front of the graphic. Make it project/brand agnostic.
> 5. Matting priority: shadow-aware refinement first. Do not make static-pixel peeling more aggressive. Preserve foreground truth and explicitly model the background/shadow failure. Evaluate a second matting model only if shadow-aware refinement cannot solve it. Visible halo acceptance/grade is last resort, not target behavior.
> 6. B-roll production must become deterministic after planning. Recipe inference may propose a recipe during treatment/planning, but resolve that choice into explicit ShotSpec data before production. The renderer should execute the recorded recipe rather than repeatedly infer production behavior from prose.
> 7. Preserve Astra's epistemic boundaries. Silent sampled-frame review must not certify musical timing, native-rate motion, audio synchronization, or other properties it did not actually observe. Route those to appropriate deterministic/native-media QA or Fendi.
> 8. Fix the known prompt-registry gap now at $0: promote winning runtime v4c into the generalized prompt registry before it can be reused.
> 9. Redeploy the policy-as-data proxy version when authorized/available; don't leave production behavior dependent on the older deployed constant.
> 10. Next Astra invocation should occur only after new evidence exists from canonical-Look conditioning/propagation, moving-brand repair, or materially improved matte behavior. A targeted partial review is acceptable after a specific mechanism changes; otherwise continue $0 development/evaluation.
>
> The evidence now indicates prompt-only independent video generation has reached diminishing returns for wardrobe consistency. Do not solve this with more rerolls. Change the mechanism.
>
> Continue working through the $0 architecture/implementation work that does not require Fendi. Ask him only at genuine approval or account/action boundaries.
>
> One more thing: don't scale to the full song yet. The 43-second section is doing exactly what we wanted a pilot to do—it's exposing where AVT still cheats or depends too heavily on stochastic generation. Fixing these three mechanisms on the section will be considerably more valuable than carrying the same defects through another two minutes of footage.

## Reasoning that accompanied the directive (condensed, ChatGPT's words where quoted)

- **Target architecture:** "Look references → canonical approved Look-on-Fendi hero frame → performance video + canonical hero/look truth → conditioned transformation → propagation/repair → original-master composite." If direct video + canonical-image conditioning is not supported by the provider, "the fallback should not be eight more independent rerolls."
- **Look truth hierarchy:** "The outfit sheet communicates the gestalt; product/detail references preserve construction truth." A composed outfit sheet does not replace per-piece references.
- **Ownership split for branding:** "generator owns garment/body interaction; deterministic layer owns exact branding whenever geometry permits." The still pipeline stopping at 10/11 "tells us its geometry assumptions weren't robust enough even before motion" — build the moving version around tracked garment coordinates/segmentation; the logo must disappear behind an occluding arm rather than float over it. This is "deterministic graphics attached to moving garments" — logos, patches, embroidery, numbers, potentially jewelry.
- **Matte:** the failed peels showed that static-pixel removal cannot distinguish closet-coloured contamination from legitimate beige garment/skin/face pixels — "a semantic/illumination problem, not something to solve by making the peel increasingly aggressive."
- **The signal in the numbers:** identity = 8 across all three reviews; wardrobe 3–4 despite 32 billed edits and increasingly detailed prompts → "stop treating prompt engineering as the main wardrobe-control technology." Separation: generative model = believable garment integration; canonical Look/propagation = consistency; deterministic repair = exact construction details and branding; original-master composite = identity/background fidelity.
- **B-roll:** "Treatment says 'lateral push' → planner proposes still_lateral_push → ShotSpec records it → renderer executes exactly that."
- **Astra:** keep the reviewer's refusal to certify musical timing from silent strips; "don't pressure the reviewer into verdicts unsupported by its evidence."

## Claude's execution order (all $0 unless marked)

| # | Ruling item | Work | Status |
|---|---|---|---|
| 8 | v4c → registry | `GROK_VIDEO_EDIT_PROMPT_V4C_FULL_LOOK` | see `CLAUDE_LATEST.md` rev 22 |
| 6 | B-roll deterministic after planning | `render_broll_slots.py --plan` writes `production.broll` into the ShotSpec; render executes recorded recipe only | rev 22 |
| 3 | Look truth hierarchy, capability ceiling | proxy reference ordering + `_shared/providerCapabilities.ts` | rev 22 |
| 7 | Astra boundaries | builder marks requirements not observable from silent sampled frames | rev 22 |
| 2 | Conditioning contract | documentary check of xAI `/v1/videos/edits`; design doc for canonical-Look propagation, Architecture C temporal machinery evaluated as fallback | rev 22 |
| 5 | Shadow-aware matte | `composite_environment.py` refinement modelling the door shadow explicitly | rev 22 |
| 4 | Moving-brand repair | `scripts/edit/garment_graphic_track.py` — brand-agnostic tracked graphic composite | rev 22 |
| 9 | Proxy redeploy | Fendi | open |
| 1, 10 | Astra #4 | held until new mechanism evidence exists | held |
