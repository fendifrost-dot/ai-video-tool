import { createFileRoute } from "@tanstack/react-router";
import AssetLibraryPage from "@/pages/AssetLibraryPage";

export const Route = createFileRoute("/projects/$id/assets")({
  component: () => {
    const { id } = Route.useParams();
    return <AssetLibraryPage projectId={id} />;
  },
});
