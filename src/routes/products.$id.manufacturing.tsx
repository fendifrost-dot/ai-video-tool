import { createFileRoute } from "@tanstack/react-router";
import ProductManufacturingPage from "@/pages/ProductManufacturingPage";

export const Route = createFileRoute("/products/$id/manufacturing")({
  component: () => {
    const { id } = Route.useParams();
    return <ProductManufacturingPage productId={id} />;
  },
});
