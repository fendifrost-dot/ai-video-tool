export type DirectorShotBrief = {
  shot_number: number;
  song_section: string | null;
  scene_description: string | null;
  duration_seconds: number | null;
  shot_type: string | null;
  status: string | null;
};

export type DirectorSection = {
  name: string;
};

export type WhatsNextInput = {
  hasTreatment: boolean;
  hasAnalysis: boolean;
  sections: DirectorSection[];
  shots: DirectorShotBrief[];
};

export type WhatsNextResult = {
  toolsUsed: Array<"read_project" | "read_shots" | "read_song_analysis" | "whats_next">;
  gaps: string[];
  options: string[];
  summary: string;
};

function normSection(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

function sectionLabel(name: string): string {
  return name.trim() || "untitled section";
}

/**
 * Deterministic coverage gaps. Does not invent BPM, drop times, or shots.
 */
export function computeWhatsNext(input: WhatsNextInput): WhatsNextResult {
  const gaps: string[] = [];
  const toolsUsed: WhatsNextResult["toolsUsed"] = ["read_project", "read_shots", "whats_next"];

  if (input.hasAnalysis) toolsUsed.splice(2, 0, "read_song_analysis");

  if (!input.hasTreatment) {
    gaps.push("No treatment draft yet — open Treatment when you want one written (not from voice in Phase 1).");
  }
  if (!input.hasAnalysis) {
    gaps.push("No song analysis — I will not invent BPM or drop times.");
  }
  if (input.shots.length === 0) {
    gaps.push("Shot list is empty.");
  }

  const shotsBySection = new Map<string, number>();
  for (const shot of input.shots) {
    const key = shot.song_section ? normSection(shot.song_section) : "";
    if (!key) continue;
    shotsBySection.set(key, (shotsBySection.get(key) ?? 0) + 1);
  }

  const uncovered: string[] = [];
  for (const section of input.sections) {
    const key = normSection(section.name);
    if (!key) continue;
    if ((shotsBySection.get(key) ?? 0) === 0) {
      uncovered.push(sectionLabel(section.name));
    }
  }
  if (uncovered.length > 0) {
    gaps.push(`No shots on: ${uncovered.join(", ")}.`);
  }

  const unsectioned = input.shots.filter((s) => !s.song_section?.trim()).length;
  if (unsectioned > 0) {
    gaps.push(`${unsectioned} shot(s) have no song section.`);
  }

  const options: string[] = [];
  if (input.shots.length === 0) {
    options.push("Start with a wide performance in verse 1.");
    options.push("Lock a jacket CU for the first hook.");
    options.push("Add one establishing shot before verse 1.");
  } else {
    for (const name of uncovered) {
      if (options.length >= 3) break;
      options.push(`Cover ${name} — one performance + one detail.`);
    }
    if (options.length < 3 && unsectioned > 0) {
      options.push("Assign the unsectioned shots to a chorus or verse.");
    }
    if (options.length < 3 && !input.hasTreatment) {
      options.push("When you want a written treatment, use the Treatment page (voice will not draft it yet).");
    }
    if (options.length < 3) {
      options.push("Read the existing shots back and cut anything that does not earn a cut.");
    }
  }

  const summary =
    input.shots.length === 0
      ? "No shots yet. Three ways to start are below."
      : uncovered.length > 0
        ? `${input.shots.length} shot(s) on the list; ${uncovered.length} section(s) still uncovered.`
        : `${input.shots.length} shot(s). Sections that exist on the structure have at least one shot.`;

  return { toolsUsed, gaps, options: options.slice(0, 3), summary };
}

export function pickShotForPrompt(
  shots: DirectorShotBrief[],
  transcript: string,
): DirectorShotBrief | null {
  const match = transcript.match(/shot\s*#?\s*(\d+)/i);
  if (match) {
    const n = Number(match[1]);
    return shots.find((s) => s.shot_number === n) ?? null;
  }
  if (/prompt|read (?:me )?the (?:next )?shot/i.test(transcript)) {
    return shots[0] ?? null;
  }
  return null;
}

export function formatShotPrompt(shot: DirectorShotBrief): string {
  const bits = [
    `Shot #${shot.shot_number}`,
    shot.song_section ? `section ${shot.song_section}` : null,
    shot.duration_seconds != null ? `${shot.duration_seconds}s` : null,
    shot.shot_type,
  ].filter(Boolean);
  const body = shot.scene_description?.trim() || "(no scene description yet)";
  return `${bits.join(" · ")}: ${body}`;
}
