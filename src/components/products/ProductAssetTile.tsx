import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signedUrls } from "@/lib/storage";
import type { ProductAsset } from "@/lib/queries/productAssets";
import type { ProductAssetRole } from "@/lib/queries/products";
import { PRODUCT_ASSET_ROLE_LABELS } from "@/components/products/productTaxonomy";

const PRODUCT_ASSETS_BUCKET = "product-assets";

export function ProductAssetTile({
  asset,
  onDelete,
  disabled,
}: {
  asset: ProductAsset;
  onDelete?: () => Promise<void>;
  disabled?: boolean;
}) {
  const [signed, setSigned] = useState<string | null>(null);

  useEffect(() => {
    const path = asset.storage_path ?? asset.file_url;
    if (!path) {
      setSigned(null);
      return;
    }
    signedUrls(PRODUCT_ASSETS_BUCKET, [path], 3600)
      .then((map) => setSigned(map[path] ?? null))
      .catch(() => setSigned(null));
  }, [asset.file_url, asset.storage_path]);

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-card p-2">
      <div className="aspect-square overflow-hidden rounded-sm border border-border bg-muted/30">
        {signed ? (
          <img src={signed} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
            Loading…
          </div>
        )}
      </div>
      <p className="text-[10px] font-medium leading-tight">
        {PRODUCT_ASSET_ROLE_LABELS[asset.asset_role]}
      </p>
      {onDelete && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-destructive hover:text-destructive"
          disabled={disabled}
          onClick={async () => {
            try {
              await onDelete();
              toast.success("Asset removed");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Delete failed");
            }
          }}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          Remove
        </Button>
      )}
    </div>
  );
}

export function ProductAssetRolePicker({
  value,
  onChange,
  roles,
}: {
  value: ProductAssetRole;
  onChange: (role: ProductAssetRole) => void;
  roles: ProductAssetRole[];
}) {
  return (
    <select
      className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value as ProductAssetRole)}
    >
      {roles.map((role) => (
        <option key={role} value={role}>
          {PRODUCT_ASSET_ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  );
}
