import { createFileRoute } from "@tanstack/react-router";
import ProductNewPage from "@/pages/ProductNewPage";

export const Route = createFileRoute("/products/new")({
  component: ProductNewPage,
});
