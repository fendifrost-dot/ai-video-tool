/**
 * The versions of a shot: every clip on it, each named by what it IS, in plain words, and numbered when there is
 * more than one of its kind. Fendi, 16 Oct 2026: "on the storyboard … where we have the original clips for the
 * original footage, there should be an option to show the edited footage. And we should be able to have multiple
 * versions … we should be able to show all of those different versions within that storyboard treatment spot."
 *
 * A clip is already on the shot as a row (media.ts boxMedia); what was missing was a name a person can tell apart —
 * "Montage 2", not "generated_higgsfield_48f610cb-aaa.mp4" — and a way to flip between them on the card. Pure.
 */
import type { BoxMediaItem } from "./media";

/** What a clip is, as the board calls it. */
export function versionKind(item: Pick<BoxMediaItem, "role" | "base"> & { asset: Pick<BoxMediaItem["asset"], "derivedFrom"> }): string {
  if (item.base) return "Your take";
  if (item.role === "performance") {
    switch (item.asset.derivedFrom?.method) {
      case "montage":
        return "Montage";
      case "composite":
        return "New background";
      case "dressed":
        return "Dressed";
      case "restaged":
        return "Restaged";
      default:
        return item.asset.derivedFrom ? "Restaged" : "Your take";
    }
  }
  if (item.role === "generated_clip") return "AI clip";
  if (item.role === "generated_image") return "AI image";
  if (item.role === "b_roll") return "B-roll";
  return "Reference";
}

export type ShotVersion = {
  item: BoxMediaItem;
  kind: string;
  /** 1-based, by the asset's creation time, among the items of the same kind on the shot; null when it is the only one. */
  number: number | null;
  /** "Montage 2", "Your take", "New background". */
  name: string;
  /** When it was made, UTC, short: "16 Oct 17:27". */
  when: string;
  /** "Montage 2 · 16 Oct 17:27 · 4.0 s" */
  title: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function whenMade(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hh}:${mm}`;
}

/** Every item on the shot as a version, in the order the board lists them (the one showing first). */
export function versionsOf(items: readonly BoxMediaItem[]): ShotVersion[] {
  const kinds = items.map(versionKind);
  // numbering is by creation time within a kind, so "Montage 1" stays "Montage 1" when a newer one lands
  const byKind = new Map<string, BoxMediaItem[]>();
  items.forEach((item, i) => {
    const list = byKind.get(kinds[i]) ?? [];
    list.push(item);
    byKind.set(kinds[i], list);
  });
  for (const list of byKind.values()) list.sort((a, b) => a.asset.createdAt.localeCompare(b.asset.createdAt) || a.asset.id.localeCompare(b.asset.id));
  return items.map((item, i) => {
    const kind = kinds[i];
    const peers = byKind.get(kind)!;
    const number = peers.length > 1 ? peers.indexOf(item) + 1 : null;
    const name = number ? `${kind} ${number}` : kind;
    const when = whenMade(item.asset.createdAt);
    const seconds = item.kind === "video" && item.asset.durationSeconds ? `${item.asset.durationSeconds.toFixed(1)} s` : "";
    return { item, kind, number, name, when, title: [name, when, seconds].filter(Boolean).join(" · ") };
  });
}

/** The name of one item among the shot's. */
export function versionName(item: BoxMediaItem, items: readonly BoxMediaItem[]): string {
  return versionsOf(items).find((v) => v.item === item)?.name ?? versionKind(item);
}

/** The item before / after `item` in the board's order, wrapping round; null when it is alone. */
export function neighbourVersion(item: BoxMediaItem, items: readonly BoxMediaItem[], step: 1 | -1): BoxMediaItem | null {
  if (items.length < 2) return null;
  const i = items.indexOf(item);
  if (i < 0) return items[0];
  return items[(i + step + items.length) % items.length];
}
