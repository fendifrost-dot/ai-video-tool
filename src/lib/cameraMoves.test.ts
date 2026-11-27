import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAMERA_MOVE_COUNT,
  CAMERA_MOVES,
  FAL_SEEDANCE_WITHOUT_REFERENCE_VIDEO,
  buildCameraPrompt,
  estimateMotion,
  getMove,
  listMoves,
  matchMoves,
  planCameraMove,
  previewSegments,
  runCameraMoveTool,
  type GrayFrame,
} from "@/lib/cameraMoves";

function frame(width: number, height: number, paint: (x: number, y: number) => number): GrayFrame {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = paint(x, y);
  }
  return { width, height, data };
}

describe("camera-move library", () => {
  it("ports the 137 MIT moves once each", () => {
    expect(CAMERA_MOVE_COUNT).toBe(137);
    expect(new Set(CAMERA_MOVES.map((move) => move.id)).size).toBe(137);
    const orbit = getMove("CAM06-Orbit");
    expect(orbit?.name).toBe("Orbit");
    expect(orbit?.kind).toBe("orbit");
    expect(orbit?.durationSec).toBeGreaterThan(5);
    expect(orbit?.pillSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(listMoves({ query: "whip pan" }).some((move) => move.id === "CAM13-WhipPan")).toBe(true);
  });

  it("draws a blockout frame for a move", () => {
    const segments = previewSegments("orbit", 0.4, "Orbit", 160, 90);
    expect(segments.length).toBeGreaterThan(10);
  });

  it("writes the five-part prompt as an environment plate", () => {
    const move = getMove("CAM06-Orbit");
    expect(move).toBeTruthy();
    const prompt = buildCameraPrompt({ move: move!, place: "a wet night street" });
    expect(prompt.ok).toBe(true);
    if (!prompt.ok) return;
    expect(prompt.mode).toBe("environment");
    expect(prompt.text).toContain("【Generation Goal】");
    expect(prompt.text).toContain("【Reference Asset Roles】");
    expect(prompt.text).toContain("【Subjects and Relationships】");
    expect(prompt.text).toContain("【Camera and Event Script】");
    expect(prompt.text).toContain("【Maintain Consistency】");
    expect(prompt.text).toContain("@Video1");
    expect(prompt.text).toContain("No person, face, mouth, or body is generated.");
    expect(prompt.text).not.toContain("Edit @Video1");
    expect(prompt.text).not.toMatch(/lip-sync/i);
    const empty = buildCameraPrompt({ move: move!, place: "  " });
    expect(empty.ok).toBe(false);
  });

  it("keeps a performance plate free of his face and gates a non-performance redraw", () => {
    const move = getMove("CAM03-PushIn")!;
    const plate = buildCameraPrompt({
      move,
      place: "the kitchen",
      mode: "performance_plate",
      faceImage: true,
    });
    expect(plate.ok).toBe(true);
    if (!plate.ok) return;
    expect(plate.text).toContain("original footage");
    expect(plate.warnings.some((line) => line.includes("face photo"))).toBe(true);
    const missing = buildCameraPrompt({ move, place: "the kitchen", mode: "non_performance" });
    expect(missing.ok).toBe(false);
    const redraw = buildCameraPrompt({
      move,
      place: "the kitchen",
      mode: "non_performance",
      likeness: "put_back",
    });
    expect(redraw.ok).toBe(true);
    if (!redraw.ok) return;
    expect(redraw.text).toContain("mouth stays closed");
    expect(redraw.text).toContain("original face pixels");
  });

  it("plans fal reference-to-video and does not submit", () => {
    const move = getMove("CAM06-Orbit")!;
    const plan = planCameraMove({
      move,
      place: "a plaza at dusk",
      videoUrl: "https://cdn.example/pill.mp4",
    });
    expect("submitted" in plan).toBe(true);
    if (!("submitted" in plan)) return;
    expect(plan.submitted).toBe(false);
    expect(plan.spendUsd).toBe(0);
    expect(plan.endpoint).toBe("bytedance/seedance-2.5/reference-to-video");
    expect(plan.falInput.video_urls).toEqual(["https://cdn.example/pill.mp4"]);
    expect(plan.falInput.generate_audio).toBe(false);
    expect(plan.falInput.task).toBe("reference");
    expect(plan.controlCenter.action).toBe("fal-run");
    expect(plan.controlCenter.submit).toBe(false);
    expect(plan.ready).toBe(true);
    const bare = planCameraMove({ move, place: "a plaza at dusk" });
    if (!("ready" in bare)) throw new Error("expected a plan");
    expect(bare.ready).toBe(false);
    expect(bare.falInput.video_urls).toEqual([]);
    const refused = planCameraMove({
      move,
      place: "a plaza",
      endpoint: "bytedance/seedance-2.5/text-to-video",
    });
    expect("ok" in refused && refused.ok === false).toBe(true);
    expect(FAL_SEEDANCE_WITHOUT_REFERENCE_VIDEO.map((item) => item.id)).toContain(
      "bytedance/seedance-2.5/image-to-video",
    );
  });

  it("does not call fetch from the planner", () => {
    const source = readFileSync(resolve("supabase/functions/_shared/cameraMoves/fal.ts"), "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });

  it("imports the catalog as a TypeScript module so avt-mcp loads on the edge runtime", () => {
    // Deno needs an import attribute for a JSON module, and nothing proves the edge deploy ships a .json file from
    // _shared; either would take every MCP tool down at load. catalog.data.ts is generated from catalog.json by
    // scripts/camera-moves/extract_catalog.py; src/lib/alter.test.ts pins that the two are equal.
    const source = readFileSync(
      resolve("supabase/functions/_shared/cameraMoves/catalog.ts"),
      "utf8",
    );
    expect(source).toContain('import raw from "./catalog.data.ts";');
    expect(source).not.toContain(".json");
  });

  it("ranks a pan above a crane and reads a rightward yaw from frames", () => {
    const pan = matchMoves(
      { pan: 0.9, tilt: 0, dolly: 0, zoom: 0, rise: 0, orbit: 0, roll: 0, shake: 0, lateral: 0 },
      8,
    );
    expect(pan[0]?.kind).toBe("pan");
    const crane = matchMoves(
      { pan: 0, tilt: 0.2, dolly: 0, zoom: 0, rise: 0.9, orbit: 0, roll: 0, shake: 0, lateral: 0 },
      5,
    );
    expect(crane.some((match) => match.kind === "crane")).toBe(true);
    expect(crane[0]?.score).toBeGreaterThan(
      pan.find((match) => match.kind === "crane")?.score ?? 0,
    );

    const frames: GrayFrame[] = [];
    for (let step = 0; step < 4; step++) {
      frames.push(
        frame(32, 32, (x, y) =>
          x > 20 - step * 3 && x < 26 - step * 3 && y > 12 && y < 20 ? 255 : 10,
        ),
      );
    }
    const motion = estimateMotion(frames);
    expect(motion.pan).toBeGreaterThan(0.2);
  });

  it("answers the MCP tools without a provider call", () => {
    const listed = runCameraMoveTool("avt_camera_move_list", { query: "dolly zoom", limit: 5 });
    expect(listed.ok).toBe(true);
    const planned = runCameraMoveTool("avt_camera_move_plan", {
      id: "CAM05-DollyZoom",
      place: "an empty stage",
      mode: "environment",
      video_url: "http://insecure.example/pill.mp4",
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const plan = planned.value as {
      submitted: boolean;
      ready: boolean;
      falInput: { video_urls: string[] };
    };
    expect(plan.submitted).toBe(false);
    expect(plan.ready).toBe(false);
    expect(plan.falInput.video_urls).toEqual([]);
  });
});
