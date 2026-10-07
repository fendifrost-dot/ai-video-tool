/**
 * The areas a review reports in, and the criteria they add up to. Pure: read by the review (astraSection.ts) and by
 * acceptance (acceptance.ts), which must not pull in anything that talks to the network.
 */
export const REVIEW_AREAS = ["treatment", "storyboard", "identity", "wardrobe", "environment", "cinematography", "continuity", "transition", "rhythm", "realism", "artifact", "product_truth"] as const;
export type ReviewArea = (typeof REVIEW_AREAS)[number];

/**
 * The three things a generated shot is held to, kept apart — because they fail for different reasons and are fixed
 * in different places. A shot can be exactly what the treatment asked and look fake; look real and be the wrong
 * garment; be the right garment on the wrong idea. One verdict hides which.
 *   • creative fidelity — is it the treatment's idea and this shot's scene (treatment, storyboard);
 *   • identity and garment — is it him, in the piece that was named (identity, wardrobe, product_truth);
 *   • photographic realism — does it hold as a photograph (realism, artifact);
 *   • craft — everything else a review reads (place, camera, continuity, transition, rhythm).
 */
export const REVIEW_CRITERIA = ["creative_fidelity", "identity_garment", "photorealism", "craft"] as const;
export type ReviewCriterion = (typeof REVIEW_CRITERIA)[number];
export const REVIEW_CRITERION_LABEL: Record<ReviewCriterion, string> = {
  creative_fidelity: "Creative fidelity",
  identity_garment: "Identity and garment",
  photorealism: "Photographic realism",
  craft: "Craft",
};
const CRITERION_OF: Record<ReviewArea, ReviewCriterion> = {
  treatment: "creative_fidelity",
  storyboard: "creative_fidelity",
  identity: "identity_garment",
  wardrobe: "identity_garment",
  product_truth: "identity_garment",
  realism: "photorealism",
  artifact: "photorealism",
  environment: "craft",
  cinematography: "craft",
  continuity: "craft",
  transition: "craft",
  rhythm: "craft",
};
/** Which of the criteria a finding's area speaks to. An area nobody listed is craft: it is not one of the three. */
export function criterionOf(area: string): ReviewCriterion {
  return CRITERION_OF[area as ReviewArea] ?? "craft";
}
