import { createFileRoute } from "@tanstack/react-router";
import { TreatmentBuilderPage } from "@/pages/TreatmentBuilderPage";

export const Route = createFileRoute("/projects/$id/treatment")({
  component: () => {
    const { id } = Route.useParams();
    return <TreatmentBuilderPage projectId={id} />;
  },
});
