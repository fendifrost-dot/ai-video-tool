// Deno copy of src/lib/heroFrame/maskedGarmentPrompt.ts — edge functions deploy
// independently and cannot import from the Vite src tree.
//
// This is the SERVER-SIDE FALLBACK. The Hero Frame Studio always sends its own
// copy of these strings on the request, so for anything routed through the UI
// the src/ file wins and this one is never read. It matters for direct or
// service-role calls to jacket-inpaint-proxy that omit prompt/maskPrompt.
//
// Keep the two files in sync. See the src/ copy for why this lane's prompt is a
// garment description rather than the lock-negotiation the Grok lane needs.

export const MASKED_GARMENT_PROMPT =
  "Clothing only, inside the masked region only. " +
  "A Saint Laurent Track Jacket worn on the torso: cream off-white body, " +
  "navy contrast stripe running down each shoulder and sleeve, " +
  "'SAINT LAURENT' script embroidered across the chest, ribbed stand collar, " +
  "full-length zip worn closed, ribbed cuffs and hem, matte technical jersey " +
  "with natural fabric drape and soft folds. " +
  "Lighting, exposure and colour temperature match the surrounding photograph. " +
  "Fill the entire masked region with garment — no skin, no face, no hands, " +
  "no background, no second person.";

export const MASKED_GARMENT_NEGATIVE_PROMPT =
  "face, head, hair, eyes, glasses, sunglasses, cap, hat, hands, fingers, " +
  "orange pants, rust trousers, background, second person, duplicate torso, " +
  "open jacket, warped text, distorted logo, garbled lettering, " +
  "extra sleeves, extra collar, blurry, deformed";

export const MASKED_GARMENT_MASK_PROMPT =
  "the jacket and upper-body clothing worn on the torso and arms, sleeves, collar";

export const MASKED_GARMENT_FACE_GUARD_PROMPT =
  "the person's head, face, beard, hair, cap, glasses, ears, neck and hands";
