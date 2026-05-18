import { createFileRoute } from "@tanstack/react-router";
import LookComposerPage from "@/pages/LookComposerPage";

type Search = {
  parentLookId?: string;
};

export const Route = createFileRoute("/artists/$id/looks/new")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    parentLookId:
      typeof search.parentLookId === "string" ? search.parentLookId : undefined,
  }),
  component: () => {
    const { id } = Route.useParams();
    const { parentLookId } = Route.useSearch();
    return (
      <LookComposerPage artistId={id} parentLookId={parentLookId ?? null} />
    );
  },
});
