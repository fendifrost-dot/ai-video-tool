import { createFileRoute } from "@tanstack/react-router";
import PropsLibraryPage from "@/pages/PropsLibraryPage";

export const Route = createFileRoute("/library/props")({
  component: PropsLibraryPage,
});
