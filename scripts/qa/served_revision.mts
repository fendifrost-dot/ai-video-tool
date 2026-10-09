/**
 * SERVED REVISION — what the live site is ACTUALLY running, proved from its own bytes.
 *
 *     npx tsx scripts/qa/served_revision.mts --marker "some string only the new code contains"
 *     npx tsx scripts/qa/served_revision.mts --url https://aivideotool.lovable.app --marker A --marker B
 *
 * WHY THIS EXISTS (9 Oct 2026)
 *   Lovable reports a deployment's SHA, `ready` and `is_published=true`. None of those prove which revision a
 *   browser is served — they describe the deployment record, not the bytes behind the CDN. The only honest
 *   check is to fetch what the site serves and look for something that exists solely in the revision you mean.
 *
 * HOW, AND THE TRAP IT AVOIDS
 *   The entry HTML lists only the entry chunks; routes are lazy-loaded, so a string can be absent from every
 *   chunk the HTML names and still be deployed. Checking a handful of chunks and concluding "absent" is wrong —
 *   that mistake was made and caught on the day this was written. So this discovers every chunk the entry
 *   bundle references and searches all of them.
 *
 *   A marker must be a STRING LITERAL from the source: minifiers rename identifiers but do not rewrite string
 *   contents. A class name in JSX (`max-w-[38vw]`) survives too. A generic word ("provenance") is not a marker —
 *   it will match code that predates the change and tell you nothing.
 *
 * Read-only: it fetches public assets and prints. It never deploys, publishes or writes.
 */
const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : null;
};
const all = (name: string): string[] =>
  args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]!] : []));

const base = (flag("url") ?? "https://aivideotool.lovable.app").replace(/\/$/, "");
const markers = all("marker");
if (!markers.length) {
  console.error('usage: --marker "a string only the new revision contains" [--marker ...] [--url <site>]');
  process.exit(2);
}

const get = async (url: string): Promise<string> => {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.text()).replace(/\0/g, "");
};

const html = await get(base + "/");
const entries = [...new Set([...html.matchAll(/\/assets\/[A-Za-z0-9._-]+\.js/g)].map((m) => m[0]))];
if (!entries.length) {
  console.error(`no /assets/*.js referenced by ${base} — is it behind a sign-in wall that returns no app shell?`);
  process.exit(1);
}

// every chunk the entry bundles reference, not just the ones the HTML names
const chunks = new Set(entries);
for (const e of entries) {
  const src = await get(base + e);
  for (const m of src.matchAll(/[A-Za-z0-9._-]+-[A-Za-z0-9_-]{8}\.js/g)) chunks.add(`/assets/${m[0]}`);
}

console.log(`${base} — ${chunks.size} chunk(s) reachable from ${entries.length} entry bundle(s)\n`);

const bodies = new Map<string, string>();
await Promise.all(
  [...chunks].map(async (c) => {
    try {
      bodies.set(c, await get(base + c));
    } catch {
      /* a referenced chunk that 404s is not a marker failure; it is reported by its absence below */
    }
  }),
);
console.log(`fetched ${bodies.size} of ${chunks.size}\n`);

let missing = 0;
for (const marker of markers) {
  const hits = [...bodies].filter(([, b]) => b.includes(marker)).map(([c]) => c);
  if (hits.length) console.log(`  SERVED   ${JSON.stringify(marker)}\n           in ${hits.slice(0, 3).join(", ")}${hits.length > 3 ? ` (+${hits.length - 3})` : ""}`);
  else {
    missing++;
    console.log(`  ABSENT   ${JSON.stringify(marker)}`);
  }
}
console.log(
  `\n${markers.length - missing}/${markers.length} marker(s) served.` +
    (missing ? " An absent marker means that revision is NOT live — or the marker is not a literal in the shipped bundle." : ""),
);
process.exit(missing ? 1 : 0);
