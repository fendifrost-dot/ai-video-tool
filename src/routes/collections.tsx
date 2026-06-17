import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isProductCatalogEnabled } from "@/lib/queries/products";

export const Route = createFileRoute("/collections")({
  beforeLoad: () => {
    if (!isProductCatalogEnabled()) {
      throw redirect({ to: "/projects" });
    }
  },
  component: () => <Outlet />,
});
