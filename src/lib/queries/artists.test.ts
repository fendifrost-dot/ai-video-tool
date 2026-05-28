import { describe, expect, it } from "vitest";
import { getCanonicalBaseImageUrl } from "./artists";
import type { Artist } from "@/integrations/supabase/aliases";

// Helper — only the fields the unit-under-test reads, with a cast to Artist
// for ergonomics (full row has many unrelated nullable columns).
function artist(profile: unknown): Pick<Artist, "identity_profile_json"> {
  return { identity_profile_json: profile as Artist["identity_profile_json"] };
}

describe("getCanonicalBaseImageUrl", () => {
  it("returns the URL when set as a non-empty string", () => {
    expect(
      getCanonicalBaseImageUrl(
        artist({ canonical_base_image_url: "https://v3b.fal.media/files/x.png" }),
      ),
    ).toBe("https://v3b.fal.media/files/x.png");
  });
  it("returns null when the field is missing", () => {
    expect(getCanonicalBaseImageUrl(artist({ face: "long" }))).toBeNull();
  });
  it("returns null when the field is explicitly null", () => {
    expect(
      getCanonicalBaseImageUrl(artist({ canonical_base_image_url: null })),
    ).toBeNull();
  });
  it("returns null when the field is an empty string", () => {
    expect(
      getCanonicalBaseImageUrl(artist({ canonical_base_image_url: "" })),
    ).toBeNull();
  });
  it("returns null when the profile is null / missing / non-object", () => {
    expect(getCanonicalBaseImageUrl(artist(null))).toBeNull();
    expect(getCanonicalBaseImageUrl(artist(undefined))).toBeNull();
    expect(getCanonicalBaseImageUrl(artist("not-an-object"))).toBeNull();
    expect(getCanonicalBaseImageUrl(artist([1, 2, 3]))).toBeNull();
  });
  it("returns null for null/undefined artist", () => {
    expect(getCanonicalBaseImageUrl(null)).toBeNull();
    expect(getCanonicalBaseImageUrl(undefined)).toBeNull();
  });
});
