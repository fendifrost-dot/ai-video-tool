import { useEffect, useRef, useState } from "react";
import { Music, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export type StagedAudio = {
  file: File;
  durationSeconds: number | null;
};

export function AudioUploader({
  staged,
  onChange,
  uploadedUrl,
  uploadedName,
  disabled,
  onClearUploaded,
}: {
  staged: StagedAudio | null;
  onChange: (next: StagedAudio | null) => void;
  uploadedUrl?: string | null;
  uploadedName?: string | null;
  disabled?: boolean;
  onClearUploaded?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!staged) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(staged.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [staged]);

  async function handleFile(file: File) {
    const duration = await readAudioDuration(file).catch(() => null);
    onChange({ file, durationSeconds: duration });
  }

  // If already uploaded, show that. Otherwise show staged preview or empty state.
  if (uploadedUrl) {
    return (
      <div className="rounded-md border border-border bg-muted/20 p-4">
        <div className="flex items-center gap-3">
          <Music className="h-5 w-5 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{uploadedName ?? "Audio file"}</p>
            <p className="text-xs text-muted-foreground">Uploaded</p>
          </div>
          {onClearUploaded && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearUploaded}
              disabled={disabled}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <audio src={uploadedUrl} controls className="mt-3 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          <Upload className="mr-1.5 h-4 w-4" />
          {staged ? "Replace audio" : "Add audio file"}
        </Button>
        {staged && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange(null)}
            disabled={disabled}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Remove
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </div>

      {staged && previewUrl ? (
        <div className="rounded-md border border-border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Music className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{staged.file.name}</span>
            <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
              {formatSize(staged.file.size)}
              {staged.durationSeconds != null
                ? ` • ${formatDuration(staged.durationSeconds)}`
                : ""}
            </span>
          </div>
          <audio src={previewUrl} controls className="mt-2 w-full" />
          <p className="mt-2 text-xs text-muted-foreground">
            File will upload when you create the project.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          MP3, WAV, M4A, or any audio file. Up to 200 MB.
        </p>
      )}
    </div>
  );
}

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      URL.revokeObjectURL(url);
      if (Number.isFinite(d)) resolve(d);
      else reject(new Error("Couldn't read duration"));
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't decode audio"));
    };
    audio.src = url;
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
