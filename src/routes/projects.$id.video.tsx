import { createFileRoute } from "@tanstack/react-router";
import VideoComposerPage from "@/pages/VideoComposerPage";

export const Route = createFileRoute("/projects/$id/video")({
  component: () => {
    const { id } = Route.useParams();
    return <VideoComposerPage projectId={id} />;
  },
});
