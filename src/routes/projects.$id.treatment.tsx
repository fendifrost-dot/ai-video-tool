import { createFileRoute } from "@tanstack/react-router";
import { Treatment } from "@/pages/ProjectSections";

export const Route = createFileRoute("/projects/$id/treatment")({
  component: () => {
    const { id } = Route.useParams();
    return <Treatment projectId={id} />;
  },
});
