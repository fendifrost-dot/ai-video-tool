import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import type {
  Json,
  ProjectAssetType,
} from "@/integrations/supabase/aliases";
import {
  bucketForAssetType,
  guessAssetType,
  PROJECT_ASSET_TYPE_OPTIONS,
  readVideoDuration,
  useCreateProjectAsset,
} from "@/lib/queries/projectAssets";
import {
  buildStoragePath,
  makeUploadFilename,
  uploadToBucket,
} from "@/lib/storage";
import { normalizeImageForUpload } from "@/lib/image-normalize";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StagedFile = {
  file: File;
  assetType: ProjectAssetType;
};

export function AssetUploadDropzone({
  projectId,
  shotId,
  onUploaded,
}: {
  projectId: string;
  shotId?: string;
  onUploaded?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const create = useCreateProjectAsset();

  async function stageFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    // Materialise each File into an in-memory copy (fresh File backed by an
    // ArrayBuffer) inside the same async tick. The input's `value=""` reset
    // that follows the change event can detach the underlying file source
    // for File objects injected by browser-automation tools — once detached,
    // file.arrayBuffer() at upload time hangs forever with no error. Reading
    // bytes here, while the source is still live, sidesteps the issue.
    const incoming = Array.from(files);
    const captured: StagedFile[] = await Promise.all(
      incoming.map(async (file) => {
        const bytes = await file.arrayBuffer();
        return {
          file: new File([bytes], file.name, { type: file.type }),
          assetType: guessAssetType(file),
        };
      }),
    );
    setStaged((prev) => [...prev, ...captured]);
  }

  function updateType(index: number, type: ProjectAssetType) {
    setStaged((prev) => prev.map((s, i) => (i === index ? { ...s, assetType: type } : s)));
  }

  function removeStaged(index: number) {
    setStaged((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    void stageFiles(e.dataTransfer.files);
  }

  async function handleUpload() {
    if (staged.length === 0) return;
    setUploading(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      let succeeded = 0;
      let failed = 0;

      for (const item of staged) {
        try {
          const file = await normalizeImageForUpload(item.file);
          const bucket = bucketForAssetType(item.assetType);
          const filename = makeUploadFilename(file.name);
          const path = shotId
            ? buildStoragePath(user.id, projectId, shotId, filename)
            : buildStoragePath(user.id, projectId, filename);

          await uploadToBucket(bucket, path, file);

          const metadata: Record<string, unknown> = {
            original_filename: file.name,
            size_bytes: file.size,
            mime_type: file.type,
          };

          if (file.type.startsWith("video/")) {
            try {
              metadata.duration_seconds = await readVideoDuration(file);
            } catch {
              /* duration unread — non-fatal */
            }
          }

          await create.mutateAsync({
            project_id: projectId,
            shot_id: shotId ?? undefined,
            asset_type: item.assetType,
            file_url: path,
            source_tool: "manual",
            approval_status: "pending",
            metadata_json: metadata as Json,
          });

          succeeded++;
        } catch (err) {
          failed++;
          console.error("Asset upload failed:", err);
        }
      }

      if (succeeded > 0) {
        toast.success(`Uploaded ${succeeded} ${succeeded === 1 ? "asset" : "assets"}`);
      }
      if (failed > 0) {
        toast.error(`${failed} upload${failed === 1 ? "" : "s"} failed`);
      }
      setStaged([]);
      onUploaded?.();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-md border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-card/30 hover:border-border/70"
        }`}
      >
        <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm">
          Drop files here, or <span className="text-primary">click to choose</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Images, videos, LUTs, overlays, exports. Up to 500 MB per file.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={async (e) => {
            // Stage (which materialises bytes) MUST complete before we clear
            // the input value, otherwise the File's backing source can detach
            // and later .arrayBuffer() calls will hang.
            await stageFiles(e.target.files);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </div>

      {staged.length > 0 && (
        <div className="space-y-2 rounded-md border border-border bg-card/30 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {staged.length} ready to upload
            </h3>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStaged([])}
                disabled={uploading}
              >
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading ? "Uploading..." : `Upload ${staged.length}`}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            {staged.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md bg-muted/20 px-2 py-1.5 text-sm"
              >
                <span className="truncate flex-1">{s.file.name}</span>
                <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                  {formatSize(s.file.size)}
                </span>
                <div className="w-44">
                  <AssetTypeSelect
                    value={s.assetType}
                    onChange={(v) => updateType(i, v)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeStaged(i)}
                  disabled={uploading}
                  className="rounded-sm p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                  aria-label="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AssetTypeSelect({
  value,
  onChange,
}: {
  value: ProjectAssetType;
  onChange: (next: ProjectAssetType) => void;
}) {
  const groups: Record<string, typeof PROJECT_ASSET_TYPE_OPTIONS> = {};
  for (const opt of PROJECT_ASSET_TYPE_OPTIONS) {
    (groups[opt.group] ??= []).push(opt);
  }
  const labels: Record<string, string> = {
    input: "Inputs",
    generated: "Generated",
    edit: "Edit assets",
    export: "Exports",
  };

  return (
    <Select value={value} onValueChange={(v) => onChange(v as ProjectAssetType)}>
      <SelectTrigger className="h-7 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(groups).map(([groupKey, options]) => (
          <SelectGroup key={groupKey}>
            <SelectLabel>{labels[groupKey] ?? groupKey}</SelectLabel>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
