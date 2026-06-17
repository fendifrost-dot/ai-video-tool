import { Link } from "@tanstack/react-router";
import { Lightbulb, Plus } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductCatalogError } from "@/components/products/ProductCatalogError";
import { useProducts } from "@/lib/queries/products";

export default function DesignStudioPage() {
  const query = useProducts("concept");
  const concepts = query.data ?? [];

  return (
    <>
      <PageHeader
        title="Design Studio"
        subtitle="Ideas in progress — approve a concept to add it to your Product Library."
      />
      <div className="space-y-6 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {concepts.length} concept{concepts.length === 1 ? "" : "s"} in progress
          </p>
          <Button asChild size="sm">
            <Link to="/design-studio/new">
              <Plus className="mr-1.5 h-4 w-4" />
              New concept
            </Link>
          </Button>
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
        ) : concepts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-12 text-center">
            <Lightbulb className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <h2 className="mt-3 text-base font-medium">No concepts yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Start with a text concept and reference images. Approve when ready for
              virtual samples and manufacturing.
            </p>
            <div className="mt-4">
              <Button asChild size="sm">
                <Link to="/design-studio/new">
                  <Plus className="mr-1.5 h-4 w-4" />
                  New concept
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {concepts.map((product) => (
              <ProductCard key={product.id} product={product} linkTo="design-studio" />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
