/**
 * Lane G work-order identity. Prefer #51 over umbrella #50.
 *
 * Control plane is Lovable (https://aivideotool.lovable.app). This lane does
 * not invent standalone Supabase CLI / dashboard workflows.
 */

export const LANE_G_WORK_ORDER = {
  issue: 51,
  parentIssue: 50,
  title: "Lane G — AVT Pipeline / Product OS",
  preferredIssue: 51,
  owns: [
    "pipeline state machine",
    "job graph",
    "stage contracts",
    "status / artifact / provenance / failure / retry semantics",
    "plug-in interfaces for other lanes",
  ],
  doesNotOwn: [
    "Architecture C algorithms (chest / sleeve / topology)",
    "Grok generation internals",
    "proxy auth",
    "fendi-control-center",
    "evaluation metric implementations",
    "Astra / Premiere harness",
  ],
  chestEdgeFunction: "architecture-c-still-repair-proxy",
  chestClientEntrypoint: "src/lib/queries/architectureCStillRepair.ts",
  controlPlane: {
    app: "https://aivideotool.lovable.app",
    provider: "lovable",
    sql: "lovable_sql_editor",
    noStandaloneSupabase: true,
  },
} as const;

/**
 * This scaffolding is client-library + docs only. No merge-wait gate:
 * report deploy needs instead of blocking on GitHub merge.
 */
export const LANE_G_DEPLOY_NEEDS = {
  edgeRedeploy: [] as const,
  frontendPublish: false,
  lovableSql: false,
  reason:
    "Lane G added src/lib/pipeline contracts only. No edge function source, no product UI, no SQL. " +
    "Chest compute stays on existing architecture-c-still-repair-proxy — do not redeploy it from this lane. " +
    "Frontend Publish is not required until a later lane mounts a runner on these contracts.",
} as const;
