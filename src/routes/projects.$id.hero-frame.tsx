import { createFileRoute } from "@tanstack/react-router";
import HeroFrameStudioPage from "@/pages/HeroFrameStudioPage";

export const Route = createFileRoute("/projects/$id/hero-frame")({
  component: () => {
    const { id } = Route.useParams();
    return <HeroFrameStudioPage projectId={id} />;
  },
});
