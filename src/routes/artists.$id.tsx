import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/artists/$id")({
  component: () => <Outlet />,
});
