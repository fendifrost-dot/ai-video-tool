import { Link } from "@tanstack/react-router";
import { Package, Plus } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductCatalogError } from "@/components/products/ProductCatalogError";
import { useProducts } from "@/lib/queries/products";

export default function ProductsPage() {
  const query = useProducts("approved");
  const products = query.data ?? [];

  return (
    <>
      <PageHeader
        title="Product Library"
        subtitle="Approved garment SKUs — reusable on any avatar, video shoot, or manufacturing run."
      />
      <div className="space-y-6 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {products.length} approved SKU{products.length === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/design-studio">Design Studio</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/products/new">
                <Plus className="mr-1.5 h-4 w-4" />
                Direct create
              </Link>
            </Button>
          </div>
        </div>

        {query.isError ? (
          <ProductCatalogError error={query.error} />
        ) : query.isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square animate-pulse rounded-md border border-border bg-muted/20"
              />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-12 text-center">
            <Package className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <h2 className="mt-3 text-base font-medium">No approved products yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a concept in Design Studio and approve it, or add a SKU directly.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/design-studio">Design Studio</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/products/new">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Direct create
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} linkTo="products" />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
