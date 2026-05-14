import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ProjectSidebar } from "@/components/ProjectSidebar";

export const Route = createFileRoute("/projects/$id")({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { id } = Route.useParams();
  return (
    <div className="flex min-h-screen">
      <ProjectSidebar projectId={id} />
      <Outlet />
    </div>
  );
}
