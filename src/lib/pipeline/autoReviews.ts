/**
 * Product-safe $0 auto-reviews.
 *
 * GREEN: auto-set stillRepairApproved only when the run already holds the
 * CLEARED 1m chest + CLEARED 1c sleeve identities (Fendi already signed those
 * stills). That lets the canonical unattended path pass the temporal gate
 * without a second manual click.
 *
 * This module may inspect CLEARED asset ids. The orchestrator still does not.
 */

import { isClearedChestArtifact } from "./chest";
import { isClearedSleeveArtifact } from "./sleeve";
import type { SeedArtifact } from "./types";

export const PRODUCT_SAFE_AUTO_REVIEW = {
  stillRepairApprovedWhenClearedStillsImported: true,
  paidCalls: false as const,
} as const;

/**
 * Flags the $0 auto-run MUST NOT set. Callers may still set them explicitly
 * in tests / after a human decision — never from this helper.
 */
export const AUTO_REVIEW_DO_NOT_SET = [
  {
    key: "masterCompositeAuthorized",
    class: "RED" as const,
    reason:
      "Architecture C gate 4 / live SAM-3 original-master composite. RECONSTRUCT-1 E2E fixture is not live SAM-3 authorization.",
  },
  {
    key: "exportApproved",
    class: "YELLOW" as const,
    reason: "Human export / review-board approval. Unattended dispatch ≠ ship the package.",
  },
  {
    key: "stillRepairApproved",
    class: "YELLOW" as const,
    reason:
      "Do not auto-approve UNSCORED or non-CLEARED live chest/sleeve outputs. Only the locked 1m/1c identities qualify.",
    exception: "CLEARED chest 1m + sleeve 1c imported together",
  },
  {
    key: "paid_generation",
    class: "RED" as const,
    reason: "Generation stays import-only. No Grok / V3 / Fal spend from Lane G2.",
  },
] as const;

export function seedsHaveClearedChestAndSleeve(seeds: readonly SeedArtifact[]): boolean {
  const asArtifacts = seeds.map((s) => ({
    ...s,
    id: s.id ?? "",
    producedAt: s.producedAt ?? "",
  }));
  return asArtifacts.some(isClearedChestArtifact) && asArtifacts.some(isClearedSleeveArtifact);
}

/** Merge-safe auto reviews. Never sets RED/YELLOW flags listed in AUTO_REVIEW_DO_NOT_SET except the CLEARED exception. */
export function productSafeAutoReviews(seeds: readonly SeedArtifact[]): Record<string, boolean> {
  if (!seedsHaveClearedChestAndSleeve(seeds)) return {};
  return { stillRepairApproved: true };
}
