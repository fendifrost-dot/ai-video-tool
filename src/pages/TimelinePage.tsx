import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, ArrowDown, ArrowUp, Film, RefreshCw, RotateCcw, Save } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useProject } from "@/lib/queries/projects";
import { useProjectShots } from "@/lib/queries/shots";
import { useProjectAssets } from "@/lib/queries/projectAssets";
import { useProjectStoryboard } from "@/lib/queries/storyboards";
import { useSongAnalysis } from "@/lib/queries/songAnalyses";
import {
  useCreateTimelineManifest,
  usePersistTimelineManifestSnapshot,
  useProjectTimelineManifests,
  useTimelineManifest,
} from "@/lib/queries/timelineManifests";
import {
  useReorderTimelineItems,
  useResetTimelineItems,
  useSeedTimelineItems,
  useTimelineItems,
  useUpdateTimelineItem,
} from "@/lib/queries/timelineItems";
import type { CutType } from "@/lib/timeline/types";

const CUT_TYPES: CutType[] = [
  "hard_cut",
  "crossfade",
  "flash",
  "whip",
  "glitch",
  "match_cut",
];

export default function TimelinePage({ projectId }: { projectId: string }) {
  const projectQuery = useProject(projectId);
  const manifestsQuery = useProjectTimelineManifests(projectId);
  const createManifest = useCreateTimelineManifest();
  const [manifestId, setManifestId] = useState<string | null>(null);

  const manifestQuery = useTimelineManifest(manifestId ?? undefined);
  const itemsQuery = useTimelineItems(manifestId ?? undefined);
  const shotsQuery = useProjectShots(projectId);
  const assetsQuery = useProjectAssets(projectId);
  const storyboardQuery = useProjectStoryboard(projectId);
  const songQuery = useSongAnalysis(projectId);
  const seedItems = useSeedTimelineItems();
  const updateItem = useUpdateTimelineItem();
  const reorderItems = useReorderTimelineItems();
  const resetItems = useResetTimelineItems();
  const persistSnapshot = usePersistTimelineManifestSnapshot();

  useEffect(() => {
    const list = manifestsQuery.data;
    if (!list?.length) return;
    if (!manifestId) setManifestId(list[0]!.id);
  }, [manifestsQuery.data, manifestId]);

  const sortedItems = useMemo(
    () =>
      [...(itemsQuery.data ?? [])].sort(
        (a, b) => a.track.localeCompare(b.track) || a.item_order - b.item_order,
      ),
    [itemsQuery.data],
  );

  async function handleCreateManifest() {
    try {
      const row = await createManifest.mutateAsync({
        project_id: projectId,
        song_analysis_id: songQuery.data?.id ?? null,
        title: "Main cut",
      });
      setManifestId(row.id);
      toast.success("Timeline manifest created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create manifest");
    }
  }

  async function handleSeed() {
    if (!manifestId || !manifestQuery.data) return;
    try {
      await seedItems.mutateAsync({
        manifestId,
        projectId,
        frameRate: manifestQuery.data.frame_rate,
        nodes: storyboardQuery.data?.nodes ?? [],
        shots: shotsQuery.data ?? [],
        assets: assetsQuery.data ?? [],
      });
      toast.success("Timeline seeded from storyboard or shots");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Seed failed");
    }
  }

  async function handleReset() {
    if (!manifestId || !manifestQuery.data) return;
    try {
      await resetItems.mutateAsync({ manifestId });
      await seedItems.mutateAsync({
        manifestId,
        projectId,
        frameRate: manifestQuery.data.frame_rate,
        nodes: storyboardQuery.data?.nodes ?? [],
        shots: shotsQuery.data ?? [],
        assets: assetsQuery.data ?? [],
      });
      toast.success("Timeline reset and regenerated from storyboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    }
  }

  async function handleSaveSnapshot() {
    if (!manifestId || !projectQuery.data || !manifestQuery.data) return;
    try {
      await persistSnapshot.mutateAsync({
        manifestRow: manifestQuery.data,
        project: projectQuery.data,
        items: itemsQuery.data ?? [],
        songAnalysis: songQuery.data ?? null,
        nodes: storyboardQuery.data?.nodes ?? [],
        shots: shotsQuery.data ?? [],
        assets: assetsQuery.data ?? [],
      });
      toast.success("Manifest snapshot saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function moveItem(id: string, direction: -1 | 1) {
    if (!manifestId) return;
    const ids = sortedItems.map((i) => i.id);
    const idx = ids.indexOf(id);
    const swap = idx + direction;
    if (swap < 0 || swap >= ids.length) return;
    [ids[idx], ids[swap]] = [ids[swap]!, ids[idx]!];
    try {
      await reorderItems.mutateAsync({ manifestId, orderedIds: ids });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reorder failed");
    }
  }

  if (projectQuery.isLoading) {
    return (
      <>
        <PageHeader title="Music Video Editor" />
        <div className="px-8 py-6">
          <div className="h-24 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Music Video Editor"
        subtitle="Edit frame-based cuts. Rows are source of truth — JSON regenerates on save."
      />
      <div className="space-y-6 px-8 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/projects/$id/export" params={{ id: projectId }}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Export
            </Link>
          </Button>
          {!manifestsQuery.data?.length ? (
            <Button type="button" size="sm" onClick={handleCreateManifest}>
              <Film className="mr-1.5 h-4 w-4" />
              Create timeline
            </Button>
          ) : (
            <Select value={manifestId ?? undefined} onValueChange={setManifestId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Manifest" />
              </SelectTrigger>
              <SelectContent>
                {(manifestsQuery.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.title ?? m.id.slice(0, 8)} ({m.aspect_ratio ?? "16:9"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {manifestId && (
            <>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleSeed}
                disabled={seedItems.isPending || (itemsQuery.data?.length ?? 0) > 0}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Seed from storyboard / shots
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveSnapshot}
                disabled={persistSnapshot.isPending}
              >
                <Save className="mr-1.5 h-4 w-4" />
                Save manifest snapshot
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      resetItems.isPending ||
                      seedItems.isPending ||
                      (itemsQuery.data?.length ?? 0) === 0
                    }
                  >
                    <RotateCcw className="mr-1.5 h-4 w-4" />
                    Reset timeline
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Timeline</AlertDialogTitle>
                    <AlertDialogDescription>
                      This clears all timeline_items for this project and you'll
                      regenerate from storyboard. Are you sure?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReset}>
                      Reset
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>

        {manifestQuery.data && (
          <p className="text-xs text-muted-foreground">
            {manifestQuery.data.frame_rate} fps · {manifestQuery.data.resolution} · v
            {manifestQuery.data.version_number}
            {manifestQuery.data.duration_frames != null &&
              ` · ${manifestQuery.data.duration_frames} frames`}
          </p>
        )}

        {!manifestId && (
          <p className="text-sm text-muted-foreground">
            Create a timeline manifest to start editing. Seed uses storyboard nodes when present,
            otherwise shots by shot number.
          </p>
        )}

        {manifestId && sortedItems.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No items yet — use Seed from storyboard / shots (empty timeline only).
          </p>
        )}

        <ul className="space-y-3">
          {sortedItems.map((item) => (
            <li
              key={item.id}
              className="rounded-md border border-border bg-card/30 p-4 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-xs text-muted-foreground">
                    #{item.item_order} · {item.start_frame}→{item.end_frame}f
                  </span>
                  {item.song_section && (
                    <span className="ml-2 text-xs">{item.song_section}</span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => moveItem(item.id, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => moveItem(item.id, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label className="text-xs">Cut type</Label>
                  <Select
                    value={item.cut_type ?? "hard_cut"}
                    onValueChange={(v) =>
                      updateItem.mutate({
                        id: item.id,
                        manifestId,
                        patch: { cut_type: v as CutType },
                      })
                    }
                  >
                    <SelectTrigger className="mt-1 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CUT_TYPES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">End frame</Label>
                  <input
                    type="number"
                    className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs"
                    defaultValue={item.end_frame}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isNaN(v))
                        updateItem.mutate({
                          id: item.id,
                          manifestId,
                          patch: { end_frame: v },
                        });
                    }}
                  />
                </div>
                <label className="flex items-end gap-2 pb-1">
                  <Checkbox
                    checked={item.approved}
                    onCheckedChange={(c) =>
                      updateItem.mutate({
                        id: item.id,
                        manifestId,
                        patch: { approved: c === true },
                      })
                    }
                  />
                  <span className="text-xs">Locked in cut</span>
                </label>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
