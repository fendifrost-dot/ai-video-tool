import { createFileRoute } from "@tanstack/react-router";
import CoverFlightPage from "@/pages/CoverFlightPage";

export const Route = createFileRoute("/projects/$id/cover-flight")({
  component: CoverFlightRoute,
});

function CoverFlightRoute() {
  const { id } = Route.useParams();
  return <CoverFlightPage projectId={id} />;
}
