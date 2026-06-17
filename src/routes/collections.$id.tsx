import { createFileRoute } from "@tanstack/react-router";
import CollectionDetailPage from "@/pages/CollectionDetailPage";

export const Route = createFileRoute("/collections/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <CollectionDetailPage id={id} />;
  },
});
