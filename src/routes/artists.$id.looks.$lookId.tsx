import { createFileRoute } from "@tanstack/react-router";
import LookDetailPage from "@/pages/LookDetailPage";

export const Route = createFileRoute("/artists/$id/looks/$lookId")({
  component: () => {
    const { id, lookId } = Route.useParams();
    return <LookDetailPage artistId={id} lookId={lookId} />;
  },
});
