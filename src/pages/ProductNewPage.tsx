import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PRODUCT_SLOT_LABELS,
  PRODUCT_SLOTS_ORDERED,
} from "@/components/products/productTaxonomy";
import {
  suggestNextProductSku,
  useCreateProduct,
  type ProductSlot,
} from "@/lib/queries/products";

export default function ProductNewPage() {
  const navigate = useNavigate();
  const create = useCreateProduct();

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [slot, setSlot] = useState<ProductSlot>("top");

  useEffect(() => {
    suggestNextProductSku()
      .then(setSku)
      .catch(() => setSku("MOD-001"));
  }, []);

  async function handleCreate() {
    if (!name.trim() || !sku.trim()) {
      toast.error("Name and SKU are required");
      return;
    }
    try {
      const product = await create.mutateAsync({
        sku: sku.trim(),
        name: name.trim(),
        slot,
        status: "approved",
      });
      toast.success("Product created");
      navigate({ to: "/products/$id", params: { id: product.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <>
      <PageHeader
        title="New product"
        subtitle="Power-user path — skips Design Studio and lands directly in the library as approved."
      />
      <div className="space-y-6 px-4 py-6 md:px-8">
        <Button asChild variant="outline" size="sm">
          <Link to="/products">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Product Library
          </Link>
        </Button>

        <div className="mx-auto max-w-md space-y-4 rounded-md border border-border bg-card/30 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="direct-sku" className="text-xs">
              SKU
            </Label>
            <Input
              id="direct-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="direct-name" className="text-xs">
              Name
            </Label>
            <Input
              id="direct-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="direct-slot" className="text-xs">
              Garment slot
            </Label>
            <Select value={slot} onValueChange={(v) => setSlot(v as ProductSlot)}>
              <SelectTrigger id="direct-slot" className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_SLOTS_ORDERED.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PRODUCT_SLOT_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={create.isPending}
            onClick={handleCreate}
          >
            {create.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            Create product
          </Button>
        </div>
      </div>
    </>
  );
}
