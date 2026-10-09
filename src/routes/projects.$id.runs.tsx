import { createFileRoute } from "@tanstack/react-router";
import BatchRunsPage from "@/pages/BatchRunsPage";

export const Route = createFileRoute("/projects/$id/runs")({
  component: RunsRoute,
});

function RunsRoute() {
  const { id } = Route.useParams();
  return <BatchRunsPage projectId={id} />;
}
