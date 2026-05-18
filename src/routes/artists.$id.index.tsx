import { createFileRoute } from "@tanstack/react-router";
import ArtistDetail from "@/pages/ArtistDetail";

export const Route = createFileRoute("/artists/$id/")({
  component: () => {
    const { id } = Route.useParams();
    return <ArtistDetail id={id} />;
  },
});
