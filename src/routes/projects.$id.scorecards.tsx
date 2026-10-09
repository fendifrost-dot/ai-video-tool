import { createFileRoute } from "@tanstack/react-router";
import ReviewBoardPage from "@/pages/ReviewBoardPage";

/** The per-clip scorecards (the page Review used to be). Review itself now plays the storyboard. */
export const Route = createFileRoute("/projects/$id/scorecards")({
  component: () => {
    const { id } = Route.useParams();
    return <ReviewBoardPage projectId={id} />;
  },
});
