/**
 * Treatment history (Fendi, 2026-10-03): a treatment that is replaced — by a generation, an edit, a delete or a
 * restore — is kept, with the notes, mood and visual direction that stood beside it, and can be made current again.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { clearTreatment, parseTreatmentDoc, withTreatmentDoc, type TreatmentDoc } from "./treatmentDoc";
import { contextFromEarlierTreatment, currentSnapshot, keptVersion, restoreWrite, versionAuthor, versionDiffers, versionExcerpt, versionFromRow, versionReason, type ProjectBrief, type TreatmentVersion, type TreatmentVersionRow } from "./versions";

const doc = (text: string, over: Partial<TreatmentDoc> = {}): TreatmentDoc => ({ text, mode: "ai", updatedAt: "2026-10-01T00:00:00Z", model: "m1", notes: "", storyboard: null, footageConfirmedAt: null, ...over });

/** A project row with the database's keeping rule applied on every write — what the trigger does. */
function store(initial: ProjectBrief) {
  let row: ProjectBrief = { ...initial };
  const versions: TreatmentVersionRow[] = [];
  let n = 0;
  return {
    get row() {
      return row;
    },
    versions,
    update(patch: ProjectBrief) {
      const next = { ...row, ...patch };
      const kept = keptVersion(row, next);
      if (kept) versions.unshift({ id: `v${++n}`, project_id: "p1", created_at: `2026-10-03T00:00:${String(n).padStart(2, "0")}Z`, ...kept });
      row = next;
    },
  };
}

describe("what is kept when the treatment is replaced", () => {
  it("a generation keeps the text it replaces, labelled as replaced by a generation", () => {
    const s = store({ treatment_json: withTreatmentDoc({}, doc("The first idea.")), notes: "no logos", mood: "moody", visual_style: "night" });
    s.update({ treatment_json: withTreatmentDoc(s.row.treatment_json, doc("A second idea."), { what: "generate", at: "t1" }) });
    expect(s.versions).toHaveLength(1);
    expect(s.versions[0]).toMatchObject({ replaced_by: "generate", treatment_text: "The first idea.", notes: "no logos", mood: "moody", visual_style: "night", treatment_mode: "ai", treatment_model: "m1" });
    expect(parseTreatmentDoc(s.row.treatment_json).text).toBe("A second idea.");
  });

  it("a manual save, a delete and a notes change each keep what they replace", () => {
    const s = store({ treatment_json: withTreatmentDoc({}, doc("One.")), notes: "wall of notes" });
    s.update({ treatment_json: withTreatmentDoc(s.row.treatment_json, doc("Two.", { mode: "manual", model: null }), { what: "edit", at: "t1" }) });
    s.update({ notes: "shorter notes" });
    s.update({ treatment_json: clearTreatment(s.row.treatment_json, "t3") });
    expect(s.versions.map((v) => [v.replaced_by, v.treatment_text, v.notes])).toEqual([
      ["delete", "Two.", "shorter notes"],
      ["context", "Two.", "wall of notes"],
      ["edit", "One.", "wall of notes"],
    ]);
  });

  it("a write that changes neither the text nor its context keeps nothing — a stored review, a setup confirmation", () => {
    const s = store({ treatment_json: withTreatmentDoc({}, doc("One.")), notes: "n" });
    s.update({ treatment_json: { ...(s.row.treatment_json as object), astra_review: { verdict: "revise" } } });
    s.update({ treatment_json: withTreatmentDoc(s.row.treatment_json, { ...parseTreatmentDoc(s.row.treatment_json), footageConfirmedAt: "2026-10-03" }) });
    expect(s.versions).toHaveLength(0);
  });

  it("an old label is never read as a later write's: an unlabelled text change after a generation is an edit", () => {
    const s = store({ treatment_json: withTreatmentDoc({}, doc("One.")) });
    s.update({ treatment_json: withTreatmentDoc(s.row.treatment_json, doc("Two."), { what: "generate", at: "t1" }) });
    // e.g. a SQL editor changes the text and leaves the rest of the record as it was
    const j = s.row.treatment_json as { treatment: Record<string, unknown> };
    s.update({ treatment_json: { ...j, treatment: { ...j.treatment, text: "Three." } } });
    expect(s.versions[0].replaced_by).toBe("edit");
    expect(s.versions[0].treatment_text).toBe("Two.");
  });

  it("reads an older structured treatment (concept + narrative) as its text, and a project with nothing keeps nothing", () => {
    const s = store({ treatment_json: { version: 2, concept: "Runway.", narrative: "It unfolds.", clips: [], model: "old", generated_at: "2026-09-18" } });
    s.update({ treatment_json: withTreatmentDoc(s.row.treatment_json, doc("New."), { what: "generate", at: "t1" }) });
    expect(s.versions[0]).toMatchObject({ treatment_text: "Runway.\n\nIt unfolds.", treatment_model: "old", treatment_updated_at: "2026-09-18" });
    const empty = store({ treatment_json: null, notes: null });
    empty.update({ treatment_json: withTreatmentDoc({}, doc("First ever.")), notes: "first notes" });
    expect(empty.versions).toHaveLength(0);
  });

  it("the two older notes fields are kept as the one text the director saw", () => {
    const s = store({ treatment_json: withTreatmentDoc({}, doc("One.", { notes: "kept with the treatment" })), notes: "on the project" });
    s.update({ notes: "replaced" });
    expect(s.versions[0].notes).toBe("on the project\n\nkept with the treatment");
  });
});

