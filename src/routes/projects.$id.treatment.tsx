import { createFileRoute } from "@tanstack/react-router";
import TreatmentPage from "@/pages/TreatmentPage";

export const Route = createFileRoute("/projects/$id/treatment")({
  component: () => {
    const { id } = Route.useParams();
    return <TreatmentPage projectId={id} />;
  },
});
