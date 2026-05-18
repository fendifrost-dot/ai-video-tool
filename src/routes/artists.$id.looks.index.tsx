import { createFileRoute } from "@tanstack/react-router";
import LooksListPage from "@/pages/LooksListPage";

export const Route = createFileRoute("/artists/$id/looks/")({
  component: () => {
    const { id } = Route.useParams();
    return <LooksListPage artistId={id} />;
  },
});
