import { createFileRoute } from "@tanstack/react-router";
import SetupPage from "@/pages/SetupPage";

export const Route = createFileRoute("/projects/$id/setup")({
  component: () => {
    const { id } = Route.useParams();
    return <SetupPage projectId={id} />;
  },
});
