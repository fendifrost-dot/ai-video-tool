/**
 * The MCP driver for splitting one storyboard box into two (see README.md).
 *
 * The page's "Split shot here" (BoxEditor → useStoryboardController → planSplit → writeBoxes) keeps the original row
 * as the first half (its id, key and footage) and inserts the second half as a new row with a new key, a copy of the
 * scene, the same lock, `origin: "split"` and a fresh shot_number (max + 1, a label, not an identity). No split
 * existed over the MCP, so a session that needed shorter edits would have had to rebuild those rows by hand. This
 * script computes the same writes with the app's own `planSplit`, so a split carried over the MCP is the split the
 * page would make.
 *
 *   npx tsx scripts/mcp/split.ts <rows.json> <c0NN> <atSeconds> <userId>
 *
 * `rows.json` holds the variation's `shots` rows (avt_select): the box to split as a full row, and every other row of
 * the variation with at least `spec_key` and `shot_number`, so the new key and number are free.
 *
 * Prints `UPDATE {tool, args}` for the first half (filtered on the row's `updated_at`, so a page edit made since is
 * never overwritten: it then matches nothing; read the rows again) and `INSERT {tool, args}` for the second half.
 * Footage stays on the first half, as on the page: put clips on the halves afterwards with `shot_asset_assignments`.
 * A box with timed events is refused here — the page divides them on the song clock (`splitEvents`), which this
 * script does not load; split such a box on the page.
 */
import { readFileSync } from "node:fs";
import { boxFromRow, planSplit, type BoxRow, type BoxWrite } from "@/lib/storyboard/boxes";

/** The columns a BoxWrite becomes, as `writeBoxes` (src/lib/queries/storyboard.ts) stores them. */
function columnsOf(write: BoxWrite, at: string): Record<string, unknown> {
  return { ...write, updated_at: at };
}

function main() {
  const [rowsFile, key, atArg, userId] = process.argv.slice(2);
  if (!rowsFile || !key || !atArg || !userId)
    throw new Error("usage: split.ts <rows.json> <c0NN> <atSeconds> <userId>");
  const at = Number(atArg);
  if (!Number.isFinite(at)) throw new Error(`${atArg}: not a time in seconds`);
  const rows = JSON.parse(readFileSync(rowsFile, "utf8")) as (BoxRow & Record<string, unknown>)[];
  const row = rows.find((r) => r.spec_key === key);
  if (!row) throw new Error(`no box ${key} in ${rowsFile}`);
  const box = boxFromRow(row);
  if (!box) throw new Error(`${key} is not a storyboard box`);
  if (box.spec.events.length)
    throw new Error(
      `${key} has ${box.spec.events.length} timed event(s); split it on the page, which divides them on the song clock`,
    );
  const keys = rows.map((r) => String(r.spec_key ?? "")).filter(Boolean);
  const now = new Date().toISOString();
  const { first, second } = planSplit(box, at, keys, now);
  const shotNumber = rows.reduce((m, r) => Math.max(m, Number(r.shot_number ?? 0)), 0) + 1;
  // the first half: only the columns the split changes
  const firstCols = columnsOf(first, now);
  const changed: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(firstCols))
    if (JSON.stringify(value) !== JSON.stringify(row[column] ?? null)) changed[column] = value;
  console.log(
    "UPDATE " +
      JSON.stringify({
        tool: "avt_update",
        args: {
          table: "shots",
          filters: [
            { column: "id", op: "eq", value: row.id },
            { column: "updated_at", op: "eq", value: row.updated_at },
          ],
          values: changed,
        },
      }),
  );
  console.log(
    "INSERT " +
      JSON.stringify({
        tool: "avt_insert",
        args: {
          table: "shots",
          rows: [
            {
              ...columnsOf(second, now),
              project_id: row.project_id,
              variation_id: row.variation_id,
              user_id: userId,
              shot_number: shotNumber,
              status: "planned",
            },
          ],
        },
      }),
  );
}

main();
