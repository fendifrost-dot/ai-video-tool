import { createFileRoute } from "@tanstack/react-router";
import ProjectOverview from "@/pages/ProjectOverview";
export const Route = createFileRoute("/projects/$id/")({
  component: () => {
    const { id } = Route.useParams();
    return <ProjectOverview id={id} />;
  },
});
