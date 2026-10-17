import { createFileRoute } from "@tanstack/react-router";
import RegionSwapPage from "@/pages/RegionSwapPage";

type Search = {
  /** The clip to swap pieces on (project_assets.id). */
  asset?: string;
  /** The box, "x,y,w,h" in 0–1 of the frame. */
  box?: string;
  /** Where in the clip the swap goes back, "a,b" seconds. */
  window?: string;
  /** The wardrobe pictures to put on him, comma-separated ids; absent = his shoes in the shot. */
  pieces?: string;
};

const text = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/projects/$id/swap")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    asset: text(search.asset),
    box: text(search.box),
    window: text(search.window),
    pieces: text(search.pieces),
  }),
  component: () => {
    const { id } = Route.useParams();
    const s = Route.useSearch();
    return <RegionSwapPage projectId={id} assetId={s.asset ?? null} box={s.box ?? null} window={s.window ?? null} pieces={s.pieces ?? null} />;
  },
});
