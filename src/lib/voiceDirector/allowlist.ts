/** Phase 1 Voice Director — read-only tools. Writes are Phase 2. */

export const PHASE1_READ_TOOLS = [
  "read_project",
  "read_shots",
  "read_song_analysis",
  "whats_next",
  "compile_prompt",
] as const;

export type Phase1ReadTool = (typeof PHASE1_READ_TOOLS)[number];

export const PHASE1_FORBIDDEN_TOOLS = [
  "create_shot",
  "update_shot",
  "delete_shot",
  "draft_treatment",
  "save_treatment_notes",
  "createGenerationJob",
] as const;

const PHASE1_SET = new Set<string>(PHASE1_READ_TOOLS);
const FORBIDDEN_SET = new Set<string>(PHASE1_FORBIDDEN_TOOLS);

export function isPhase1ReadTool(name: string): name is Phase1ReadTool {
  return PHASE1_SET.has(name);
}

export function isForbiddenDirectorTool(name: string): boolean {
  return FORBIDDEN_SET.has(name);
}

/** Client ignores any tool name the model invents. */
export function filterPhase1Tools(names: string[]): Phase1ReadTool[] {
  const seen = new Set<Phase1ReadTool>();
  const out: Phase1ReadTool[] = [];
  for (const name of names) {
    if (!isPhase1ReadTool(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
