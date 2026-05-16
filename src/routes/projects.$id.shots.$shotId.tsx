import { createFileRoute } from "@tanstack/react-router";
import ShotDetailPage from "@/pages/ShotDetailPage";

export const Route = createFileRoute("/projects/$id/shots/$shotId")({
  component: () => {
    const { id, shotId } = Route.useParams();
    return <ShotDetailPage projectId={id} shotId={shotId} />;
  },
});
