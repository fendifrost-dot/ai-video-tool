import { createFileRoute } from "@tanstack/react-router";
import ExportPage from "@/pages/ExportPage";

export const Route = createFileRoute("/projects/$id/export")({
  component: () => {
    const { id } = Route.useParams();
    return <ExportPage projectId={id} />;
  },
});
