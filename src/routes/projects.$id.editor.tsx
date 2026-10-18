import { createFileRoute } from "@tanstack/react-router";
import EditorPage from "@/pages/EditorPage";

function EditorRoute() {
  const { id } = Route.useParams();
  return <EditorPage projectId={id} />;
}

export const Route = createFileRoute("/projects/$id/editor")({
  component: EditorRoute,
});
