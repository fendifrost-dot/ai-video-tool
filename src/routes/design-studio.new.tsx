import { createFileRoute } from "@tanstack/react-router";
import DesignStudioNewPage from "@/pages/DesignStudioNewPage";

export const Route = createFileRoute("/design-studio/new")({
  component: DesignStudioNewPage,
});