describe("restoring a version", () => {
  const version = (over: Partial<TreatmentVersion> = {}): TreatmentVersion =>
    ({ id: "v1", projectId: "p1", variationId: "var1", replacedAt: "2026-10-03T10:04:00Z", replacedBy: "generate", text: "The first idea.", mode: "manual", model: null, writtenAt: "2026-10-01T09:00:00Z", notes: "the old notes", mood: "moody", visualStyle: "night city", ...over });

  it("is one write: the version's text, as written, with the notes, mood and visual direction it had", () => {
    const current = withTreatmentDoc({ clips: [{ key: "c001" }], astra_review: { verdict: "revise" } }, doc("A second idea.", { storyboard: { from: "9:abc", at: "t", written: 41, kept: 5 } }));
    const w = restoreWrite(version(), current, "2026-10-03T12:00:00Z");
    const restored = parseTreatmentDoc(w.treatment_json);
    expect(restored.text).toBe("The first idea.");
    expect(restored.mode).toBe("manual");
    expect(restored.model).toBeNull();
    expect(w).toMatchObject({ notes: "the old notes", mood: "moody", visual_style: "night city" });
    // everything else in the record stays: the shots' fingerprint (so the page says they were written from another text), the last generation's clips, the stored review
    expect(restored.storyboard).toEqual({ from: "9:abc", at: "t", written: 41, kept: 5, coverage: null, run: null });
    expect(w.treatment_json.clips).toEqual([{ key: "c001" }]);
    expect(w.treatment_json.astra_review).toEqual({ verdict: "revise" });
  });

  it("keeps what it replaces — so a restore can be undone, and nothing is ever lost by restoring", () => {
    const s = store({ treatment_json: withTreatmentDoc({}, doc("One.", { mode: "manual", model: null })), notes: "notes one", mood: "m1", visual_style: "v1" });
    s.update({ treatment_json: withTreatmentDoc(s.row.treatment_json, doc("Two."), { what: "generate", at: "t1" }), notes: "notes two" });
    const first = versionFromRow(s.versions[0]);
    expect(first.text).toBe("One.");
    s.update(restoreWrite(first, s.row.treatment_json, "t2"));
    expect(currentSnapshot(s.row)).toEqual({ text: "One.", notes: "notes one", mood: "m1", visualStyle: "v1" });
    expect(s.versions[0]).toMatchObject({ replaced_by: "restore", treatment_text: "Two.", notes: "notes two" });
    // and back again
    s.update(restoreWrite(versionFromRow(s.versions[0]), s.row.treatment_json, "t3"));
    expect(currentSnapshot(s.row).text).toBe("Two.");
    expect(s.versions.map((v) => v.treatment_text)).toEqual(["One.", "Two.", "One."]);
  });

  it("says what a restore would change, and nothing when the version is what is current", () => {
    const now = { text: "The first idea.", notes: "the old notes", mood: "bright", visualStyle: "night city" };
    expect(versionDiffers(version(), now)).toEqual(["mood"]);
    expect(versionDiffers(version({ mood: "bright" }), now)).toEqual([]);
  });

  it("names a version for a list", () => {
    expect(versionReason({ replacedBy: "generate" })).toMatch(/AI wrote a new treatment/);
    expect(versionReason({ replacedBy: "delete" })).toMatch(/deleted/);
    expect(versionReason({ replacedBy: "context" })).toMatch(/notes, mood or visual direction/);
    expect(versionAuthor(version())).toBe("written by you");
    expect(versionAuthor(version({ mode: "ai", model: "grok-4-fast" }))).toBe("written by the AI (grok-4-fast)");
    expect(versionExcerpt(version({ text: "x".repeat(400) })).length).toBeLessThanOrEqual(150);
    expect(versionExcerpt(version({ text: "", notes: "only notes" }))).toBe("only notes");
  });
});

