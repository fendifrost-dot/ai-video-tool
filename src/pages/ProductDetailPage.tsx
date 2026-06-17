import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ProductConceptEditor } from "@/components/design-studio/ProductConceptEditor";
import {
  ALL_PRODUCT_ASSET_ROLES,
  DESIGN_STUDIO_ASSET_ROLES,
  PRODUCT_STATUS_LABELS,
} from "@/components/products/productTaxonomy";
import { useProduct, useUpdateProduct } from "@/lib/queries/products";

export default function ProductDetailPage({ id }: { id: string }) {
  const query = useProduct(id);
  const update = useUpdateProduct();
  const product = query.data;

  if (query.isLoading) {
    return (
      <>
        <PageHeader title="Product" />
        <div className="px-8 py-6">
          <div className="h-40 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  if (!product) {
    return (
      <>
        <PageHeader title="Product not found" />
        <div className="px-8 py-6">
          <Button asChild variant="outline" size="sm">
            <Link to="/products">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Product Library
            </Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={`${product.sku} · ${PRODUCT_STATUS_LABELS[product.status]}`}
      />
      <div className="space-y-6 px-4 py-6 md:px-8">
        <Button asChild variant="outline" size="sm">
          <Link to="/products">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Product Library
          </Link>
        </Button>

        {product.status === "approved" && (
          <Button asChild size="sm" variant="secondary">
            <Link to="/products/$id/manufacturing" params={{ id: product.id }}>
              Manufacturing studio
            </Link>
          </Button>
        )}

        {product.status === "concept" && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
            This SKU is still a concept.{" "}
            <Link
              to="/design-studio/$productId"
              params={{ productId: product.id }}
              className="underline"
            >
              Continue in Design Studio
            </Link>{" "}
            to approve it.
          </p>
        )}

        <ProductConceptEditor
          product={product}
          readOnly={product.status === "archived"}
          assetRoles={
            product.status === "approved" ? ALL_PRODUCT_ASSET_ROLES : DESIGN_STUDIO_ASSET_ROLES
          }
          saving={update.isPending}
          onSave={async (patch) => {
            await update.mutateAsync({ id: product.id, patch });
          }}
        />
      </div>
    </>
  );
}
