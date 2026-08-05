"""warp_worker — gated garment-detail propagation / compositing prototype.

This is the CUSTOM, OFF-Fal propagation worker that fills the deliberately
"disabled" hole in the AVT edge function ``wardrobe-video-propagate-proxy``
(see ``supabase/functions/_shared/propagation.ts`` — Fal hosts no dense
optical-flow / warp / EbSynth endpoint, so this step must run elsewhere).

It is a TIGHTLY-SCOPED PROTOTYPE for ONE approved 2-4s shot, NOT a full-video
production service. It implements the LOCKED architecture
(``docs/VIDEO_SWAP_ARCHITECTURE.md``) fallback design:

    Kolors = base geometry / identity authority   (base garment frames)
    Grok   = garment-detail reference / anchors    (correction anchors, NOT a
                                                     literal full-frame donor)
    -> derive localized construction corrections
    -> propagate them through dense optical flow + a re-anchor GATE
    -> composite ONLY inside the garment region onto the ORIGINAL footage
    -> deterministic brand layer for the navy stripe + logo
    -> new anchors at major pose changes / flow breaks

HONEST COMPUTE BOUNDARY: dense optical flow, warping and heavy compositing
cannot run on Fal video ops or a Deno edge function. The prototype's real
compute path is LOCAL ffmpeg + python/opencv on the T7 benchmark set; the
production path is a dedicated GPU worker (RAFT/GMFlow) exposing the same
interfaces. Nothing here fakes a flow field it did not compute.
"""

__all__ = ["__version__"]
__version__ = "0.1.0-prototype"
