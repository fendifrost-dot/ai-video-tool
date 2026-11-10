# P&L head angles: side and front, alternating (Fendi, 10 Nov 2026)

## Direction (his words)

> "Let's alternate starting at one of the sides at the beginning of the video with the effect we chose not to go
> with originally and then to front view when the song starts and then to the other side after a period and keep
> alternating side to front view. We'll keep the effect that we have for the front view and for the side view
> we'll use the other effect and then I'll have Grok bot do transitions and After Effects."

## What that means

- **Front view:** the front look you already built (look 1, blend, latest `PL_15s_look1_v4`).
- **Side views:** the other look (look 2, universe: the scenes inside his head, moving space behind).
  Use the side takes. Sides alternate left, right, left, and so on, with a front block between each.
- **Transitions** between blocks are yours to design in After Effects.

## Schedule on the song clock

Blocks follow shot boundaries and the 104 BPM phrases, about 10–12 s each. Fendi can change any block's length;
change the CSV and the times follow.

| # | Angle | Song in-out (s) | Shots | Section | Take file | Take in-out (s) | Look |
|---|---|---|---|---|---|---|---|
| 1 | left | 0.00-11.62 | c001-c002 | intro | `PERFORMANCE/SIDE SHOTS/IMG_6358_left.mov` | 2.999-14.619 | Look 2: universe |
| 2 | front | 11.62-22.58 | c003-c005 | verse 1 starts | `PERFORMANCE/IMG_6353_passC.mov` | 14.652-25.612 | Look 1: blend (the front look kept) |
| 3 | right | 22.58-33.54 | c006-c008 | verse 1 | `PERFORMANCE/SIDE SHOTS/IMG_6358_right.mov` | 25.580-36.540 | Look 2: universe |
| 4 | front | 33.54-45.66 | c009-c011 | verse 1 | `PERFORMANCE/IMG_6353_passC.mov` | 36.572-48.692 | Look 1: blend (the front look kept) |
| 5 | left | 45.66-55.46 | c012-c014 | verse 1 | `PERFORMANCE/SIDE SHOTS/IMG_6358_left.mov` | 48.659-58.459 | Look 2: universe |
| 6 | front | 55.46-67.58 | c015-c018 | verse 1 | `PERFORMANCE/IMG_6353_passC.mov` | 58.492-70.612 | Look 1: blend (the front look kept) |
| 7 | right | 67.58-80.27 | c019-c021 | verse 2 starts | `PERFORMANCE/SIDE SHOTS/IMG_6358_right.mov` | 70.580-83.270 | Look 2: universe |
| 8 | front | 80.27-93.54 | c022-c025 | verse 2 | `PERFORMANCE/IMG_6353_passC.mov` | 83.302-96.572 | Look 1: blend (the front look kept) |
| 9 | left | 93.54-104.50 | c026-c028 | hook 1 | `PERFORMANCE/SIDE SHOTS/IMG_6358_left.mov` | 96.539-107.499 | Look 2: universe |
| 10 | front | 104.50-116.62 | c029-c031 | hook 1, full frame | `PERFORMANCE/IMG_6353_passC.mov` | 107.532-119.652 | Look 1: blend (the front look kept) |
| 11 | right | 116.62-129.31 | c032-c033 | hook 2 | `PERFORMANCE/SIDE SHOTS/IMG_6358_right.mov` | 119.620-132.310 | Look 2: universe |
| 12 | front | 129.31-137.54 | c034 | outro (front take ends at song 133.55 s) | `PERFORMANCE/IMG_6353_passC.mov` | 132.342-140.572 | Look 1: blend (the front look kept) |

Take in/out = song time + that take's own song-zero (VERIFIED by audio sync):
- **Front 4K** (`IMG_6353_passC.mov`): 3.0324 s. It ends at song 133.55 s, so the head is gone for the last 4 s of block 12, as planned.
- **Left 4K** (`IMG_6358_left.mov`): 2.9994 s.
- **Right 4K** (`IMG_6358_right.mov`): 2.9996 s.

The side takes are landscape 3840x2160; the front take is portrait.

## Files in this folder

- `head_angles_edl.csv` / `.json`: the same schedule, machine-readable.
- `PL_head_angles_animatic.mp4`: the raw takes cut to this schedule on the song. No effects, hard cuts, and a
  label in the corner with the block number and angle. Timing reference only.
