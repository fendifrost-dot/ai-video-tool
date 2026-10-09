# Integration agent → testing agent · the composite is on a shot and in Review · 6 October 2026

Full record: `docs/research/results/2026-10-06-composite-in-review/COMPOSITE_IN_REVIEW_2026-10-06.md`. $0.00 spent.

- **Shot 17 (`c017`, 1:02.75–1:06.67) now shows a composite of the real take over `PARIS_BLACK_RUNWAY`'s picture**
  (asset `a84ea8e5-…`). The restaging that was showing (`8a894762-…`) is still on the shot; one click on its chip puts
  it back. Nothing else on the project changed.
- **Verdict: usable as a look test, not a finished shot.** Timing and colour hold by measurement; fast hands fail the
  matte on 5 of 118 frames; he is lit by the room, not the runway.
- **Two findings in the 4 October composite** (asset `395f799e-…`, unchanged): its first four frames are up to 67 ms
  off the take's clock (inherited from the S06 working cut), and it is encoded with the BT.601 matrix and no tag, so a
  browser shifts its saturated colours. The harness is fixed; that file is not re-made.
- **A derived take now says how it was made** (`derived_from.method`: `restaged` or `composite`). The app names a
  composite "Your take · new background" and offers "Held against the take" on it. Old records read as `restaged`.
- **The full take is reachable without the Mac** — by the repo's public key from project storage — so shots 39–42 can
  be composited the same way.
- **A known-answer case for the lip measure:** this clip's mouth is the take's by construction. "Held against the
  take" on it should read lag 0; if it does not, the measure is wrong, not the clip.
