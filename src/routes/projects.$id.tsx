import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ProjectSidebar } from "@/components/ProjectSidebar";
import { ProjectRailProvider } from "@/lib/projectRail";

export const Route = createFileRoute("/projects/$id")({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { id } = Route.useParams();
  return (
    <ProjectRailProvider>
      <div className="flex min-h-screen">
        <ProjectSidebar projectId={id} />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </ProjectRailProvider>
  );
}
