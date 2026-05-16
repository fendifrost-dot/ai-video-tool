import { createFileRoute } from "@tanstack/react-router";
import PromptBuilderPage from "@/pages/PromptBuilderPage";

export const Route = createFileRoute("/projects/$id/prompt")({
  component: () => {
    const { id } = Route.useParams();
    return <PromptBuilderPage projectId={id} />;
  },
});
