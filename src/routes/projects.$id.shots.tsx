import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import ShotListPage from "@/pages/ShotListPage";

/**
 * Acts as both the layout (with an <Outlet />) AND renders the list page when
 * the path is exactly /projects/$id/shots. Child routes (shot detail) render
 * the Outlet content instead.
 */
export const Route = createFileRoute("/projects/$id/shots")({
  component: () => {
    const { id } = Route.useParams();
    const matches = useMatches();
    const isLeaf = matches[matches.length - 1].routeId === Route.id;
    if (isLeaf) {
      return <ShotListPage projectId={id} />;
    }
    return <Outlet />;
  },
});
