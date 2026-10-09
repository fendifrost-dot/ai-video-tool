import { createFileRoute } from "@tanstack/react-router";
import StoryboardReviewPage from "@/pages/StoryboardReviewPage";

export const Route = createFileRoute("/projects/$id/review")({
  component: () => {
    const { id } = Route.useParams();
    return <StoryboardReviewPage projectId={id} />;
  },
});
