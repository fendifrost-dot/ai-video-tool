# Partnership / Cease & Desist: performance takes, synced to the song, best take per line

Fendi uploaded his performance footage to the T7 on 17 Nov 2026 (`performance shots/1st half performance.mov`,
`2nd half performance.mov`). He said: "some of my words are off because I didn't memorize the song yet … overall this
should be good enough." This sheet syncs every take to the master (`PARTNERSHIP - CEASE & DESIST MASTER  - 11.15.26.wav`)
and ranks the takes line by line. $0, done on the Mac. Machine-readable copy: T7 `work/performance/coverage.json`.

## The footage (VERIFIED by ffprobe)

- Both files are **1920x1080, ~30 fps, HEVC, iPhone 14, Cinematic mode**. His Camera settings (screenshot, 17 Nov):
  Record Video 4K 24, but **Record Cinematic 1080p 30**, and the takes were shot in Cinematic. Sharing a Cinematic clip
  renders the blur into a new file, so no 4K original exists. Next shoot: plain Video mode (4K 24).
- Conform to 24 fps in the edit. The baked-in depth blur softens his outline for the storm matte.

## Takes (file time → song time; song = file + offset)

| Take | File | File time | Song time | Look | Angle |
|---|---|---|---|---|---|
| A | 1st half | 0:16–2:02 | 0:01–1:47 | brown leather jacket, cap | front, medium (knees up), a little right of centre |
| B | 1st half | 2:10–3:58 | 0:00–1:48 | same | front, medium, left of centre |
| C | 1st half | 4:22–6:08 | 0:02–1:48 | same | front, medium, centred |
| D | 1st half | 6:08–7:56 | 0:01–1:49 | same | **side profile** (facing left); lips not scored (the face tracker needs his front) |
| E | 1st half | 7:56–9:40 | 0:01–1:45 | same | front, medium, right of centre |
| (empty) | 1st half | ~9:40–9:58 | — | — | **empty room plate** for the first-half setup |
| E-hand | 1st half | 10:03–10:28 | 2:08–2:33 | same | **handheld close-up from below** (selfie), storm-verse opening |
| S1 | 2nd half | 0:15–1:38 | 1:58–3:21 | trench coat, bucket hat | low angle, **no fan**; his head drifts out of the top at times |
| S2 | 2nd half | 2:20–3:19 | 2:14–3:13 | same | low angle, fan, centred, full length |
| S3 | 2nd half | 4:42–6:18 | 1:30–3:06 | same | low angle, fan, centred, full length |
| S5 | 2nd half | 9:08–11:15 | 1:40–3:47 | same | low angle, fan, centred, full length; the only take through "cease and desist" |

Offsets (s): A −14.72, B −129.69, C −260.10, D −367.39, E −475.17, S1 +103.30, S2 −5.47, S3 −191.46, S5 −447.67.
2nd-half 8:10–9:10 (S4) is mostly the phone being set up; not used.

**How the sync was found.** VERIFIED for A–E and S1: the playback is audible on the phone mic, and its onsets
cross-correlate with the master at a constant offset per take. For the fan takes (S2, S3, S5) the blower drowns the
beat, so: pitch (chroma) similarity integrated along constant offsets, anchored by Whisper words heard after removing
the steady fan noise ("all this drip turn to self esteem … clean with my partner nem'" in S3 and S4), then refined to
10 ms on fan-subtracted onsets. Cross-check: his lip movement in S2, S3 and S5 matches frame for frame (best shift 0
frames at 12 fps; S1 too where his face is in frame). The lip scan is `scripts/edit/mouth_scan.py`, which reads landscape takes since 17 Nov.

## Best take per line

"Best" = the takes whose lips follow the line most like the other takes do (correlation ≥ 0.85 with the per-line
median of all takes, face found ≥ 80 % of the line). OBSERVED, not a word check: a take can score well and still
have a wrong word. "Check" = that take's lips drift from the others on this line (< 0.6): likely a slip; avoid it there.
Lines 108–113 have one or two takes only, so no ranking: S5 is the take that reaches the end.

