import { createFileRoute } from "@tanstack/react-router";
import ContinuityOverviewPage from "@/pages/ContinuityOverviewPage";

export const Route = createFileRoute("/projects/$id/continuity")({
  component: () => {
    const { id } = Route.useParams();
    return <ContinuityOverviewPage projectId={id} />;
  },
});
