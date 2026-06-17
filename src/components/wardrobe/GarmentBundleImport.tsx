import { useMemo, useRef, useState } from "react";
import { Images, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
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
  buildStoragePath,
  makeUploadFilename,
  uploadToBucket,
} from "@/lib/storage";
import {
  IMAGE_UPLOAD_ACCEPT,
  normalizeImageForUpload,
} from "@/lib/image-normalize";
import { supabase } from "@/lib/supabase";
import {
  ANGLE_LABELS,
  type AngleLabel,
  buildPrimaryReferenceImage,
  newReferenceImageId,
} from "@/lib/queries/referenceImages";
import {
  guessAngleFromFilename,
  sortRefsForVtonGarment,
} from "@/lib/garment/vtonReference";
import {
  type WardrobeFeatureType,
  useCreateWardrobeBundle,
} from "@/lib/queries/wardrobe";
import { WARDROBE_TAXONOMY } from "./wardrobeTaxonomy";

type StagedFile = {
  id: string;
  file: File;
  angle: AngleLabel;
};

/**
 * Import a full garment reference set (front flat, back, detail, on-model)
 * as ONE wardrobe item. References are sorted so front/flat is primary —
 * the VTON pipeline uses that image, not whichever uploaded first.
 */
export function GarmentBundleImport({
  artistId,
  featureType,
}: {
  artistId: string;
  featureType: WardrobeFeatureType;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const createBundle = useCreateWardrobeBundle();
  const [label, setLabel] = useState("");
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [open, setOpen] = useState(false);

  const sortedPreview = useMemo(() => {
    return sortRefsForVtonGarment(
      staged.map((s) => ({
        storage_path: s.file.name,
        angle: s.angle,
        label: s.file.name,
      })),
    ).map((r) => staged.find((s) => s.file.name === r.storage_path)!);
  }, [staged]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const additions: StagedFile[] = [];
    for (const file of Array.from(files)) {
      additions.push({
        id: newReferenceImageId(),
        file,
        angle: guessAngleFromFilename(file.name),
      });
    }
    setStaged((prev) => [...prev, ...additions]);
    setOpen(true);
  }

  function updateAngle(id: string, angle: AngleLabel) {
    setStaged((prev) => prev.map((s) => (s.id === id ? { ...s, angle } : s)));
  }

  function removeStaged(id: string) {
    setStaged((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleSubmit() {
    if (staged.length === 0) {
      toast.error("Add at least one image");
      return;
    }
    const garmentLabel =
      label.trim() ||
      staged[0].file.name.replace(/\.[^.]+$/, "").slice(0, 60) ||
      WARDROBE_TAXONOMY[featureType].label;

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      const ordered = sortRefsForVtonGarment(staged);
      const refs = [];
      for (const item of ordered) {
        const normalized = await normalizeImageForUpload(item.file);
        const filename = makeUploadFilename(normalized.name);
        const path = buildStoragePath(user.id, artistId, filename);
        await uploadToBucket("wardrobe-refs" as "wardrobe-refs", path, normalized);
        refs.push(
          buildPrimaryReferenceImage({
            url: path,
            storage_path: path,
            angle: item.angle,
          }),
        );
      }

      await createBundle.mutateAsync({
        artist_id: artistId,
        feature_type: featureType,
        label: garmentLabel,
        file_url: refs[0].url,
        storage_path: refs[0].storage_path,
        reference_images: refs,
        tags: ["bundle-import"],
        metadata_json: {
          bundle_import: true,
          angle_count: refs.length,
        },
      });

      toast.success(`Garment bundle added (${refs.length} angles)`);
      setStaged([]);
      setLabel("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bundle import failed");
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          disabled={createBundle.isPending}
        >
          <Images className="mr-1.5 h-4 w-4" />
          Import garment set
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_UPLOAD_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
        <span className="text-[11px] text-muted-foreground">
          Upload front flat + back + detail + on-model — VTON uses the front flat automatically.
        </span>
      </div>

      {open && staged.length > 0 && (
        <div className="space-y-3 border-t border-border pt-3">
          <div>
            <Label className="text-xs">Garment name</Label>
            <Input
              className="mt-1 h-8 text-sm"
              placeholder="e.g. Saint Laurent mastic jacket"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            {sortedPreview.map((item, idx) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-2 rounded-sm bg-muted/20 px-2 py-1.5 text-xs"
              >
                <span className="truncate font-medium max-w-[180px]">
                  {item.file.name}
                </span>
                {idx === 0 && (
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-200">
                    VTON primary
                  </span>
                )}
                <Select
                  value={item.angle}
                  onValueChange={(v) => updateAngle(item.id, v as AngleLabel)}
                >
                  <SelectTrigger className="h-7 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANGLE_LABELS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[10px]"
                  onClick={() => removeStaged(item.id)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={createBundle.isPending}
              onClick={handleSubmit}
            >
              {createBundle.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}
              Save bundle ({staged.length})
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setStaged([]);
                setOpen(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
