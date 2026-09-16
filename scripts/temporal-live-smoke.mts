/**
 * $0 temporal live smoke — existing synthetic luma fixture only.
 * No V3 / paid Grok / Fal / Control Center. Does not redeploy still-repair.
 *
 * Auth: set AVT_USER_ACCESS_TOKEN to a signed-in AVT owner JWT.
 * Anon/publishable POST is 401 unauthenticated (auth not widened).
 *
 * Usage:
 *   npx tsx scripts/temporal-live-smoke.mts
 *   AVT_USER_ACCESS_TOKEN='<owner JWT>' npx tsx scripts/temporal-live-smoke.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHeroFrameTemporalPropagateBody } from "../src/lib/heroFrame/temporalDispatch";
import {
  TEMPORAL_LIVE_SMOKE_LINEAGE,
  TEMPORAL_PROPAGATE_PROXY_PATH,
  buildTemporalLiveSmokeBody,
  summarizeTemporalLiveSmokeBody,
} from "../src/lib/temporal/liveSmoke";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = process.env.TEMPORAL_SMOKE_OUT_DIR ?? `${ROOT}/docs/temporal/live-smoke`;
const URL_BASE =
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "https://qoyxgnkvjukovkrvdaiq.supabase.co";
const EDGE = `${URL_BASE.replace(/\/$/, "")}${TEMPORAL_PROPAGATE_PROXY_PATH}`;
const TOKEN = process.env.AVT_USER_ACCESS_TOKEN ?? process.env.AVT_ACCESS_TOKEN ?? "";

const ANON =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

mkdirSync(OUT_DIR, { recursive: true });

const smokeBody = buildTemporalLiveSmokeBody();
const productBody = buildHeroFrameTemporalPropagateBody({ clip: smokeBody.clip! });
const summary = summarizeTemporalLiveSmokeBody(smokeBody);

writeFileSync(`${OUT_DIR}/expected-body-summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(
  `${OUT_DIR}/expected-product-body-summary.json`,
  `${JSON.stringify({ explicitArm: productBody.explicitArm, clipId: productBody.clip?.id, frameCount: productBody.clip?.frames?.length }, null, 2)}\n`,
);

async function timedFetch(
  label: string,
  init: RequestInit,
  url = EDGE,
): Promise<{ label: string; http: number; ms: number; body: unknown }> {
  const started = Date.now();
  const resp = await fetch(url, init);
  const ms = Date.now() - started;
  const text = await resp.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep raw */
  }
  return { label, http: resp.status, ms, body };
}

const probes: Record<string, unknown>[] = [];

const options = await timedFetch("OPTIONS", {
  method: "OPTIONS",
  headers: {
    Origin: "https://aivideotool.lovable.app",
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "authorization,content-type",
  },
});
probes.push(options);

if (ANON) {
  probes.push(
    await timedFetch("ANON_POST", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ANON}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        explicitArm: true,
        clip: { id: "probe", fps: 24, frames: [{ index: 0, width: 1, height: 1, luma: [0] }] },
      }),
    }),
  );
}

const report = {
  edge: EDGE,
  lineage: TEMPORAL_LIVE_SMOKE_LINEAGE,
  summary,
  probes,
  jwtPresent: TOKEN.length > 0,
  livePost: null as null | Record<string, unknown>,
  verdict: "BLOCKED_NO_USER_JWT",
};

if (!TOKEN) {
  writeFileSync(`${OUT_DIR}/probe.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        verdict: "BLOCKED_NO_USER_JWT",
        edge: EDGE,
        probes: probes.map((p) => ({ label: p.label, http: p.http, ms: p.ms, body: p.body })),
        explicitArm: true,
        lineage: {
          chest: TEMPORAL_LIVE_SMOKE_LINEAGE.chestAssetId,
          sleeve: TEMPORAL_LIVE_SMOKE_LINEAGE.sleeveAssetId,
          still: TEMPORAL_LIVE_SMOKE_LINEAGE.stillAssetId,
          project: TEMPORAL_LIVE_SMOKE_LINEAGE.projectId,
        },
        next: "AVT_USER_ACCESS_TOKEN='<owner JWT>' npx tsx scripts/temporal-live-smoke.mts",
      },
      null,
      2,
    ),
  );
  process.exit(2);
}

const live = await timedFetch("OWNER_JWT_POST", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(smokeBody),
});

const liveBody = live.body as Record<string, unknown>;
const jobs = Array.isArray(liveBody.jobs) ? liveBody.jobs : [];
const kinds = jobs.map((job) =>
  job && typeof job === "object" && "kind" in job ? (job as { kind: string }).kind : "?",
);
const paidCalls = liveBody.paidCalls === false;
const grokPerFrame = liveBody.grokPerFrame === false;
const ok = live.http === 200 && liveBody.ok === true && paidCalls && grokPerFrame;
report.livePost = {
  http: live.http,
  ms: live.ms,
  ok: liveBody.ok ?? null,
  paidCalls: liveBody.paidCalls ?? null,
  grokPerFrame: liveBody.grokPerFrame ?? null,
  provider: liveBody.provider ?? null,
  jobKinds: kinds,
};
report.verdict = ok ? "LIVE_SMOKE_OK" : "LIVE_SMOKE_FAILED";
writeFileSync(`${OUT_DIR}/probe.json`, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(`${OUT_DIR}/live-response.json`, `${JSON.stringify(live.body, null, 2)}\n`);

console.log(JSON.stringify({ verdict: report.verdict, livePost: report.livePost }, null, 2));
if (!ok) process.exit(1);
