import { describe, expect, it } from "vitest";
import { conflictMessage, isProhibition, namesIn, promptConflicts } from "./promptAudit";

describe("a shot's own prohibition is held against the words its prompt takes from the project's entities", () => {
  const frame = "At eye level, walkers pass close to the lens among the trees. No visible ACME letters, emblem geometry, or logo-shaped cleared paths.";

  it("an entity that asks for the name the shot forbids is a conflict, said with both sentences and whose words they are", () => {
    const conflicts = promptConflicts(frame, [
      { from: "The walkers", text: "The walkers — People crossing the cleared strokes of the ACME emblem cut into the forest floor. Never bystanders." },
      { from: "The rider", text: "The rider — One woman on a black horse." },
    ]);
    expect(conflicts).toEqual([
      { name: "ACME", forbiddenBy: "No visible ACME letters, emblem geometry, or logo-shaped cleared paths.", askedBy: "The walkers — People crossing the cleared strokes of the ACME emblem cut into the forest floor.", from: "The walkers" },
    ]);
    expect(conflictMessage(conflicts)).toContain("Change the description of The walkers, or the shot's own words");
    expect(conflictMessage(conflicts)).toContain("Nothing was generated.");
  });

  it("an entity that refuses the same thing agrees with the shot; a shot that forbids nothing by name has no conflict", () => {
    expect(promptConflicts(frame, [{ from: "The place", text: "The clearing. No ACME marks anywhere on the ground." }])).toEqual([]);
    expect(promptConflicts(frame, [{ from: "The place", text: "The clearing is not marked with ACME lettering." }])).toEqual([]);
    expect(promptConflicts("No people appear in this shot. No visible lettering.", [{ from: "The walkers", text: "ACME walkers cross the frame." }])).toEqual([]);
  });

  it("only names are held: a common word the prohibition shares with an entity is not a conflict", () => {
    expect(promptConflicts(frame, [{ from: "The rider", text: "She rides along the cleared path, her letters of passage in one hand." }])).toEqual([]);
  });

  it("a sentence that refuses everything but something forbids no name; neither does one that merely describes", () => {
    expect(isProhibition("Nobody but Fendi is in the frame.")).toBe(false);
    expect(isProhibition("No light except the Maybach's headlamps.")).toBe(false);
    expect(isProhibition("Fendi is not the focal point of the frame.")).toBe(false);
    expect(isProhibition("The storefront must not show the ACME sign.")).toBe(true);
    expect(promptConflicts("Nobody but Fendi is in the frame.", [{ from: "Fendi", text: "Fendi — the artist." }])).toEqual([]);
  });

  it("a name is a word in capitals, or a capitalised word that does not open its sentence", () => {
    expect(namesIn("No visible ACME letters, or a Maybach's grille, on the CRT.")).toEqual(["ACME", "Maybach", "CRT"]);
    expect(namesIn("Nothing here.")).toEqual([]);
  });

  it("one conflict per name and entity, however many of its sentences ask", () => {
    const conflicts = promptConflicts("No ACME logo.", [{ from: "The walkers", text: "They wear ACME. They carry ACME bags." }]);
    expect(conflicts).toHaveLength(1);
  });
});
