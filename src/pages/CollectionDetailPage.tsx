import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAddProductToCollection,
  useCollection,
  useCollectionProducts,
  useRemoveProductFromCollection,
} from "@/lib/queries/collections";
import { useProducts } from "@/lib/queries/products";
import { useState } from "react";

export default function CollectionDetailPage({ id }: { id: string }) {
  const collectionQuery = useCollection(id);
  const productsQuery = useCollectionProducts(id);
  const approvedQuery = useProducts("approved");
  const addProduct = useAddProductToCollection();
  const removeProduct = useRemoveProductFromCollection();
  const [pickId, setPickId] = useState("");

  const collection = collectionQuery.data;
  const memberIds = new Set((productsQuery.data ?? []).map((r) => r.product_id));
  const available = (approvedQuery.data ?? []).filter((p) => !memberIds.has(p.id));

  if (!collection) {
    return (
      <>
        <PageHeader title="Collection" />
        <div className="px-8 py-6 text-sm text-muted-foreground">Not found.</div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={collection.name} subtitle={collection.season ?? undefined} />
      <div className="space-y-6 px-4 py-6 md:px-8">
        <Button asChild variant="outline" size="sm">
          <Link to="/collections">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            All collections
          </Link>
        </Button>

        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card/30 p-4">
          <div className="min-w-[200px] flex-1">
            <Select value={pickId} onValueChange={setPickId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Add approved product…" />
              </SelectTrigger>
              <SelectContent>
                {available.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!pickId || addProduct.isPending}
            onClick={async () => {
              try {
                await addProduct.mutateAsync({
                  collectionId: id,
                  productId: pickId,
                  sortOrder: (productsQuery.data ?? []).length,
                });
                setPickId("");
                toast.success("Product added");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Add failed");
              }
            }}
          >
            Add to collection
          </Button>
        </div>

        <ul className="space-y-2">
          {(productsQuery.data ?? []).map((row) => {
            const p = row.products;
            if (!p) return null;
            return (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                <Link to="/products/$id" params={{ id: p.id }} className="hover:underline">
                  {p.sku} — {p.name}
                </Link>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() =>
                    removeProduct.mutateAsync({ collectionId: id, rowId: row.id })
                  }
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
