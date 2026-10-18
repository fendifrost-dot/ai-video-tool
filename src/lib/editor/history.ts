import type { EditSequence } from "../../../supabase/functions/edit-render/model";

const MAX = 80;

/** Undo/redo stack for nondestructive edit sequences. */
export type EditHistory = {
  past: EditSequence[];
  present: EditSequence;
  future: EditSequence[];
};

export function historyOf(seq: EditSequence): EditHistory {
  return { past: [], present: seq, future: [] };
}

export function pushEdit(h: EditHistory, next: EditSequence): EditHistory {
  if (next === h.present) return h;
  const past = [...h.past, h.present].slice(-MAX);
  return { past, present: next, future: [] };
}

export function undoEdit(h: EditHistory): EditHistory {
  if (!h.past.length) return h;
  const previous = h.past[h.past.length - 1]!;
  return {
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future],
  };
}

export function redoEdit(h: EditHistory): EditHistory {
  if (!h.future.length) return h;
  const [next, ...rest] = h.future;
  return {
    past: [...h.past, h.present],
    present: next!,
    future: rest,
  };
}

export function canUndo(h: EditHistory): boolean {
  return h.past.length > 0;
}

export function canRedo(h: EditHistory): boolean {
  return h.future.length > 0;
}
