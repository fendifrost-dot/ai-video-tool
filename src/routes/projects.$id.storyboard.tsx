import { createFileRoute } from "@tanstack/react-router";
import StoryboardPage from "@/pages/StoryboardPage";

export const Route = createFileRoute("/projects/$id/storyboard")({
  component: () => {
    const { id } = Route.useParams();
    return <StoryboardPage projectId={id} />;
  },
});
