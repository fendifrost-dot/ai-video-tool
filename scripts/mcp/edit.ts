/**
 * The MCP driver for a director's edit of one storyboard box (see README.md).
 *
 * A box's row holds three JSON columns that must agree: `generated_json` (what the writer wrote), `override_json`
 * (what the director changed) and `spec_json`, which every downstream reader uses and which is DERIVED from the
 * other two. Writing `override_json` alone through `avt_update` leaves `spec_json` — and the legacy text columns —
 * stale; that happened by hand on 9 Oct 2026. This script computes the write with the app's own `applyOverride`,
 * so an edit carried over the MCP is the same write the page would make.
 *
 *   npx tsx scripts/mcp/edit.ts <workdir> <c0NN> <patch.json> [<treatmentStamp>]
 *
 * `patch.json` holds override fields to set (direction, frame, cameraMotion, framing, transitionIn,
 * requiredElements, notes, shotType, events, continuity, cast). A field set to null is cleared. Fields the patch does
 * not name keep what the box already has; inside `continuity` (place, props, links, garments, outfit, production) the
 * same holds key by key. A field the patch changes is recorded as set by hand (`manual`), as the page records it.
 *
 * Prints `UPDATE {tool, args}` — the one `avt_update` to perform — and writes the new row into
 * `<workdir>/bundle/shots.json`, so the next `still.ts shot` reads the edited box without a re-bundle. It only prints
 * the columns that changed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyOverride,
  BLANK_OVERRIDE,
  boxFromRow,
  editedOverride,
  type BoxOverride,
  type BoxRow,
} from "@/lib/storyboard/boxes";

function main() {
  const [dir, key, patchFile, stamp] = process.argv.slice(2);
  if (!dir || !key || !patchFile)
    throw new Error("usage: edit.ts <workdir> <c0NN> <patch.json> [<treatmentStamp>]");
  const shotsFile = join(dir, "bundle", "shots.json");
  const rows = JSON.parse(readFileSync(shotsFile, "utf8")) as (BoxRow & Record<string, unknown>)[];
  const index = rows.findIndex((r) => r.spec_key === key);
  if (index < 0) throw new Error(`no box ${key} in the bundle`);
  const row = rows[index];
  const box = boxFromRow(row);
  if (!box) throw new Error(`${key} is not a storyboard box`);
  const patch = JSON.parse(readFileSync(patchFile, "utf8")) as Record<string, unknown>;
  const prev = box.override ?? null;
  // continuity is a bag of separate choices (place, props, links, pieces, outfit, method), and so is the cast: a patch
  // sets the keys it names and keeps the rest, as the page's saveContinuity and saveCast do
  const continuity =
    patch.continuity && typeof patch.continuity === "object"
      ? { continuity: { ...(prev?.continuity ?? {}), ...(patch.continuity as object) } }
      : {};
  const cast =
    patch.cast && typeof patch.cast === "object"
      ? { cast: { ...(prev?.cast ?? {}), ...(patch.cast as object) } }
      : {};
  const next = { ...(prev ?? BLANK_OVERRIDE), ...patch, ...continuity, ...cast } as BoxOverride;
  // which fields are the director's is decided as the page decides it (a changed field becomes his)
  const override = editedOverride(prev, next);
  const at = new Date().toISOString();
  const write = applyOverride(box, override, at, "edit", stamp || undefined) as unknown as Record<
    string,
    unknown
  >;
  // applyOverride locks an edited box, as the page does; `locked` is printed only when that changes the row
  const changed: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(write))
    if (JSON.stringify(value) !== JSON.stringify(row[column] ?? null)) changed[column] = value;
  rows[index] = { ...row, ...write, updated_at: at };
  writeFileSync(shotsFile, JSON.stringify(rows, null, 1));
  writeFileSync(join(dir, `edit-${key}.json`), JSON.stringify(changed, null, 1));
  console.log(
    "UPDATE " +
      JSON.stringify({
        tool: "avt_update",
        args: {
          table: "shots",
          filters: [{ column: "id", op: "eq", value: row.id }],
          values: changed,
        },
      }),
  );
}

main();
