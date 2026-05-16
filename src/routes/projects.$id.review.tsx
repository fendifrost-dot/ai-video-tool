import { createFileRoute } from "@tanstack/react-router";
import ReviewBoardPage from "@/pages/ReviewBoardPage";

export const Route = createFileRoute("/projects/$id/review")({
  component: () => {
    const { id } = Route.useParams();
    return <ReviewBoardPage projectId={id} />;
  },
});
