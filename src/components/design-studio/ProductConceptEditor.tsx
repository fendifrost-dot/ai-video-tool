import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
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
  buildStoragePath,
  makeUploadFilename,
  uploadToBucket,
} from "@/lib/storage";
import {
  IMAGE_UPLOAD_ACCEPT,
  normalizeImageForUpload,
} from "@/lib/image-normalize";
import { supabase } from "@/lib/supabase";
import type { Product, ProductPatch, ProductSlot } from "@/lib/queries/products";
import {
  useCreateProductAsset,
  useDeleteProductAsset,
  useImportProductAssetFromUrl,
  useProductAssets,
} from "@/lib/queries/productAssets";
import {
  useCreateProductVariant,
  useDeleteProductVariant,
  useProductVariants,
} from "@/lib/queries/productVariants";
import type { ProductAssetRole } from "@/lib/queries/products";
import {
  DESIGN_STUDIO_ASSET_ROLES,
  ALL_PRODUCT_ASSET_ROLES,
  PRODUCT_SLOT_LABELS,
  PRODUCT_SLOTS_ORDERED,
} from "@/components/products/productTaxonomy";
import {
  ProductAssetRolePicker,
  ProductAssetTile,
} from "@/components/products/ProductAssetTile";
import { FitProfileEditor } from "@/components/products/FitProfileEditor";
import { LogoPlacementEditor } from "@/components/products/LogoPlacementEditor";
import {
  metadataWithProductDetails,
  resolveProductDetails,
  upsertLogoProductDetail,
} from "@/lib/garment/productDetails";
import { UrlImportPanel } from "@/components/wardrobe/UrlImportPanel";

const PRODUCT_ASSETS_BUCKET = "product-assets";