| # | Song | Line | Best | Also covers | Check |
|---|---|---|---|---|---|
| 0 | 0:07.0 | Back to back Lexus | A, C | B, D, E |  |
| 1 | 0:08.4 | Don’t stress us | C, B, A | D, E |  |
| 2 | 0:08.8 | Economy really don’t affect us | C, B, A | D, E |  |
| 3 | 0:10.9 | Put the G in Gx acting extra | C, B, A | D, E |  |
| 4 | 0:12.6 | Pull up you can still smell the leather | A | B, C, D, E |  |
| 5 | 0:15.7 | My partner Allen | E, A, B | C, D |  |
| 6 | 0:16.9 | Had it automatic | E, B, C | A, D |  |
| 7 | 0:18.4 | Flip through green | C, B, A | D, E |  |
| 8 | 0:18.8 | Treat it like it’s salad | B, C, A | D, E |  |
| 9 | 0:19.8 | Ralph Lauren fanatic | B, E | A, C, D |  |
| 10 | 0:21.0 | Money magnet | B, C, E | A, D |  |
| 11 | 0:21.8 | Remember all them days | B, C, E | A, D |  |
| 12 | 0:22.8 | we ain’t have it | B, E, C | A, D |  |
| 13 | 0:23.6 | Now I’m steady jumping Tax brackets | C, E, A | B, D |  |
| 14 | 0:25.8 | Carbon fiber slicker than some satin | B, C, A | D, E | E |
| 15 | 0:27.4 | Wood grain car feel like a cabinet | B, C, A | D, E |  |
| 16 | 0:28.9 | No exaggeration no gimmicks | C, E, A | B, D |  |
| 17 | 0:30.8 | All my business partners got Benz’s | B, C, E | A, D |  |
| 18 | 0:32.5 | Fuck a rap the cars get wrapped | C, B, A | D, E |  |
| 19 | 0:34.4 | Or we put the paint on it | B, C | A, D, E |  |
| 20 | 0:35.6 | Until it’s swimming | C, E, A | B, D |  |
| 21 | 0:36.1 | Real nigga this ain’t just an image | E, C, A | B, D |  |
| 22 | 0:37.9 | Ballin on an off day like a scrimmage | B, C, A | D, E |  |
| 23 | 0:39.9 | I don’t got no goofy dance with it | B, E, C | A, D |  |
| 24 | 0:41.8 | I’m Prada like my partner still livin | B, C, A | D, E |  |
| 25 | 0:44.9 | Every time I put the polo on | A, B | C, D, E |  |
| 26 | 0:47.1 | Wishin you was here | B | A, C, D, E |  |
| 27 | 0:48.1 | They did you wrong | B, E, C | A, D |  |
| 28 | 0:49.2 | Not alive But livin | E, C | A, B, D | A |
| 29 | 0:49.7 | through these songs | C, E | A, B, D |  |
| 30 | 0:51.5 | Back to back | A | B, C, D, E |  |
| 31 | 0:56.0 | Back to back Benz’s | B, E | A, C, D |  |
| 32 | 0:56.2 | Back to back Lexus | E, C, A | B, D |  |
| 33 | 0:57.8 | Back to back flexin | A, C, E | B, D |  |
| 34 | 0:59.4 | Like we wrestling | E, C, A | B, D |  |
| 35 | 1:01.5 | Back to back blessings | C | A, B, D, E | B |
| 36 | 1:05.1 | Back to back blessings | B, C, A | D, E |  |
| 37 | 1:07.3 | Back to back | C, A | B, D, E | E |
| 38 | 1:10.5 | Back to back | B, A, C | D, E |  |
| 39 | 1:10.5 | This a real nigga frequency | B, C | A, D, E |  |
| 40 | 1:12.5 | Gotta fuck em up frequently | A, C, B | D, E |  |
| 41 | 1:16.0 | Speaking to your spirit we agree | B | A, C, D, E |  |
| 42 | 1:18.1 | See you frequently up in my dreams | B, A | C, D, E | E |
| 43 | 1:20.2 | Close to the creator fly as ever | E, B | A, C, D | A |
| 44 | 1:21.8 | As your guidance shining | A | B, C, D, E |  |
| 45 | 1:22.7 | On to me | A, C, E | B, D |  |
| 46 | 1:23.4 | All these clothes | C, E, B | A, D |  |
| 47 | 1:24.1 | Used to get us fly | B, A, C | D, E |  |
| 48 | 1:25.4 | Now it’s like the wisdom | B, C, E | A, D |  |
| 49 | 1:26.6 | Gives us wings | B | A, C, D, E |  |
| 50 | 1:27.0 | Still got designer denim on | C, B, A | D, E |  |
| 51 | 1:29.1 | All this knowledge floating | A, B | C, D, E |  |
| 52 | 1:30.0 | Through my genes | B, C, A | D, E |  |
| 53 | 1:30.7 | All this drip turn to self esteem | C | A, B, D, E, S3 |  |
| 54 | 1:38.5 | all this drip turn to self esteem | B | A, C, D, E, S3 |  |
| 55 | 1:39.8 | Clean with my partner nem’ | C, B, E | A, D, S3 |  |
| 56 | 2:03.0 | Yo yo yo yo | S5 | S1, S3 | S3 |
| 57 | 2:04.1 | Ralph Lauren sport | S3 | S1, S5 |  |
| 58 | 2:07.9 | Ralph umbrellas for the | S3 | E-hand, S1, S5 | S5 |
| 59 | 2:11.0 | Ok I got it | S3 | E-hand, S1, S5 |  |
| 60 | 2:11.8 | Ralph umbrellas for the rain | S5 | E-hand, S1, S3 |  |
| 61 | 2:16.5 | Range Rover sport for the range | S2, S3, S5 | E-hand, S1 |  |
| 62 | 2:19.0 | Fendi bucket hat for the brain | S2, S5, S3 | E-hand, S1 |  |
| 63 | 2:21.4 | Old school back in the days | S2, S5, S3 | E-hand, S1 |  |
| 64 | 2:23.6 | Before we would splash | S3 | E-hand, S1, S2, S5 | S2 |
| 65 | 2:24.8 | in these foreigns | S5, S2 | E-hand, S1, S3 |  |
| 66 | 2:26.1 | We was still competing for the waves | S2, S3 | E-hand, S1, S5 |  |
| 67 | 2:28.3 | Ide give all this | S3 | E-hand, S1, S2, S5 | S2 |
| 68 | 2:28.9 | material shit up | S3, S2 | E-hand, S1, S5 | S5 |
| 69 | 2:30.6 | Just to pull you | S2 | E-hand, S1, S3, S5 | S3, S5 |
| 70 | 2:31.3 | Back up out the grave | S2, S5 | E-hand, S1, S3 |  |
| 71 | 2:32.2 | Just talked to your mama | S5, S2 | S1, S3 |  |
| 72 | 2:33.7 | And she miss you | S2, S3, S5 | S1 |  |
| 73 | 2:35.1 | Where did the time go | S3 | S1, S2, S5 |  |
| 74 | 2:35.8 | It’s been a decade | S3, S2, S5 | S1 |  |
| 75 | 2:37.1 | Some things just too hard | S3 | S1, S2, S5 | S2 |
| 76 | 2:38.5 | To let go | S3 | S1, S2, S5 |  |
| 77 | 2:39.2 | And real niggas | S2, S5 | S1, S3 |  |
| 78 | 2:40.1 | Never get enough praise | S2 | S1, S3, S5 |  |
| 79 | 2:41.5 | All the challenges | S3 | S1, S2, S5 |  |
| 80 | 2:42.7 | You overcame | S2, S3, S5 | S1 |  |
| 81 | 2:43.8 | White challenger | S2, S5 | S1, S3 |  |
| 82 | 2:44.9 | Filled up with pain | S5, S3, S2 | S1 |  |
| 83 | 2:46.9 | Find meaning and the reason | S2 | S1, S3, S5 |  |
| 84 | 2:47.6 | But I can’t | S2 | S1, S3, S5 |  |
| 85 | 2:48.4 | Why they put bullet holes | S3, S5 | S1, S2 |  |
| 86 | 2:49.5 | All in your frame | S3, S2, S5 | S1 |  |
| 87 | 2:50.4 | Fight through life | S3 | S1, S2, S5 |  |
| 88 | 2:51.4 | With disdain | S5 | S1, S2, S3 |  |
| 89 | 2:52.1 | Lost my day one | S5 | S1, S2, S3 |  |
| 90 | 2:53.3 | Now my nights ain’t the same | S2, S5 | S1, S3 |  |
| 91 | 2:54.3 | Cost me everything | S2 | S1, S3, S5 |  |
| 92 | 2:55.5 | Heavy price for this pain | S2, S3, S5 | S1 |  |
| 93 | 2:56.6 | Four years ago | S3, S5 | S1, S2 |  |
| 94 | 2:57.7 | Almost lost my life | S5, S3 | S1, S2 |  |
| 95 | 2:58.4 | The same way | S3 | S1, S2, S5 |  |
| 96 | 2:59.0 | Tell me was that you | S3, S5 | S1, S2 |  |
| 97 | 2:59.8 | That told them niggas don’t shoot | S3 | S1, S2, S5 |  |
| 98 | 3:01.1 | Gun to my head replaying | S5, S3 | S1, S2 |  |
| 99 | 3:02.8 | Nothing I can do | S5, S3, S2 | S1 |  |
| 100 | 3:03.4 | I’m here for a purpose | S3 | S1, S2, S5 |  |
| 101 | 3:04.6 | Mama prayed for me | S3 | S1, S2, S5 |  |
| 102 | 3:05.5 | But when I go they better | S2 | S1, S5 |  |
| 103 | 3:06.7 | Throw parades for me | S2, S5 | S1 |  |
| 104 | 3:07.8 | All this good that I put out | S5, S2 | S1 |  |
| 105 | 3:09.1 | Do the same for me | S5, S2 | S1 |  |
| 106 | 3:10.5 | Hope I go from old age | S2, S5 | S1 |  |
| 107 | 3:11.4 | But no man knows his day | S5 | S1, S2 |  |
| 108 | 3:12.5 | We all on the list | — | S1, S5 |  |
| 109 | 3:14.8 | We all on the list | — | S1, S5 |  |
| 110 | 3:19.6 | Whether poor whether rich | — | S1, S5 |  |
| 111 | 3:23.0 | Whether poor whether rich | — | S5 |  |
| 112 | 3:25.2 | Whether poor whether rich | — | S5 |  |
| 113 | 3:26.0 | We all get a cease and desist | — | S5 |  |

## For the edit

- The first half has five full passes (A–E) in one look, plus a side profile (D): cut on lines, angle to angle.
- The storm verse has three fan takes (S2, S3, S5) from one low angle, plus the no-fan S1 and the handheld close-up
  (E-hand, brown jacket) for the opening lines.
- **The storm takes were shot from near the floor, tilted up**, not from the 3D set's C/D camera (1.0 m, 7.7°). The 3D
  camera gets matched to his footage (height and tilt measured from the takes) before the storm is composited. No reshoot needed.
