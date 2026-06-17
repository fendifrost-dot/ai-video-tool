import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Factory } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { PRODUCT_ASSET_ROLE_LABELS } from "@/components/products/productTaxonomy";
import { FitProfileSummary } from "@/components/products/FitProfileEditor";
import { useProduct } from "@/lib/queries/products";
import { useProductAssets } from "@/lib/queries/productAssets";
import {
  useCreateTechPack,
  useManufacturingPackages,
  useRecordManufacturingPackage,
  useTechPacks,
} from "@/lib/queries/manufacturing";
import { supabase } from "@/lib/supabase";

export default function ProductManufacturingPage({ productId }: { productId: string }) {
  const productQuery = useProduct(productId);
  const assetsQuery = useProductAssets(productId);
  const techPacksQuery = useTechPacks(productId);
  const packagesQuery = useManufacturingPackages(productId);
  const createTechPack = useCreateTechPack();
  const recordPackage = useRecordManufacturingPackage();

  const product = productQuery.data;
  const techFlats = useMemo(
    () =>
      (assetsQuery.data ?? []).filter((a) =>
        a.asset_role.startsWith("tech_flat_"),
      ),
    [assetsQuery.data],
  );

  async function buildAndDownload() {
    if (!product) return;
    try {
      const zip = new JSZip();
      const manifest = {
        sku: product.sku,
        name: product.name,
        slot: product.slot,
        season: product.season,
        materials: product.materials_json,
        fit_profile: product.fit_profile_json,
        metadata: product.metadata_json,
        generated_at: new Date().toISOString(),
      };
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));
      zip.file("README.txt", `Manufacturing package for ${product.sku} — ${product.name}\n`);

      for (const asset of assetsQuery.data ?? []) {
        const path = asset.storage_path ?? asset.file_url;
        if (!path) continue;
        const { data, error } = await supabase.storage.from("product-assets").download(path);
        if (error || !data) continue;
        const ext = path.split(".").pop() || "jpg";
        const filename = `${asset.asset_role}.${ext}`;
        zip.file(`assets/${filename}`, data);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, `${product.sku}-manufacturing.zip`);

      let techPackId = techPacksQuery.data?.[0]?.id;
      if (!techPackId) {
        const pack = await createTechPack.mutateAsync({ productId });
        techPackId = pack.id;
      }
      await recordPackage.mutateAsync({
        productId,
        techPackId,
        packageJson: manifest,
      });
      toast.success("Manufacturing package downloaded and logged");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Package build failed");
    }
  }

  if (!product) {
    return (
      <>
        <PageHeader title="Manufacturing" />
        <div className="px-8 py-6 text-sm text-muted-foreground">Product not found.</div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Manufacturing — ${product.sku}`}
        subtitle="Tech flats, specs, and factory-ready export packages."
      />
      <div className="space-y-6 px-4 py-6 md:px-8">
        <Button asChild variant="outline" size="sm">
          <Link to="/products/$id" params={{ id: productId }}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Product detail
          </Link>
        </Button>

        <section className="rounded-md border border-border bg-card/30 p-4 space-y-3">
          <h2 className="text-sm font-semibold">Fit profile</h2>
          <FitProfileSummary value={product.fit_profile_json ?? {}} />
        </section>

        <section className="rounded-md border border-border bg-card/30 p-4 space-y-3">
          <h2 className="text-sm font-semibold">Tech flats</h2>
          {techFlats.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Upload tech flat assets on the product detail page (roles: tech flat front/back/side).
            </p>
          ) : (
            <ul className="text-xs space-y-1">
              {techFlats.map((a) => (
                <li key={a.id}>{PRODUCT_ASSET_ROLE_LABELS[a.asset_role]}</li>
              ))}
            </ul>
          )}
        </section>

        <Button
          type="button"
          onClick={buildAndDownload}
          disabled={createTechPack.isPending || recordPackage.isPending}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Build & download manufacturing package
        </Button>

        {(packagesQuery.data ?? []).length > 0 && (
          <section className="rounded-md border border-border bg-card/30 p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Factory className="h-4 w-4" />
              Package history
            </h2>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {(packagesQuery.data ?? []).map((p) => (
                <li key={p.id}>
                  {new Date(p.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