export function ProductConceptEditor({
  product,
  onSave,
  saving,
  readOnly = false,
  assetRoles = DESIGN_STUDIO_ASSET_ROLES,
}: {
  product: Product;
  onSave: (patch: ProductPatch) => Promise<void>;
  saving?: boolean;
  readOnly?: boolean;
  assetRoles?: ProductAssetRole[];
}) {
  const [name, setName] = useState(product.name);
  const [sku, setSku] = useState(product.sku);
  const [slot, setSlot] = useState<ProductSlot>(product.slot);
  const [season, setSeason] = useState(product.season ?? "");
  const [designPrompt, setDesignPrompt] = useState(product.design_prompt ?? "");
  const [description, setDescription] = useState(product.description ?? "");
  const [fitProfile, setFitProfile] = useState<Record<string, unknown>>(
    product.fit_profile_json ?? {},
  );
  const [assetRole, setAssetRole] = useState<ProductAssetRole>("inspiration");

  const assetsQuery = useProductAssets(product.id);
  const variantsQuery = useProductVariants(product.id);
  const createAsset = useCreateProductAsset();
  const deleteAsset = useDeleteProductAsset();
  const importAsset = useImportProductAssetFromUrl();
  const createVariant = useCreateProductVariant();
  const deleteVariant = useDeleteProductVariant();

  const fileRef = useRef<HTMLInputElement>(null);
  const [variantName, setVariantName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSaveMeta() {
    try {
      await onSave({
        name: name.trim() || product.name,
        sku: sku.trim() || product.sku,
        slot,
        season: season.trim() || null,
        design_prompt: designPrompt.trim() || null,
        description: description.trim() || null,
        fit_profile_json: fitProfile,
      });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function uploadAssetFile(file: File) {
    setBusy(true);
    try {
      const normalized = await normalizeImageForUpload(file);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");
      const filename = makeUploadFilename(normalized.name);
      const path = buildStoragePath(user.id, product.id, filename);
      await uploadToBucket(PRODUCT_ASSETS_BUCKET, path, normalized);
      await createAsset.mutateAsync({
        product_id: product.id,
        asset_role: assetRole,
        file_url: path,
        storage_path: path,
      });
      toast.success("Asset uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUrlImport(input: { url: string }) {
    setBusy(true);
    try {
      await importAsset.mutateAsync({
        url: input.url,
        productId: product.id,
        assetRole,
      });
      toast.success("Imported from URL");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddVariant() {
    const label = variantName.trim();
    if (!label) return;
    try {
      const isFirst = (variantsQuery.data ?? []).length === 0;
      await createVariant.mutateAsync({
        product_id: product.id,
        name: label,
        is_default: isFirst,
      });
      setVariantName("");
      toast.success("Colorway added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Add variant failed");
    }
  }

  const assets = assetsQuery.data ?? [];
  const variants = variantsQuery.data ?? [];
  const disabled = readOnly || saving || busy;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <section className="space-y-4 rounded-md border border-border bg-card/30 p-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Concept details
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="product-sku" className="text-xs">
                SKU
              </Label>
              <Input
                id="product-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                disabled={disabled}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-slot" className="text-xs">
                Garment slot
              </Label>
              <Select
                value={slot}
                onValueChange={(v) => setSlot(v as ProductSlot)}
                disabled={disabled}
              >
                <SelectTrigger id="product-slot" className="h-9 text-sm">
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
            <Label htmlFor="product-name" className="text-xs">
              Name
            </Label>
            <Input
              id="product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={disabled}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-season" className="text-xs">
              Season
            </Label>
            <Input
              id="product-season"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="FW26, Runway Music, …"
              disabled={disabled}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-design-prompt" className="text-xs">
              Design prompt
            </Label>
            <Textarea
              id="product-design-prompt"
              value={designPrompt}
              onChange={(e) => setDesignPrompt(e.target.value)}
              rows={4}
              placeholder="Describe the garment concept — silhouette, materials, branding, vibe…"
              disabled={disabled}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-description" className="text-xs">
              Notes
            </Label>
            <Textarea
              id="product-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={disabled}
              className="text-sm"
            />
          </div>
          {!readOnly && (
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={handleSaveMeta}
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              Save details
            </Button>
          )}
        </section>

        <section className="space-y-4 rounded-md border border-border bg-card/30 p-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reference assets
          </h2>
          {!readOnly && (
            <div className="space-y-3">
              <ProductAssetRolePicker
                value={assetRole}
                onChange={setAssetRole}
                roles={assetRoles}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-4 w-4" />
                  Upload
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept={IMAGE_UPLOAD_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadAssetFile(f);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="min-w-[280px] flex-1">
                  <UrlImportPanel
                    label="Paste image URL"
                    onSubmit={handleUrlImport}
                    helpText="Inspiration pulls, mood boards, product photos, sketches."
                  />
                </div>
              </div>
            </div>
          )}
          {assetsQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square animate-pulse rounded-md border border-border bg-muted/30"
                />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No assets yet — upload inspiration, mood boards, or reference shots.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {assets.map((asset) => (
                <ProductAssetTile
                  key={asset.id}
                  asset={asset}
                  disabled={disabled}
                  onDelete={
                    readOnly
                      ? undefined
                      : () =>
                          deleteAsset.mutateAsync({
                            id: asset.id,
                            productId: product.id,
                          })
                  }
                />
              ))}
            </div>
          )}
        </section>

        <LogoPlacementEditor
          assets={assets}
          metadataJson={product.metadata_json ?? {}}
          disabled={disabled}
          onSave={async (placement) => {
            const details = upsertLogoProductDetail(
              resolveProductDetails(product.metadata_json ?? {}),
              placement,
            );
            await onSave({
              metadata_json: metadataWithProductDetails(
                product.metadata_json ?? {},
                details,
                placement,
              ),
            });
          }}
        />
      </div>

      <aside className="space-y-4">
        <section className="space-y-3 rounded-md border border-border bg-card/30 p-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Colorways
          </h2>
          {variants.length === 0 ? (
            <p className="text-xs text-muted-foreground">No variants yet.</p>
          ) : (
            <ul className="space-y-2">
              {variants.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-2 rounded-sm border border-border/60 px-2 py-1.5 text-xs"
                >
                  <span>
                    {v.name}
                    {v.is_default ? (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        (default)
                      </span>
                    ) : null}
                  </span>
                  {!readOnly && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-destructive"
                      disabled={disabled}
                      onClick={() =>
                        deleteVariant.mutateAsync({
                          id: v.id,
                          productId: product.id,
                        })
                      }
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!readOnly && (
            <div className="flex gap-2">
              <Input
                value={variantName}
                onChange={(e) => setVariantName(e.target.value)}
                placeholder="Black / gold, washed denim…"
                className="h-8 text-xs"
                disabled={disabled}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || !variantName.trim()}
                onClick={handleAddVariant}
              >
                Add
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-md border border-border bg-card/30 p-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Fit profile
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Structured garment behavior — used by Virtual Sample compose prompts and manufacturing.
          </p>
          <FitProfileEditor
            value={fitProfile}
            onChange={setFitProfile}
            disabled={disabled || readOnly}
          />
          {!readOnly && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                onSave({ fit_profile_json: fitProfile }).then(() => toast.success("Fit profile saved"))
              }
            >
              Save fit profile
            </Button>
          )}
        </section>
      </aside>
    </div>
  );
}
