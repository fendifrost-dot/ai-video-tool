import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Product } from "@/lib/queries/products";
import { useProductAssets } from "@/lib/queries/productAssets";
import { signedUrls } from "@/lib/storage";
import {
  PRODUCT_SLOT_LABELS,
  PRODUCT_STATUS_LABELS,
} from "@/components/products/productTaxonomy";

const PRODUCT_ASSETS_BUCKET = "product-assets";

export function ProductCard({
  product,
  linkTo,
}: {
  product: Product;
  linkTo: "design-studio" | "products";
}) {
  const assetsQuery = useProductAssets(product.id);
  const [thumb, setThumb] = useState<string | null>(null);

  const coverPath = (() => {
    const assets = assetsQuery.data ?? [];
    const preferred = assets.find(
      (a) =>
        a.asset_role === "front" ||
        a.asset_role === "design_concept" ||
        a.asset_role === "on_model_reference",
    );
    return preferred?.storage_path ?? preferred?.file_url ?? assets[0]?.file_url ?? null;
  })();

  useEffect(() => {
    if (!coverPath) {
      setThumb(null);
      return;
    }
    signedUrls(PRODUCT_ASSETS_BUCKET, [coverPath], 3600)
      .then((map) => setThumb(map[coverPath] ?? null))
      .catch(() => setThumb(null));
  }, [coverPath]);

  const to =
    linkTo === "design-studio"
      ? "/design-studio/$productId"
      : "/products/$id";
  const params =
    linkTo === "design-studio"
      ? { productId: product.id }
      : { id: product.id };

  return (
    <Link
      to={to}
      params={params}
      className="group flex flex-col gap-2 rounded-md border border-border bg-card p-2 transition hover:border-foreground/30"
    >
      <div className="aspect-square overflow-hidden rounded-sm border border-border bg-muted/30">
        {thumb ? (
          <img
            src={thumb}
            alt={product.name}
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            No image yet
          </div>
        )}
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-xs font-semibold">{product.sku}</p>
        <p className="truncate text-[11px] text-muted-foreground">{product.name}</p>
        <div className="flex flex-wrap gap-1">
          <span className="rounded-sm bg-muted/50 px-1.5 py-0.5 text-[10px] capitalize">
            {PRODUCT_SLOT_LABELS[product.slot]}
          </span>
          <span className="rounded-sm bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {PRODUCT_STATUS_LABELS[product.status]}
          </span>
        </div>
      </div>
    </Link>
  );
}
