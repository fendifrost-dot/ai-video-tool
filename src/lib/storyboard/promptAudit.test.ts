import { describe, expect, it } from "vitest";
import { conflictNote, namesIn, promptConflicts, refusedPhrases } from "./promptAudit";

describe("a shot's own prohibition is held against the words its prompt takes from the project's entities", () => {
  const frame = "At eye level, walkers pass close to the lens among the trees. No visible ACME letters, emblem geometry, or logo-shaped cleared paths.";

  it("an entity that asks for the name the shot refuses is a conflict, said with both sentences and whose words they are", () => {
    const conflicts = promptConflicts([frame], [
      { from: "The walkers", text: "People crossing the cleared strokes of the ACME emblem cut into the forest floor. Never bystanders." },
      { from: "The rider", text: "One woman on a black horse." },
    ]);
    expect(conflicts).toEqual([
      { name: "ACME", forbiddenBy: "No visible ACME letters, emblem geometry, or logo-shaped cleared paths.", askedBy: "People crossing the cleared strokes of the ACME emblem cut into the forest floor.", from: "The walkers" },
    ]);
    expect(conflictNote(conflicts[0])).toContain("change the description of The walkers");
    expect(conflictNote(conflicts[0])).toContain("both go to the image model");
  });

  it("an entity that refuses the same thing agrees with the shot; a shot that refuses nothing by name has no conflict", () => {
    expect(promptConflicts([frame], [{ from: "The place", text: "The clearing. No ACME marks anywhere on the ground." }])).toEqual([]);
    expect(promptConflicts([frame], [{ from: "The place", text: "The clearing isn't marked with ACME lettering." }])).toEqual([]);
    expect(promptConflicts(["No people appear in this shot. No visible lettering."], [{ from: "The walkers", text: "ACME walkers cross the frame." }])).toEqual([]);
  });

  it("only names are held: a common word the prohibition shares with an entity is not a conflict; a name is matched whatever its case", () => {
    expect(promptConflicts([frame], [{ from: "The rider", text: "She rides along the cleared path, her letters of passage in one hand." }])).toEqual([]);
    expect(promptConflicts(["No ACME logo."], [{ from: "The walkers", text: "They carry Acme bags." }])).toHaveLength(1);
  });

  it("what is refused is the thing, not where: a name after a preposition is where it is refused", () => {
    expect(refusedPhrases("No crowd around Fendi.")).toEqual(["crowd"]);
    expect(refusedPhrases("Fendi leans on the Maybach under the Red Line, no visible logos on the wall.")).toEqual(["logos"]);
    expect(refusedPhrases("No visible ACME letters, emblem geometry, or logo-shaped cleared paths.")).toEqual(["visible ACME letters, emblem geometry, or logo-shaped cleared paths."]);
    for (const own of ["No crowd around Fendi.", "Fendi leans on the Maybach under the Red Line, no visible logos on the wall.", "The Maybach's plate must not be visible."])
      expect(promptConflicts([own], [{ from: "Fendi", text: "Fendi, the artist, beside his Maybach under the Red Line." }])).toEqual([]);
  });

  it("an opening that says HOW something is done refuses nothing, and neither does a refusal that keeps something", () => {
    expect(refusedPhrases("Without looking back, Fendi walks to the Maybach.")).toEqual([]);
    expect(refusedPhrases("Never hurried, Fendi crosses the lot.")).toEqual([]);
    expect(refusedPhrases("Nobody but Fendi is in the frame.")).toEqual([]);
    expect(refusedPhrases("No light except the Maybach's headlamps.")).toEqual([]);
    expect(refusedPhrases("Fendi is not the focal point of the frame.")).toEqual([]);
    expect(refusedPhrases("Do not show the ACME sign.")).toEqual(["the ACME sign."]);
    expect(refusedPhrases("Avoid ACME branding.")).toEqual(["ACME branding."]);
  });

  it("each of the shot's passages is read on its own, so an unpunctuated one never runs into the next", () => {
    // read as one text, "No visible lettering" would run on into "ACME pieces" and refuse what the shot requires
    expect(promptConflicts(["No visible lettering", "ACME pieces"], [{ from: "the outfit “ACME look”", text: "ACME look: a plain shirt." }])).toEqual([]);
  });

  it("a name is a word in capitals, or a capitalised word; the word that opens a sentence is not one for being capitalised", () => {
    expect(namesIn("ACME letters, or a Maybach's grille, on the CRT")).toEqual(["ACME", "Maybach", "CRT"]);
    expect(namesIn("Nothing here", true)).toEqual([]);
  });

  it("one conflict per name and entity, however many of its sentences ask", () => {
    expect(promptConflicts(["No ACME logo."], [{ from: "The walkers", text: "They wear ACME. They carry ACME bags." }])).toHaveLength(1);
  });

  it("it reports a name that describes the refused thing even when the entity only holds the thing named — which is why it is a note and not a block", () => {
    // words cannot tell this from "No ACME logo": a person reads the note and decides
    expect(promptConflicts(["No TV glow on his face."], [{ from: "The room", text: "A spare room with a small TV on a crate." }])).toHaveLength(1);
  });
});
