import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Product, ProductSlot } from "@/lib/queries/products";
import { useProductAssets } from "@/lib/queries/productAssets";
import { PRODUCT_SLOT_LABELS } from "@/components/products/productTaxonomy";
import { signedUrls } from "@/lib/storage";

function ProductThumb({
  product,
  selected,
  onClick,
}: {
  product: Product;
  selected: boolean;
  onClick: () => void;
}) {
  const assetsQuery = useProductAssets(product.id);
  const [signed, setSigned] = useState<string | null>(null);

  const coverPath = useMemo(() => {
    const assets = assetsQuery.data ?? [];
    const preferred = assets.find(
      (a) =>
        a.asset_role === "front" ||
        a.asset_role === "on_model_reference" ||
        a.asset_role === "design_concept",
    );
    return preferred?.storage_path ?? preferred?.file_url ?? assets[0]?.file_url ?? null;
  }, [assetsQuery.data]);

  useEffect(() => {
    if (!coverPath) {
      setSigned(null);
      return;
    }
    signedUrls("product-assets", [coverPath], 3600)
      .then((map) => setSigned(map[coverPath] ?? null))
      .catch(() => setSigned(null));
  }, [coverPath]);

  return (
    <button type="button" onClick={onClick} className="text-left">
      <div
        className={[
          "aspect-square overflow-hidden rounded-sm border bg-muted/30",
          selected ? "border-primary ring-1 ring-primary" : "border-border",
        ].join(" ")}
      >
        {signed ? (
          <img src={signed} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-1 text-center text-[9px] text-muted-foreground">
            {product.sku}
          </div>
        )}
      </div>
      <p className="mt-0.5 truncate text-[9px] font-medium">{product.sku}</p>
    </button>
  );
}

export function ProductGarmentPicker({
  products,
  selectedIds,
  onToggle,
}: {
  products: Product[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const bySlot = useMemo(() => {
    const map: Record<ProductSlot, Product[]> = {
      outerwear: [],
      top: [],
      bottom: [],
      dress: [],
      footwear: [],
      accessory: [],
    };
    for (const p of products) {
      if (p.slot in map) map[p.slot].push(p);
    }
    return map;
  }, [products]);

  return (
    <div className="space-y-2">
      {(Object.keys(bySlot) as ProductSlot[]).map((slot) => {
        const items = bySlot[slot];
        if (items.length === 0) return null;
        return (
          <ProductSlotGroup
            key={slot}
            slot={slot}
            items={items}
            selectedIds={selectedIds}
            onToggle={onToggle}
          />
        );
      })}
      {products.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          No approved products.{" "}
          <Link to="/design-studio" className="underline">
            Design Studio
          </Link>
        </p>
      )}
    </div>
  );
}

function ProductSlotGroup({
  slot,
  items,
  selectedIds,
  onToggle,
}: {
  slot: ProductSlot;
  items: Product[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {PRODUCT_SLOT_LABELS[slot]} ({items.length})
      </button>
      {open && (
        <div className="grid grid-cols-3 gap-1.5">
          {items.map((p) => (
            <ProductThumb
              key={p.id}
              product={p}
              selected={selectedIds.includes(p.id)}
              onClick={() => onToggle(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
