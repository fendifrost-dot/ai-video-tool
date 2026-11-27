import { createFileRoute } from "@tanstack/react-router";
import CameraMovesPage from "@/pages/CameraMovesPage";

function CameraMovesRoute() {
  const { id } = Route.useParams();
  return <CameraMovesPage projectId={id} />;
}

/** Browsable camera-move library. Preparing a Seedance body does not call fal. */
export const Route = createFileRoute("/projects/$id/camera-moves")({
  component: CameraMovesRoute,
});
