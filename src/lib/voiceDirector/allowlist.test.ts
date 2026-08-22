import { describe, expect, it } from "vitest";
import {
  filterPhase1Tools,
  isForbiddenDirectorTool,
  isPhase1ReadTool,
} from "./allowlist";

describe("voice director allowlist", () => {
  it("accepts only Phase 1 read tools", () => {
    expect(isPhase1ReadTool("whats_next")).toBe(true);
    expect(isPhase1ReadTool("create_shot")).toBe(false);
    expect(isForbiddenDirectorTool("draft_treatment")).toBe(true);
    expect(isForbiddenDirectorTool("whats_next")).toBe(false);
  });

  it("drops invented and write tools", () => {
    expect(
      filterPhase1Tools(["whats_next", "create_shot", "read_shots", "whats_next", "explode"]),
    ).toEqual(["whats_next", "read_shots"]);
  });
});
