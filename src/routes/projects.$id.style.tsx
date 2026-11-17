import { createFileRoute } from "@tanstack/react-router";
import StyleLearnPage from "@/pages/StyleLearnPage";

function StyleLearnRoute() {
  const { id } = Route.useParams();
  return <StyleLearnPage projectId={id} />;
}

/** Local style learn. The page plans a cut in the browser. Extraction and the draft render stay on the machine. */
export const Route = createFileRoute("/projects/$id/style")({
  component: StyleLearnRoute,
});
