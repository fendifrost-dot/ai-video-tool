import { describe, expect, it } from "vitest";
import { emptySequence } from "../../../supabase/functions/edit-render/model";
import { canRedo, canUndo, historyOf, pushEdit, redoEdit, undoEdit } from "./history";

describe("edit history", () => {
  it("undoes and redoes", () => {
    const a = emptySequence({ projectId: "p", name: "a" });
    const b = { ...a, name: "b" };
    const c = { ...a, name: "c" };
    let h = historyOf(a);
    h = pushEdit(h, b);
    h = pushEdit(h, c);
    expect(h.present.name).toBe("c");
    expect(canUndo(h)).toBe(true);
    h = undoEdit(h);
    expect(h.present.name).toBe("b");
    h = undoEdit(h);
    expect(h.present.name).toBe("a");
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(true);
    h = redoEdit(h);
    expect(h.present.name).toBe("b");
  });
});
