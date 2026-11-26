import { createFileRoute } from "@tanstack/react-router";
import AlterPage from "@/pages/AlterPage";

function AlterRoute() {
  const { id } = Route.useParams();
  return <AlterPage projectId={id} />;
}

/** ALTER: one change on a take, drafted and checked, not sent. */
export const Route = createFileRoute("/projects/$id/alter")({
  component: AlterRoute,
});
