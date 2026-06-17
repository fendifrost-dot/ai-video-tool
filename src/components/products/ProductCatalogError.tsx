import { formatProductCatalogError } from "@/lib/queries/products";

export function ProductCatalogError({ error }: { error: unknown }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {formatProductCatalogError(error)}
    </div>
  );
}
