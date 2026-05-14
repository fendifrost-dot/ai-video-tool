import { createFileRoute } from "@tanstack/react-router";
import { ShotDetail } from "@/pages/ProjectSections";
export const Route = createFileRoute("/projects/$id/shots/$shotId")({
  component: () => {
    const { shotId } = Route.useParams();
    return <ShotDetail shotId={shotId} />;
  },
});
