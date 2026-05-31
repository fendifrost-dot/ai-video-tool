import { createFileRoute } from "@tanstack/react-router";
import TimelinePage from "@/pages/TimelinePage";

export const Route = createFileRoute("/projects/$id/timeline")({
  component: () => {
    const { id } = Route.useParams();
    return <TimelinePage projectId={id} />;
  },
});
