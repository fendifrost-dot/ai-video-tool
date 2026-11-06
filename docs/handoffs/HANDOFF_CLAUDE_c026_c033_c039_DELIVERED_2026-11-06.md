# replacements_claude_2026-11-06 — c026 / c033 / c039 regenerated (Grokbot's handoff of 5 Nov)

Drop path (AVT storage, `project-assets` bucket):
`3ca10935-8c3d-4479-9a0c-8bfe8050840c/764a63d2-93cd-44f3-905f-292f14ab2f51/project-exports/canonical/grokbot_first_half_2026-11-05/replacements_claude_2026-11-06/`

Every file: 1080x1920, 24 fps, SAR 1:1, H.264 (crf 16), silent, exact slot length. Cut from a 4 s recipe-F
montage render with `fps=24` + lanczos; no frame is repeated or dropped inside the slot.

| Slot | File | Frames | SHA-256 | AVT asset | Board |
|---|---|---|---|---|---|
| c033 | `c033_25cde54d_36f_1080x1920_24.mp4` | 36 | `2636435665413590eefff81c798c466bca8f0370c18ccdfbbeacf6980234fa93` | `20b8c185-a6f2-4664-9aef-2971d17ca9db` | FINAL on c033: Fendi 6 Nov ("PERFECT!"), primary on the board, swapped into the package |
| c039 | `c039_f94848cb_70f_1080x1920_24.mp4` | 70 | `fc6842fa7fa8dcdc11a79e349380fdf38f298b90278fc2090a92d0a18d1aa913` | `d90d6f29-afa7-4355-93a2-1cfd615d56ea` | FINAL on c039: Fendi 6 Nov ("PERFECT!"), primary on the board, swapped into the package |
| c026 | `c026_172abaa2_36f_1080x1920_24.mp4` | 36 | `6a0fd94242942e09cf01eedda8a6b4704c55fc8b34e2ade1b0bdc849805bacce` | `081a4ddf-4c08-4e26-987e-c2ba6a8f5f46` | FINAL on c026: Fendi 6 Nov ("PERFECT!"), primary on the board, swapped into the package |

How the mouth stayed closed without killing the motion (one line, all three): recipe F — the montage is
driven by a SILENT reference take of him (`sync: loose`, `motion: calm`) plus his five face pictures, and the
prompt asks for breath / weight shift / head turn as separate, continuous body motion while the mouth is
constrained to the reference's closed mouth; no bare "no mouth movement" line is sent. Checked afterwards with
`scripts/edit/mouth_scan.py` (moving = mean > 0.08 and std > 0.03): c033 mean 0.019, c039 0.026, c026: the full-frame scan does not lock on his three-quarter face at this size, so it was run on a 2x crop of his 30 frames: mean 0.09, std 0.021 (no movement; the mean is not comparable with the full-frame figures), and every frame of his part is on `c026_172abaa2_him_frames.jpg` with the lips together.

Per slot:
- c033 — same kitchen / showroom scene and framing, him at rest, b-roll (not a performance shot). The 18 Oct
  approved performance clip stays primary on the board until Fendi accepts this one.
- c039 — platform world, beige striped jacket, jeans, Prada America's Cup sneakers; shot from further back so
  the shoes read whole (no punch-in), mouth at rest.
- c026 — fox asleep on the baggage carousel, him seated at the right in the leather bucket hat and coat
  (reference: c041 FINAL `6f4edd50`), mouth at rest. Attempt 1 (`9304b6af`) came back as a centred close-up
  and was not filed; attempt 2 (`172abaa2`, job `5fc31622`) spelled the layout out as one frame and landed it: the render's hard cuts fall at frames 45 and 75, so the slot is frames 39–74 (6 frames of the fox, then 30 of him).

## Approved and swapped in (Fendi, 6 Nov 2026: "PERFECT!")

All three are now `approval_status: approved`, PRIMARY on their shots on board `c067efb9`, and swapped into the
package with `apply_replacements.py` (manifest, XML, SHA256SUMS rebuilt; old slot/source files deleted):

| Slot | Package slot file | Slot frames | Package source file | Replaced |
|---|---|---|---|---|
| c026 | `slots/c026_081a4ddf_slot.mp4` | 35 (slot 45.28–46.75 s) | `sources/c026_081a4ddf_source.mp4` (36 f) | `d2ce8f07` (mouth moving, no lyrics) |
| c033 | `slots/c033_20b8c185_slot.mp4` | 36 | `sources/c033_20b8c185_source.mp4` | `ce365795` (18 Oct performance restage, mouth moving) |
| c039 | `slots/c039_d90d6f29_slot.mp4` | 71 (last frame held, slot 67.90–70.85 s) | `sources/c039_d90d6f29_source.mp4` (70 f) | `65465c7a` (mouth moving, deformed shoes) |

Checks after the swap: `sha256sum -c SHA256SUMS.txt` → 94 OK of 94; `avt_list_files` on `slots/` → 47 entries with the
three new names; board read → exactly one primary on each of the three shots. The swap script's ffprobe field order was
wrong (it read width as the frame count); fixed, every row re-probed, manifest and XML re-uploaded.

Untouched: c010 (polar bear), c041/c042/c045/c046 FINAL, c013/c044 picks, c009 FINAL.
Slot note: the 5 Nov package table lists c026 at 35 frames (45.28–46.75 s); Grokbot's cut uses 36. The file is 36;
a 35-frame drop trims the last frame.

Spend: 4 x $2.219 list (ledger rows 227–230 in `docs/LEDGER_YSL_TESTING_BUDGET.md`).
Verify a file: `sha256sum <file>` and `ffprobe -v error -select_streams v -show_entries stream=width,height,r_frame_rate,sample_aspect_ratio,nb_frames -of csv=p=0 <file>` → `1080,1920,1:1,24/1,<frames>`.
