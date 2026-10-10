/**
 * The MCP driver for the render contract (see README.md): what Review plays, written down outside the browser.
 *
 * The app's Export page builds `storyboard_timeline.json` from the storyboard's own timeline (`buildTimeline` →
 * `renderContract`), and `scripts/render/render_contract.py` turns that file into one MP4. Until now only the page
 * could build it, so an AI working through the MCP had no way to assemble the cut the board actually plays — it would
 * have to re-derive which media each shot shows, which is the second editorial truth the contract exists to prevent.
 * This runs the same two functions over the bundle.
 *
 *   npx tsx scripts/mcp/contract.ts <workdir> [<songIn> <songOut>]
 *
 * Reads `<workdir>/bundle/` as still.ts does (shots, assets, assignments, lyric_lines, entities, analysis, project)
 * plus two files this driver needs: `syncs.json` (the project's `performance_syncs` rows) and `song.json` (its newest
 * `project_assets` row of type `audio`). Writes `<workdir>/storyboard_timeline.json` and `<workdir>/media.need.json`
 * — every file the contract names, as `"<bucket>/<path>": null`, to be filled with a local path or a signed URL
 * (avt_signed_url) and passed to the renderer as `--media`. Prints what would stop or mark a render (renderReadiness).
 *
 * It decides nothing: a shot with nothing selected shows what `boxMedia` says it shows (the synced take, or nothing).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { boxesFromRows, type BoxRow } from "@/lib/storyboard/boxes";
import { buildTimeline, type MediaAsset } from "@/lib/storyboard/media";
import { eventClock } from "@/lib/storyboard/events";
import { renderContract, renderReadiness } from "@/lib/storyboard/renderContract";
import { assignmentFromRow, mediaAssetOf, syncFromRow, type AssignmentRow, type SyncRow } from "@/lib/queries/storyboard";
import { lyricLineFromRow } from "@/lib/lyrics/lyricsForShot";
import { aspectOfProject } from "@/lib/project/aspect";
import { entityFromRow } from "@/lib/continuity/entities";

function main() {
  const [dir, from, to] = process.argv.slice(2);
  if (!dir) throw new Error("usage: contract.ts <workdir> [<songIn> <songOut>]");
  const read = <T>(name: string, need = true): T => {
    const file = join(dir, "bundle", `${name}.json`);
    if (!existsSync(file)) {
      if (need) throw new Error(`the bundle has no ${name}.json`);
      return [] as unknown as T;
    }
    return JSON.parse(readFileSync(file, "utf8")) as T;
  };
  const project = read<Record<string, unknown> | Record<string, unknown>[]>("project");
  const boxes = boxesFromRows(read<BoxRow[]>("shots"));
  const assets = new Map<string, MediaAsset>(read<never[]>("assets").map((a) => { const m = mediaAssetOf(a); return [m.id, m] as const; }));
  const assignments = read<AssignmentRow[]>("assignments").map(assignmentFromRow);
  const syncs = read<SyncRow[]>("syncs").map(syncFromRow).filter((s): s is NonNullable<typeof s> => !!s);
  const songRow = read<Record<string, unknown>[]>("song")[0] ?? null;
  const analysis = read<Record<string, unknown>[]>("analysis", false)[0] ?? null;
  const lyricLines = read<never[]>("lyric_lines", false).map(lyricLineFromRow);
  const entities = read<never[]>("entities", false).map(entityFromRow).filter(Boolean);
  const clock = eventClock(lyricLines, (analysis?.beat_map_json as { t: number }[] | undefined) ?? null, entities as never);

  const range = from !== undefined && to !== undefined ? { songIn: Number(from), songOut: Number(to) } : null;
  if (range && !(Number.isFinite(range.songIn) && Number.isFinite(range.songOut) && range.songOut > range.songIn))
    throw new Error("songIn and songOut are seconds on the song, songOut after songIn");
  const contract = renderContract({
    timeline: buildTimeline({ boxes, assignments, assets, syncs, clock }),
    assets,
    song: songRow ? { assetId: String(songRow.id), bucket: "project-audio", path: String(songRow.file_url) } : null,
    aspect: aspectOfProject((Array.isArray(project) ? project[0] : project) as never),
    range,
  });
  writeFileSync(join(dir, "storyboard_timeline.json"), JSON.stringify(contract, null, 1));

  const need: Record<string, null> = {};
  if (contract.audio) need[`${contract.audio.bucket}/${contract.audio.path}`] = null;
  for (const s of contract.segments) if (s.media.kind !== "none") need[`${s.media.bucket}/${s.media.path}`] = null;
  writeFileSync(join(dir, "media.need.json"), JSON.stringify(need, null, 1));

  const ready = renderReadiness(contract);
  for (const s of contract.segments)
    console.log(`${String(s.index).padStart(3)} ${s.key} ${s.frame_in}-${s.frame_out} ${s.media.kind}${s.media.kind === "video" ? ` ${s.media.role}${s.media.base_layer ? " (the take: nothing selected)" : ""}` : s.media.kind === "image" ? " (held image)" : ""}`);
  console.log("DONE " + JSON.stringify({ frames: contract.frames, fps: contract.fps, segments: contract.segments.length, files: Object.keys(need).length, ...ready }));
}

main();
