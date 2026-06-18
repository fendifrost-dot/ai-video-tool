import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { signedUrl } from "@/lib/storage";
import type { ProductAsset } from "@/lib/queries/productAssets";
import {
  clampNormBbox,
  logoPlacementFromMetadata,
  parseLogoPlacement,
  type LogoPlacement,
  type LogoPlacementHint,
} from "@/lib/garment/logoPlacement";
import { PRODUCT_ASSET_ROLE_LABELS } from "@/components/products/productTaxonomy";

const PRODUCT_ASSETS_BUCKET = "product-assets";

const LOGO_ROLES = new Set(["detail", "logo_placement_experiment"]);

type DragState = {
  startX: number;
  startY: number;
  x: number;
  y: number;
  w: number;
  h: number;
} | null;

function normFromDrag(
  drag: NonNullable<DragState>,
  imgW: number,
  imgH: number,
): [number, number, number, number] {
  const x1 = Math.min(drag.startX, drag.x + drag.w);
  const y1 = Math.min(drag.startY, drag.y + drag.h);
  const x2 = Math.max(drag.startX, drag.x + drag.w);
  const y2 = Math.max(drag.startY, drag.y + drag.h);
  return clampNormBbox(x1 / imgW, y1 / imgH, (x2 - x1) / imgW, (y2 - y1) / imgH);
}

export function LogoPlacementEditor({
  assets,
  metadataJson,
  onSave,
  disabled,
}: {
  assets: ProductAsset[];
  metadataJson: Record<string, unknown>;
  onSave: (placement: LogoPlacement) => Promise<void>;
  disabled?: boolean;
}) {
  const frontAsset =
    assets.find((a) => a.asset_role === "front") ??
    assets.find((a) => a.asset_role === "tech_flat_front");
  const logoAssets = assets.filter((a) => LOGO_ROLES.has(a.asset_role));

  const existing = logoPlacementFromMetadata(metadataJson);
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [logoAssetId, setLogoAssetId] = useState<string>(
    existing?.logo_asset_id ?? logoAssets[0]?.id ?? "",
  );
  const [placementHint, setPlacementHint] = useState<LogoPlacementHint>(
    existing?.placement_hint ?? "upper_left_chest",
  );
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(
    existing?.source_bbox_norm ?? null,
  );
  const [drag, setDrag] = useState<DragState>(null);
  const [saving, setSaving] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const path = frontAsset?.storage_path ?? frontAsset?.file_url;
    if (!path) {
      setFrontUrl(null);
      return;
    }
    signedUrl(PRODUCT_ASSETS_BUCKET, path, 3600)
      .then(setFrontUrl)
      .catch(() => setFrontUrl(null));
  }, [frontAsset?.file_url, frontAsset?.storage_path]);

  const pointerToImage = useCallback((clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return { x, y, w: rect.width, h: rect.height };
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (disabled || !frontUrl) return;
    const pt = pointerToImage(e.clientX, e.clientY);
    if (!pt) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ startX: pt.x, startY: pt.y, x: pt.x, y: pt.y, w: 0, h: 0 });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const pt = pointerToImage(e.clientX, e.clientY);
    if (!pt) return;
    setDrag({
      ...drag,
      w: pt.x - drag.startX,
      h: pt.y - drag.startY,
    });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drag) return;
    const img = imgRef.current;
    if (!img) {
      setDrag(null);
      return;
    }
    const rect = img.getBoundingClientRect();
    const norm = normFromDrag(drag, rect.width, rect.height);
    if (norm[2] > 0.01 && norm[3] > 0.01) setBbox(norm);
    setDrag(null);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  async function handleSave() {
    if (!frontAsset) {
      toast.error("Upload a front flat asset first");
      return;
    }
    if (!bbox) {
      toast.error("Draw a box around the logo on the front flat");
      return;
    }
    const placement: LogoPlacement = {
      logo_asset_id: logoAssetId || null,
      front_asset_id: frontAsset.id,
      source_bbox_norm: bbox,
      target_region: "chest_band",
      placement_hint: placementHint,
      target_bbox_norm: existing?.target_bbox_norm ?? null,
    };
    const parsed = parseLogoPlacement(placement);
    if (!parsed) {
      toast.error("Invalid placement");
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed);
      toast.success("Logo placement saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const displayBbox = drag && imgRef.current
    ? normFromDrag(
        drag,
        imgRef.current.getBoundingClientRect().width,
        imgRef.current.getBoundingClientRect().height,
      )
    : bbox;

  return (
    <section className="space-y-3 rounded-md border border-border bg-card/30 p-4">
      <div>
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Logo placement
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Draw the logo region on the front flat. Post-VTON composites real logo pixels onto the chest band.
        </p>
      </div>

      {!frontAsset ? (
        <p className="text-xs text-muted-foreground">
          Upload a <strong>front</strong> flat asset to define logo placement.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Logo PNG (optional)</Label>
              <Select
                value={logoAssetId || "__crop__"}
                onValueChange={(v) => setLogoAssetId(v === "__crop__" ? "" : v)}
                disabled={disabled || logoAssets.length === 0}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Crop from front bbox" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__crop__">Crop from front bbox</SelectItem>
                  {logoAssets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {PRODUCT_ASSET_ROLE_LABELS[a.asset_role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Upload a transparent PNG as <em>detail</em> or <em>logo placement</em> for best results.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Target hint</Label>
              <Select
                value={placementHint}
                onValueChange={(v) => setPlacementHint(v as LogoPlacementHint)}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upper_left_chest">Upper-left chest band</SelectItem>
                  <SelectItem value="center_chest">Center chest band</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            ref={containerRef}
            className="relative max-w-md overflow-hidden rounded-md border border-border bg-muted/20 touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {frontUrl ? (
              <>
                <img
                  ref={imgRef}
                  src={frontUrl}
                  alt="Front flat"
                  className="block w-full select-none"
                  draggable={false}
                />
                {displayBbox ? (
                  <div
                    className="pointer-events-none absolute border-2 border-primary bg-primary/20"
                    style={{
                      left: `${displayBbox[0] * 100}%`,
                      top: `${displayBbox[1] * 100}%`,
                      width: `${displayBbox[2] * 100}%`,
                      height: `${displayBbox[3] * 100}%`,
                    }}
                  />
                ) : null}
              </>
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center text-xs text-muted-foreground">
                Loading front…
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Drag on the image to mark the logo area (e.g. Saint Laurent wordmark on the navy stripe).
          </p>
        </>
      )}

      {!disabled && frontAsset ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving || !bbox}
          onClick={handleSave}
        >
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Save logo placement
        </Button>
      ) : null}
    </section>
  );
}
