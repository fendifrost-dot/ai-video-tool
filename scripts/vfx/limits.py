"""Creative limits the VFX and QC tools are not allowed to cross.

Review previews stay 1080x1920 with square pixels. There is no generated likeness,
no lip-sync, and no fade to black outside a window the project rules name.
"""

REVIEW_WIDTH = 1080
REVIEW_HEIGHT = 1920
REVIEW_SAR = "1:1"
ZOOM_MIN = 0.92
ZOOM_MAX = 1.08
MAX_CEILING_HOLD_FRAMES = 4
PUNCH_SCALE = 1.015
PUNCH_FRAMES = 2
BURST_FRAMES = 8  # cut-4 .. cut+3
MOUTH_PIVOT_Y_MAX = 0.55  # pivot stays above the mouth
FACE_DIFF_MAX = 0
CENTROID_GAP_PX = 40
