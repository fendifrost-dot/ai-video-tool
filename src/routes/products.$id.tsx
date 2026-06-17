import { createFileRoute } from "@tanstack/react-router";
import ProductDetailPage from "@/pages/ProductDetailPage";

export const Route = createFileRoute("/products/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <ProductDetailPage id={id} />;
  },
});
