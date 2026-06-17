import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export default function DesignStudioNewPage() {
  const navigate = useNavigate();
  const create = useCreateProduct();

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [slot, setSlot] = useState<ProductSlot>("outerwear");
  const [season, setSeason] = useState("");
  const [designPrompt, setDesignPrompt] = useState("");

  useEffect(() => {
    suggestNextProductSku()
      .then(setSku)
      .catch(() => setSku("MOD-001"));
  }, []);

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!sku.trim()) {
      toast.error("SKU is required");
      return;
    }
    try {
      const product = await create.mutateAsync({
        sku: sku.trim(),
        name: name.trim(),
        slot,
        season: season.trim() || null,
        design_prompt: designPrompt.trim() || null,
        status: "concept",
      });
      toast.success("Concept created");
      navigate({
        to: "/design-studio/$productId",
        params: { productId: product.id },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <>
      <PageHeader
        title="New concept"
        subtitle="One atomic garment per SKU — outfits are composed later on virtual samples."
      />
      <div className="space-y-6 px-4 py-6 md:px-8">
        <Button asChild variant="outline" size="sm">
          <Link to="/design-studio">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Design Studio
          </Link>
        </Button>

        <div className="mx-auto max-w-lg space-y-4 rounded-md border border-border bg-card/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-sku" className="text-xs">
                SKU
              </Label>
              <Input
                id="new-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-slot" className="text-xs">
                Garment slot
              </Label>
              <Select value={slot} onValueChange={(v) => setSlot(v as ProductSlot)}>
                <SelectTrigger id="new-slot" className="h-9 text-sm">
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-name" className="text-xs">
              Name
            </Label>
            <Input
              id="new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Varsity bomber, wide-leg denim…"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-season" className="text-xs">
              Season (optional)
            </Label>
            <Input
              id="new-season"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-prompt" className="text-xs">
              Design prompt
            </Label>
            <Textarea
              id="new-prompt"
              value={designPrompt}
              onChange={(e) => setDesignPrompt(e.target.value)}
              rows={5}
              placeholder="Describe the garment you want to develop…"
              className="text-sm"
            />
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
            Create concept
          </Button>
        </div>
      </div>
    </>
  );
}