describe("the database keeps the version — the app cannot forget to", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261003180000_treatment_versions.sql"), "utf8");

  it("a trigger on the project writes the replaced version before every update", () => {
    expect(sql).toMatch(/create trigger video_projects_keep_treatment_version\s+before update on public\.video_projects\s+for each row/);
    expect(sql).toMatch(/insert into public\.treatment_versions/);
  });

  it("versions can be read by their owner and changed by nobody", () => {
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/for select to authenticated using \(user_id = auth\.uid\(\)\)/);
    expect(sql).not.toMatch(/for (update|delete|insert|all) to/);
  });

  it("restores nothing and changes no existing project by itself", () => {
    expect(sql).not.toMatch(/update public\.video_projects/);
    expect(sql).not.toMatch(/insert into public\.treatment_versions[\s\S]*select[\s\S]*from public\.video_projects/);
  });
});

describe("context that was written beside an earlier treatment", () => {
  const v = (text: string, over: Partial<TreatmentVersion> = {}): TreatmentVersion => ({ id: "v", projectId: "p", variationId: "var1", replacedAt: "2026-10-07T02:40:52Z", replacedBy: "edit", text, mode: "ai", model: "m", writtenAt: "2026-10-03T19:26:38Z", notes: "PLACES: the runway.", mood: "cold", visualStyle: "A Paris runway at night.", ...over });
  const now = { text: "A fashion show burns in a forest.", notes: "PLACES: the runway.", mood: "cold", visualStyle: "A Paris runway at night." };

  it("names the fields that have not moved since the treatment beside them was replaced", () => {
    expect(contextFromEarlierTreatment([v("He walks a black runway.")], now)).toEqual(["visual", "mood", "notes"]);
    // one of them rewritten for the new treatment: it is not named
    expect(contextFromEarlierTreatment([v("He walks a black runway.")], { ...now, visualStyle: "A broadcast that keeps getting ahead of reality." })).toEqual(["mood", "notes"]);
    // an empty field carries nothing over
    expect(contextFromEarlierTreatment([v("He walks a black runway.")], { ...now, notes: "  " })).toEqual(["visual", "mood"]);
  });

  it("looks past versions of the SAME text (a context-only change) to the last treatment that was replaced", () => {
    const sameText = v(now.text, { replacedBy: "context", notes: "something else", mood: "warm", visualStyle: "other" });
    expect(contextFromEarlierTreatment([sameText, v("He walks a black runway.")], now)).toEqual(["visual", "mood", "notes"]);
  });

  it("says nothing when no other treatment ever stood here, or there is no treatment now", () => {
    expect(contextFromEarlierTreatment([], now)).toEqual([]);
    expect(contextFromEarlierTreatment([v(now.text)], now)).toEqual([]);
    expect(contextFromEarlierTreatment([v("He walks a black runway.")], { ...now, text: " " })).toEqual([]);
  });
});

