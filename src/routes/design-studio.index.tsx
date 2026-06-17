import { createFileRoute } from "@tanstack/react-router";
import DesignStudioPage from "@/pages/DesignStudioPage";

export const Route = createFileRoute("/design-studio/")({
  component: DesignStudioPage,
});
