# Image manifest

The images are **not** in this public repo: they show a real person's likeness. They are shared privately (see the README).
Use the SHA-256 to confirm a file you were given is the one described here. All generated images are test assets: `approval_status = pending`, no shot assigned.

| Label | AVT asset id | Pixels | Bytes | SHA-256 | What it is | Verdict |
|---|---|---|---|---|---|---|
| ORIGINAL | `3fce9cb5-012f-4158-aecb-6615343eb2f3` | 1792×2400 | 7,511,334 | `8c18bb1b6e3b0e144853e881b13abc47e1a90ee229109f188095fe4d8c1cb13f` | Approved identity portrait (input, not generated). Status `approved`, unchanged. | — |
| A1 | `e9bcd621` | 1856×2304 | 2,548,264 | `ff7a92c688dfd29cc4d19fd225c8ae310f18a5f27a07f3d95d348a2507fbccdc` | First pass. Natural-light medium portrait. Ref: original. | PASS (my review): freckle cluster overemphasised |
| A2 | `82578b2f-6667-4be5-822e-4bc7bc0f2309` | 1856×2304 | 2,329,343 | `68e12b5b7c382751f3bf7e03376fa19a23afefee045fc0163ecda76c3685c45f` | First pass. Three-quarter view. Ref: original. | PASS, strongest A: freckles dark; turn ~30° not 45° |
| B2 | `b7a6b601-0088-4b8e-9a04-ce3c73dd267b` | 1856×2304 | 2,507,632 | `ada84064304a54c6005fffbd5ca4e6d0cc1c408f76788e5b88f4f80590bdc096` | First pass. Wardrobe, glove. Refs: original + A2. | PASS: mild glamour drift; freckles gone |
| C1 | `6a38c08f` | 2528×1696 | 3,083,591 | `351a1f62bbe5244bf7ab59c5ae012fa40df18eaf8f8244263c6f31d183cd91d1` | First pass. Horse, side. Refs: B2 + A2 (original omitted: memory crashes). | PASS: horse long; rider small |
| C2 | `a1b2ced9-8bc8-4203-a64a-f63d56391ef6` | 1856×2304 | 3,009,321 | `7e2284161f7ea070c6abcdf25ecaacff33db2e113426120d9aedf0195492cdd6` | First pass. Horse, three-quarter. Refs: B2 + A2. | PASS, strongest C: ambiguous strap |
| D2 | `d2e9da78` | 1856×2304 | 3,102,370 | `8df273c97ff744b32cb438169b8c48c48e7cbf13973c6fb73fe09fdfc79a244d` | First pass. Burning forest, medium. Refs: C2 + A2. | PARTIAL: daylight-lit subject, identity drift |
| D-retry | `c44fe57c-1bd1-4d19-87c5-3c1706f7d039` | 2528×1696 | 3,136,174 | `d9d3fc6b81b1a77575c911e2e7c9330a1a5ecdecbc07385825535b8c852de15c` | First pass. Burning forest, night, firelight only. Refs: C2 + A2. | PASS lighting / PARTIAL identity |
| R1 | `3eee45de-5655-4afb-9468-c54dd72192c5` | 1856×2304 | 2,841,677 | `ca11e6090cfa7b33133735bd6672c558860f08353ce5542fbc1458a4ca71277e` | Second pass. B full length. Refs: ORIGINAL + B2. | Independent review: identity PARTIAL; treatment FAIL (monogram-like emblem on whip collar); sport gloves |
| R2 | `b48306d3-fdb2-4227-a21b-30978d6e3cb0` | 1856×2304 | 3,005,183 | `0bf34246e017fe108673d0cb717d108c081723d47fb55c5e2e9aae545c32f034` | Second pass. C black horse. Refs: ORIGINAL + R1 + C2 (13.4 MB). | Independent review: test-only; identity PARTIAL (slimmer, younger); rider oversized |
| R3 | `03d9a1c4-17e7-499a-81a8-a0da3366a841` | 1856×2304 | 3,119,353 | `fdf742b8afb604239710a93fa598b7da40be489345360d0880ff26fea9da0fa7` | Second pass. D forest medium. Refs: ORIGINAL + R2. | Independent review: reject; identity FAIL (younger, piercings); lighting FAIL (composited) |
| R4b | `aebaca89-4f54-4644-a202-22fa86951b2b` | 2528×1696 | 3,098,527 | `255bba5687bfe1643a3719949fe92d99415142f74d2f8aae493789f843193b10` | Second pass. D forest wide, firelight only (after the MAX_TOKENS retry). Refs: ORIGINAL + R2. | Independent review: reject; identity FAIL (younger, hoop earring); lighting PARTIAL; horse standing |
| R5 | `31ec27fb-9c15-4b08-832f-9be4242725c8` | 1856×2304 | 2,908,436 | `86117787f2c674707a45a6dccd9248e3d748d7c2ff2c8bacbae99df1b2f640e7` | Second pass. D firelight closer. Refs: ORIGINAL + R2. | Independent review: reject; identity PARTIAL (closest at night); horse anatomy FAIL; key light on the wrong side |

Review crops used by the independent reviewer (second pass): faces, hands, gloves, whip, tack, legs and horse head, cut from R1–R5 at full resolution. They are shared alongside the images.