import raw from "./catalog.data.ts";
import { CATEGORY_LABELS, type CameraMove, type CatalogFile, type MotionKind } from "./types.ts";

const file = raw as unknown as CatalogFile;

export const CAMERA_MOVE_ATTRIBUTION = file.attribution;
export const CAMERA_MOVES: readonly CameraMove[] = file.moves;
export const CAMERA_MOVE_COUNT = CAMERA_MOVES.length;

const BY_ID = new Map(CAMERA_MOVES.map((move) => [move.id, move]));

export function getMove(id: string): CameraMove | null {
  return BY_ID.get(id) ?? null;
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function listCategories(): { id: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const move of CAMERA_MOVES) counts.set(move.category, (counts.get(move.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: categoryLabel(id), count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function listMoves(
  filter: { category?: string; query?: string; kind?: MotionKind; limit?: number } = {},
): CameraMove[] {
  const query = filter.query?.trim().toLowerCase() ?? "";
  const limit = filter.limit && filter.limit > 0 ? filter.limit : CAMERA_MOVES.length;
  const out: CameraMove[] = [];
  for (const move of CAMERA_MOVES) {
    if (filter.category && move.category !== filter.category) continue;
    if (filter.kind && move.kind !== filter.kind) continue;
    if (query) {
      const hay =
        `${move.id} ${move.name} ${move.says} ${move.use} ${move.numbers} ${move.kind} ${categoryLabel(move.category)}`.toLowerCase();
      if (!hay.includes(query)) continue;
    }
    out.push(move);
    if (out.length >= limit) break;
  }
  return out;
}
