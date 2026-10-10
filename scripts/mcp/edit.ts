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
 * The stamp is the fingerprint of the treatment that stands now; it is read from `bundle/direction.json` when the
 * bundle has it, so the argument is only for a bundle fetched without it.
 *
 * `patch.json` holds override fields to set (direction, frame, cameraMotion, framing, transitionIn,
 * requiredElements, notes, shotType, events, continuity, cast). A field set to null is cleared. Fields the patch does
 * not name keep what the box already has; inside `continuity` (place, props, links, garments, outfit, production) the
 * same holds key by key. A field the patch changes is recorded as set by hand (`manual`), as the page records it.
 *
 * Prints `UPDATE {tool, args}` — the one `avt_update` to perform — and writes the new row into
 * `<workdir>/bundle/shots.json`, so the next `still.ts shot` reads the edited box without a re-bundle. It only prints
 * the columns that changed. The update is filtered on the row's `updated_at` as the bundle read it: if the page has
 * edited the box since, it matches no row — fetch the bundle again rather than overwrite that edit. After the update,
 * copy the row's new `updated_at` from the answer into the bundle.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyOverride,
  BLANK_OVERRIDE,
  boxFromRow,
  editedOverride,
  OVERRIDE_FIELDS,
  type BoxOverride,
  type BoxRow,
} from "@/lib/storyboard/boxes";
import { fingerprint, hasTreatment, parseTreatmentDoc } from "@/lib/treatment/treatmentDoc";

/** What a patch may set: the override's own fields, the cast, and the fields the editor writes beside them. */
const PATCH_FIELDS: readonly string[] = [...OVERRIDE_FIELDS, "cast"];

/** The fingerprint of the active video's treatment, when the bundle has it (still.ts bundle → direction.json). */
function treatmentStampOf(dir: string): string | undefined {
  const file = join(dir, "bundle", "direction.json");
  if (!existsSync(file)) return undefined;
  const rows = JSON.parse(readFileSync(file, "utf8")) as { treatment_json?: unknown }[];
  const doc = parseTreatmentDoc((Array.isArray(rows) ? rows[0] : rows)?.treatment_json as never);
  return hasTreatment(doc) ? fingerprint(doc.text) : undefined;
}

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
  // a key the override does not have would be stored, change nothing, and still lock the box
  const unknown = Object.keys(patch).filter((k) => !PATCH_FIELDS.includes(k));
  if (unknown.length)
    throw new Error(`${unknown.join(", ")}: not a field of a box's edit. The fields: ${PATCH_FIELDS.join(", ")}`);
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
  // a scene written by hand is written under the treatment that stands now: the page passes its fingerprint, and
  // applyOverride keeps it only when the scene itself changed. Without it the box goes on reading as written from an
  // older treatment.
  const standing = stamp || treatmentStampOf(dir);
  if (!standing)
    console.error(
      "NOTE no treatment to stamp the edit with: fetch bundle/direction.json (still.ts bundle) or pass the stamp",
    );
  const write = applyOverride(box, override, at, "edit", standing) as unknown as Record<
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
          // the row as the bundle read it: an edit made on the page since then is not overwritten — the update
          // matches nothing, and the bundle is fetched again
          filters: [
            { column: "id", op: "eq", value: row.id },
            { column: "updated_at", op: "eq", value: row.updated_at },
          ],
          values: changed,
        },
      }),
  );
}

main();
