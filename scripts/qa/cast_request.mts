/**
 * CAST REQUEST — print the request a provider WOULD receive for a cast shot, and submit nothing.
 *
 *     npx tsx scripts/qa/cast_request.mts              # a worked example, no network
 *     npx tsx scripts/qa/cast_request.mts --live <projectId>   # this project's real cast, read-only
 *
 * Everything that decides anything here is imported from the shipped modules — `entityFromRow`,
 * `ShotSpecSchema`, `resolveCast`, `castProblems`, `castSource`, `castRouteCheck`, `boxShot`. This
 * file only hands them the rows the app would have, so a line printed here is a line the app
 * produces. There is no second implementation to drift.
 *
 * It never writes and never generates. `--live` issues one read against `continuity_entities` with
 * the publishable key; until the cast migration is applied it will simply find no characters, and
 * says so rather than pretending.
 */
import { readFileSync } from "node:fs";
import { entityFromRow, indexEntities, type EntityRow } from "../../src/lib/continuity/entities";
import { castProblems, castRouteCheck, castSource, resolveCast } from "../../src/lib/casting/cast";
import { ShotSpecSchema } from "../../src/lib/treatment/shotSpec";
import { boxFromRow, boxWrite, type BoxRow } from "../../src/lib/storyboard/boxes";
import { boxShot } from "../../src/lib/storyboard/generate";

const SUPABASE_URL = process.env.AVT_SUPABASE_URL ?? "https://qoyxgnkvjukovkrvdaiq.supabase.co";

const row = (over: Partial<EntityRow> & { key: string }): EntityRow => ({
  id: `id-${over.key}`,
  project_id: "proj",
  variation_id: "var-1",
  kind: "character",
  name: over.key,
  description: null,
  constraints: null,
  approved_asset_id: null,
  reference_asset_ids: null,
  archived: false,
  created_at: "t",
  updated_at: "t",
  ...over,
});

/** The worked example: the artist, a recurring character with a reference, and one with none. */
const FIXTURE: EntityRow[] = [
  row({
    key: "FENDI", name: "Fendi", description: "The artist, as himself.",
    cast_role: "primary_artist", identity_mode: "preserve", artist_id: "artist-1",
    approved_asset_id: "asset-fendi-face",
  }),
  row({
    key: "DRIVER", name: "The driver", description: "Older man in a grey suit.",
    constraints: "Never smiles.", cast_role: "recurring", identity_mode: "recurring",
    approved_asset_id: "asset-driver",
  }),
  row({ key: "GUEST", name: "The guest", cast_role: "recurring", identity_mode: "preserve" }),
];

async function liveRows(projectId: string): Promise<EntityRow[]> {
  const key = process.env.AVT_ANON_KEY ?? readEnvKey();
  const url = `${SUPABASE_URL}/rest/v1/continuity_entities?project_id=eq.${projectId}&kind=eq.character&select=*`;
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`read failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as EntityRow[];
}

function readEnvKey(): string {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    if (line.startsWith("VITE_SUPABASE_PUBLISHABLE_KEY")) return line.split("=")[1]!.trim().replace(/^"|"$/g, "");
  }
  throw new Error("no key: set AVT_ANON_KEY or keep VITE_SUPABASE_PUBLISHABLE_KEY in .env");
}

function makeBox(spec: Record<string, unknown>) {
  const w = boxWrite({
    key: "c001", start: 0, end: 4, section: "verse",
    generated: ShotSpecSchema.parse({ id: "c001", purpose: "the car arrives at the venue", timeline: { start: 0, end: 4 }, ...spec }),
    override: null, locked: false, origin: "treatment", history: [],
  });
  return boxFromRow({ id: "r1", project_id: "p", shot_number: 1, ...w, updated_at: "t" } as BoxRow)!;
}

const rule = (t: string) => console.log(`\n${"─".repeat(78)}\n${t}\n${"─".repeat(78)}`);

async function main() {
  const liveAt = process.argv.indexOf("--live");
  const rows = liveAt >= 0 ? await liveRows(process.argv[liveAt + 1]!) : FIXTURE;

  rule(liveAt >= 0 ? "THIS PROJECT'S CAST (read-only)" : "CAST (worked example — no network)");
  if (rows.length === 0) {
    console.log("No characters. Either none have been cast, or 20261007170000_cast_members.sql is not applied yet.");
    return;
  }
  const entities = rows.map(entityFromRow).filter((e): e is NonNullable<typeof e> => !!e);
  for (const e of entities) {
    console.log(`  ${e.key.padEnd(10)} ${e.name.padEnd(14)} ${e.cast?.role.padEnd(15)} ${e.cast?.identityMode.padEnd(10)}` +
      `${e.cast?.artistId ? " → artist " + e.cast.artistId : ""}${e.approvedAssetId ? " · ref " + e.approvedAssetId : " · NO REFERENCE"}`);
  }

  const index = indexEntities(entities);
  const keys = entities.map((e) => e.key);

  // A cutaway that casts the first two people, each with this shot's own direction.
  const box = makeBox({
    shotType: "b_roll", kind: "broll",
    cast: {
      members: [
        { key: keys[0], action: "steps out of the car", placement: "foreground left", framing: "waist up" },
        ...(keys[1] ? [{ key: keys[1], action: "holds the door", placement: "behind him" }] : []),
      ],
    },
  });
  const cast = resolveCast(box.spec, index);

  rule("BEFORE GENERATION — what the director is told");
  const problems = castProblems(cast);
  if (!problems.length) console.log("  nothing outstanding.");
  for (const p of problems) console.log(`  [${p.level.toUpperCase()}] ${p.text}.\n           fix: ${p.fix}.`);

  rule("THE REQUEST (built, NOT submitted)");
  const shot = boxShot(box, [], { cast });
  console.log(shot.prompt);

  const source = castSource(cast);
  rule("IDENTITY REFERENCES THE ROUTE SHOULD ATTACH");
  console.log(`  project_assets: ${source.referenceAssetIds.join(", ") || "(none)"}`);
  console.log(`  artists:        ${source.artistIds.join(", ") || "(none)"}`);

  rule("PER ROUTE — what each provider will and will not honour");
  for (const cap of [
    { provider: "runway", supportsReferenceImage: true },
    { provider: "veo", supportsReferenceImage: false },
  ]) {
    const check = castRouteCheck(source, cap);
    console.log(`  ${cap.provider}: ${check.dropped ? "DROPS " + check.dropped.assetIds.length + " reference(s) — " + check.dropped.reason : "carries every reference"}`);
    for (const w of check.warnings) console.log(`      ! ${w}`);
  }

  rule("A PERFORMANCE SHOT OF THE SAME CAST — the plate stays empty");
  const plate = makeBox({ shotType: "performance", kind: "performance", cast: box.spec.cast });
  const platePrompt = boxShot(plate, [], { cast: resolveCast(plate.spec, index) }).prompt;
  console.log(`  mentions a cast member: ${entities.some((e) => platePrompt.includes(e.name)) ? "YES — BUG" : "no (correct: the plate is the place, drawn empty)"}`);

  console.log("\nNothing was submitted and nothing was written.\n");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
