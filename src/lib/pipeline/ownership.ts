/**
 * Lane G work-order identity.
 *
 * Prefer #77 (Pipeline OS Chest Integration) over scaffolding #51 / umbrella #50.
 *
 * Control plane is Lovable (https://aivideotool.lovable.app). This lane does
 * not invent standalone Supabase CLI / dashboard workflows.
 */

export const LANE_G_WORK_ORDER = {
  issue: 77,
  parentIssue: 50,
  lineageIssue: 51,
  title: "Lane G — Pipeline OS Chest Integration",
  preferredIssue: 77,
  owns: [
    "pipeline state machine",
    "job graph",
    "stage contracts",
    "status / artifact / provenance / failure / retry semantics",
    "plug-in interfaces for other lanes",
    "chest stage adapter that calls callArchitectureCStillRepair (logo_chest)",
    "sleeve + temporal stub hooks",
  ],
  doesNotOwn: [
    "Architecture C algorithms (chest / sleeve / topology)",
    "Grok generation internals",
    "proxy auth",
    "fendi-control-center",
    "evaluation metric implementations",
    "Astra / Premiere harness",
    "sleevePanel paint (Lane B)",
    "temporal propagation engine (Lane C)",
  ],
  chestEdgeFunction: "architecture-c-still-repair-proxy",
  chestClientEntrypoint: "src/lib/queries/architectureCStillRepair.ts",
  chestClientCall: "callArchitectureCStillRepair({ stage: 'logo_chest' })",
  chestReferenceAssetId: "9ed83c01-8c7d-4d1b-918f-87b0fc743c50",
  chestRepairMethodVersion: "architecture_c_still_repair_1m",
  chestGate: "CLEARED",
  chestScore: "11/11",
  controlPlane: {
    app: "https://aivideotool.lovable.app",
    provider: "lovable",
    sql: "lovable_sql_editor",
    noStandaloneSupabase: true,
  },
} as const;

/**
 * Client-library + docs only. No merge-wait gate: report deploy needs instead
 * of blocking on GitHub merge. Chest compute already live (PR #73); this lane
 * does not redeploy the proxy.
 */
export const LANE_G_DEPLOY_NEEDS = {
  edgeRedeploy: [] as const,
  frontendPublish: false,
  lovableSql: false,
  reason:
    "Lane G chest integration is src/lib/pipeline adapters + docs. No edge function source, " +
    "no product UI, no SQL. Chest compute stays on existing architecture-c-still-repair-proxy " +
    "(already serving architecture_c_still_repair_1m / 9ed83c01). Do not redeploy it from this lane. " +
    "Frontend Publish is not required until a later lane mounts a runner on these contracts.",
} as const;
