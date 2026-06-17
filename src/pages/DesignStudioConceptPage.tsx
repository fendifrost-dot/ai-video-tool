import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ProductConceptEditor } from "@/components/design-studio/ProductConceptEditor";
import {
  useApproveProduct,
  useDeleteProduct,
  useProduct,
  useUpdateProduct,
} from "@/lib/queries/products";

export default function DesignStudioConceptPage({
  productId,
}: {
  productId: string;
}) {
  const navigate = useNavigate();
  const query = useProduct(productId);
  const update = useUpdateProduct();
  const approve = useApproveProduct();
  const del = useDeleteProduct();

  const product = query.data;

  if (query.isLoading) {
    return (
      <>
        <PageHeader title="Concept" />
        <div className="px-8 py-6">
          <div className="h-40 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  if (!product) {
    return (
      <>
        <PageHeader title="Concept not found" />
        <div className="px-8 py-6">
          <Button asChild variant="outline" size="sm">
            <Link to="/design-studio">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to Design Studio
            </Link>
          </Button>
        </div>
      </>
    );
  }

  if (product.status !== "concept") {
    return (
      <>
        <PageHeader title={product.name} subtitle={`${product.sku} — approved product`} />
        <div className="space-y-4 px-8 py-6">
          <p className="text-sm text-muted-foreground">
            This SKU has been approved and lives in the Product Library.
          </p>
          <Button asChild>
            <Link to="/products/$id" params={{ id: product.id }}>
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Open in Product Library
            </Link>
          </Button>
        </div>
      </>
    );
  }

  async function handleApprove() {
    if (!confirm(`Approve "${product!.name}" and add to Product Library?`)) return;
    try {
      await approve.mutateAsync(product!.id);
      toast.success("Approved — now in Product Library");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete concept "${product!.name}"?`)) return;
    try {
      await del.mutateAsync(product!.id);
      toast.success("Concept deleted");
      navigate({ to: "/design-studio" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={`${product.sku} · concept in progress`}
      />
      <div className="space-y-6 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/design-studio">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Design Studio
            </Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={approve.isPending}
              onClick={handleApprove}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Approve to library
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={del.isPending}
              onClick={handleDelete}
            >
              Delete
            </Button>
          </div>
        </div>

        <ProductConceptEditor
          product={product}
          saving={update.isPending}
          onSave={async (patch) => {
            await update.mutateAsync({ id: product.id, patch });
          }}
        />
      </div>
    </>
  );
}
