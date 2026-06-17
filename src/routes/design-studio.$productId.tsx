import { createFileRoute } from "@tanstack/react-router";
import DesignStudioConceptPage from "@/pages/DesignStudioConceptPage";

export const Route = createFileRoute("/design-studio/$productId")({
  component: () => {
    const { productId } = Route.useParams();
    return <DesignStudioConceptPage productId={productId} />;
  },
});
