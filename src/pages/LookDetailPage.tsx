import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  Check,
  Copy,
  Edit3,
  GitBranch,
  Layers,
  Loader2,
  Lock,
  Save,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { signedUrls } from "@/lib/storage";
import {
  getCanonicalBaseImageUrl,
  useArtist,
  useSetArtistCanonicalBase,
} from "@/lib/queries/artists";
import { useCharacterFeatures } from "@/lib/queries/characterFeatures";
import { useWardrobe } from "@/lib/queries/wardrobe";
import { useLocations } from "@/lib/queries/locations";
import { useProps } from "@/lib/queries/props";
import {
  callComposeLook,
  formatCost,
  getLookPublicImageUrl,
  looksKeys,
  pollArtistLook,
  signLookPreviewUrl,
  useDeleteLook,
  useLook,
  useLockLookAsPrimary,
  useLookIterations,
  useUpdateLook,
} from "@/lib/queries/looks";
import { AssetThumb } from "@/components/looks/AssetThumb";
import { LookCardPendingSkeleton, StatusPill } from "@/components/looks/LookCard";

export default function LookDetailPage({
  artistId,
  lookId,
}: {
  artistId: string;
  lookId: string;
}) {
  const navigate = useNavigate();
  const [layerItemId, setLayerItemId] = useState("");
  const [layerBusy, setLayerBusy] = useState(false);
  const qc = useQueryClient();
  const artistQuery = useArtist(artistId);
  const lookQuery = useLook(lookId);
  const featuresQuery = useCharacterFeatures(artistId);
  const wardrobeQuery = useWardrobe(artistId);
  const locationsQuery = useLocations();
  const propsQuery = useProps();
  const iterationsQuery = useLookIterations(lookId);
  const update = useUpdateLook();
  const lock = useLockLookAsPrimary();
  const del = useDeleteLook();
  const setCanonicalBase = useSetArtistCanonicalBase();

  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [signed, setSigned] = useState<string | null>(null);
  // Live pending-poll progress, populated while this look is generating
  // in the background. Cleared on terminal status or unmount.
  const [pollProgress, setPollProgress] = useState<{
    elapsedSec: number;
    status: string;
  } | null>(null);

  useEffect(() => {
    if (!lookQuery.data) return;
    setNameDraft(lookQuery.data.name);
    setNotesDraft(lookQuery.data.notes ?? "");
  }, [lookQuery.data]);

  useEffect(() => {
    if (!lookQuery.data?.generated_storage_path) {
      setSigned(null);
      return;
    }
    const path = lookQuery.data.generated_storage_path;
    signedUrls("look-composites" as any, [path], 3600)
      .then((m) => setSigned(m[path] ?? null))
      .catch(() => setSigned(null));
  }, [lookQuery.data?.generated_storage_path]);

  // Background poll while the look is generating. The LookComposer
  // navigates here immediately after kicking off the pipeline, so this
  // page owns the wait-loop. On terminal status we update the react-query
  // caches in place so the rest of the UI re-renders without a refetch.
  useEffect(() => {
    const look = lookQuery.data;
    if (!look || look.status !== "pending") {
      setPollProgress(null);
      return;
    }
    const controller = new AbortController();
    setPollProgress({ elapsedSec: 0, status: "pending" });
    pollArtistLook(look.id, {
      signal: controller.signal,
      onTick: ({ elapsedMs, status }) => {
        setPollProgress({
          elapsedSec: Math.floor(elapsedMs / 1000),
          status,
        });
      },
    })
      .then((finalLook) => {
        setPollProgress(null);
        qc.setQueryData(looksKeys.detail(finalLook.id), finalLook);
        qc.invalidateQueries({ queryKey: looksKeys.forArtist(finalLook.artist_id) });
        if (finalLook.status === "complete") {
          toast.success(
            `Look generated — ${finalLook.pipeline_used ?? "unknown"} pipeline, ${formatCost(finalLook.cost_cents)}`,
          );
        }
      })
      .catch((err: any) => {
        setPollProgress(null);
        if (err?.message === "aborted") return;
        toast.error(err instanceof Error ? err.message : "Pipeline failed");
      });
    return () => controller.abort();
  }, [lookQuery.data?.id, lookQuery.data?.status, qc]);

  if (lookQuery.isLoading) {
    return (
      <>
        <PageHeader title="Look" />
        <div className="px-8 py-6">
          <div className="h-64 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  if (lookQuery.error || !lookQuery.data) {
    return (
      <>
        <PageHeader title="Look" />
        <div className="px-8 py-6">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Look not found.
          </div>
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link to="/artists/$id/looks" params={{ id: artistId }}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                All looks
              </Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  const look = lookQuery.data;
  const recipe = look.composition_recipe_json;
  const isPending = look.status === "pending";
  // Canonical-base state. `publicImageUrl` is the Fal-hosted URL we'd write
  // into identity_profile_json if Fendi taps the button. When null the
  // look has no persistent URL (only a signed Supabase one) and the
  // affordance disables itself with an inline explanation.
  const publicImageUrl = getLookPublicImageUrl(look);
  const currentCanonical = getCanonicalBaseImageUrl(artistQuery.data);
  const isCurrentCanonical =
    !!publicImageUrl && currentCanonical === publicImageUrl;
  // Pipeline label: prefer the actual `pipeline_used` once the callback
  // fills it in, otherwise fall back to the preference stored on the recipe
  // at insert time (proxy sets `pipeline_preference` even for pending rows).
  const pipelinePreference = (recipe as any)?.pipeline_preference as
    | string
    | undefined;
  const pipelineLabel =
    look.pipeline_used ??
    (pipelinePreference ? `${pipelinePreference} · pending` : null);


  async function handleApplyIdentity() {
    if (!look) return;
    setLayerBusy(true);
    try {
      let canvasUrl =
        publicImageUrl && publicImageUrl.startsWith("https://")
          ? publicImageUrl
          : null;
      if (!canvasUrl) {
        const path = look.generated_storage_path ?? look.generated_image_url;
        if (path) canvasUrl = await signLookPreviewUrl(path, 3600);
      }
      if (!canvasUrl) {
        toast.error("Couldn't resolve this look's image URL for the canvas.");
        return;
      }
      // Route through compose-look-proxy's identity_inpaint pipeline (NOT the
      // legacy faceswap-proxy / Fal face-swap). identity_inpaint is what the
      // proxy special-cases to inject the FENDIFROST identity LoRA
      // (IDENTITY_LORA_URL + "FENDIFROST" trigger, wired in 294c20f) and run
      // the masked identity inpaint over the locked canvas. The face-swap path
      // bypassed that LoRA entirely and produced generic graft output.
      const result = await callComposeLook({
        artistId,
        wardrobeFeatureIds: [],
        basePrompt:
          "Apply the artist's canonical identity to the subject's face and head. Keep the outfit, pose, lighting, framing, and background exactly as they are.",
        pipelinePreference: "identity_inpaint",
        parentLookId: look.id,
        name: `${(look.name ?? "Look").slice(0, 64)} · my identity`,
        canvasImageUrl: canvasUrl,
      });
      qc.invalidateQueries({ queryKey: looksKeys.forArtist(artistId) });
      toast.success("Identity inpaint queued — opening the new look");
      navigate({
        to: "/artists/$id/looks/$lookId",
        params: { id: artistId, lookId: result.look_id },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Identity swap failed");
    } finally {
      setLayerBusy(false);
    }
  }

  async function handleAddLayer() {
    if (!look || !layerItemId) return;
    const item = (wardrobeQuery.data ?? []).find((w) => w.id === layerItemId);
    if (!item) return;
    setLayerBusy(true);
    try {
      // The canvas must be a fetchable https URL. generated_image_url is
      // often a storage PATH (the callback stores paths) — sign it.
      let canvasUrl =
        publicImageUrl && publicImageUrl.startsWith("https://")
          ? publicImageUrl
          : null;
      if (!canvasUrl) {
        const path = look.generated_storage_path ?? look.generated_image_url;
        if (path) canvasUrl = await signLookPreviewUrl(path, 3600);
      }
      if (!canvasUrl) {
        toast.error("Couldn't resolve this look's image URL for the canvas.");
        return;
      }
      const result = await callComposeLook({
        artistId,
        wardrobeFeatureIds: [layerItemId],
        basePrompt: `Layer pass: dress the subject in ${item.label}. Keep the face, pose, lighting, background, and all other garments exactly as they are.`,
        pipelinePreference: "lora_segmented_inpaint",
        parentLookId: look.id,
        name: `${(look.name ?? "Look").slice(0, 56)} + ${item.label}`.slice(0, 80),
        canvasImageUrl: canvasUrl,
      });
      toast.success("Layer queued — opening the new look");
      setLayerItemId("");
      navigate({
        to: "/artists/$id/looks/$lookId",
        params: { id: artistId, lookId: result.look_id },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Layer generation failed");
    } finally {
      setLayerBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={look.name}
        subtitle={
          artistQuery.data
            ? `${artistQuery.data.name} · look ${look.iterations > 1 ? `v${look.iterations}` : ""}`
            : undefined
        }
      />
      <div className="space-y-6 px-8 py-6">
        <div className="flex items-center justify-between">
          <Button asChild variant="outline" size="sm">
            <Link to="/artists/$id/looks" params={{ id: artistId }}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              All looks
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            {isCurrentCanonical && (
              <span
                className="flex items-center gap-1 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400"
                title="Saved as the artist's canonical base identity photo"
              >
                <Star className="h-2.5 w-2.5 fill-current" />
                Canonical base
              </span>
            )}
            <StatusPill status={look.status} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* ===================== LEFT — preview ===================== */}
          <div className="space-y-4">
            <div className="overflow-hidden rounded-md border border-border bg-card/30 p-2">
              {signed ? (
                <img
                  src={signed}
                  alt={look.name}
                  className="mx-auto max-h-[600px] rounded-sm object-contain"
                />
              ) : isPending ? (
                <div className="h-[600px] w-full overflow-hidden rounded-sm">
                  <LookCardPendingSkeleton
                    caption={
                      pollProgress
                        ? `Composing… ${pollProgress.elapsedSec}s · ${pollProgress.status}`
                        : "Composing…"
                    }
                  />
                </div>
              ) : (
                <div className="flex h-[600px] items-center justify-center text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading image…
                </div>
              )}
            </div>

            <RecipePanel
              recipe={recipe}
              artistId={artistId}
              features={featuresQuery.data ?? []}
              wardrobe={wardrobeQuery.data ?? []}
              locations={locationsQuery.data ?? []}
              props={propsQuery.data ?? []}
            />
          </div>

          {/* ===================== RIGHT — meta + actions ============= */}
          <aside className="space-y-3">
            <div className="rounded-md border border-border bg-card/30 p-4">
              <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Details
              </h2>
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Name
                    </Label>
                    <Input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Notes
                    </Label>
                    <Textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      rows={3}
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          await update.mutateAsync({
                            id: look.id,
                            artistId,
                            patch: {
                              name: nameDraft.trim() || look.name,
                              notes: notesDraft.trim() || undefined,
                            },
                          });
                          toast.success("Saved");
                          setEditing(false);
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Save failed");
                        }
                      }}
                      disabled={update.isPending}
                    >
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pipeline</span>
                    <span className="font-mono text-[10px]">{pipelineLabel ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cost</span>
                    <span className="font-mono">{formatCost(look.cost_cents)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Iterations</span>
                    <span className="font-mono">v{look.iterations}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-mono text-[10px]">
                      {new Date(look.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {look.notes && (
                    <div className="border-t border-border pt-2">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Notes
                      </span>
                      <p className="mt-1 whitespace-pre-wrap text-xs">{look.notes}</p>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full"
                    onClick={() => setEditing(true)}
                  >
                    <Edit3 className="mr-1.5 h-3 w-3" />
                    Edit details
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-md border border-border bg-card/30 p-4">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </h2>
              {isPending && (
                <>
                  <p className="flex items-start gap-1.5 rounded-sm bg-muted/40 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                    <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" />
                    Generating — these actions will become available when the
                    look completes.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={del.isPending}
                    onClick={async () => {
                      // Cancel = delete the pending placeholder row. The
                      // background pipeline may still finish server-side
                      // (callback will be a no-op once the row is gone),
                      // but the UI immediately stops polling and returns
                      // the user to the looks list.
                      if (
                        !confirm(
                          "Cancel this generation? The pending look will be removed.",
                        )
                      ) {
                        return;
                      }
                      try {
                        await del.mutateAsync({ id: look.id, artistId });
                        toast.success("Generation cancelled");
                        navigate({
                          to: "/artists/$id/looks",
                          params: { id: artistId },
                        });
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Cancel failed",
                        );
                      }
                    }}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Cancel generation
                  </Button>
                </>
              )}
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant={look.status === "approved" ? "secondary" : "outline"}
                  onClick={async () => {
                    try {
                      await update.mutateAsync({
                        id: look.id,
                        artistId,
                        patch: { status: "approved" },
                      });
                      toast.success("Approved");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Approve failed");
                    }
                  }}
                  disabled={
                    isPending ||
                    look.status === "approved" ||
                    look.status === "locked" ||
                    update.isPending
                  }
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant={look.status === "locked" ? "secondary" : "default"}
                  onClick={async () => {
                    try {
                      await lock.mutateAsync({ id: look.id, artistId });
                      toast.success("Locked as primary look");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Lock failed");
                    }
                  }}
                  disabled={isPending || look.status === "locked" || lock.isPending}
                >
                  <Lock className="mr-1.5 h-3.5 w-3.5" />
                  Lock as primary
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await update.mutateAsync({
                        id: look.id,
                        artistId,
                        patch: { status: "archived" },
                      });
                      toast.success("Archived");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Archive failed");
                    }
                  }}
                  disabled={isPending || look.status === "archived" || update.isPending}
                >
                  <Archive className="mr-1.5 h-3.5 w-3.5" />
                  Archive
                </Button>
                {/* Delete — destructive, mobile-friendly tap target.
                    Blocked when this look is the canonical base (clear it
                    on the panel below before deleting). */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[44px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={isPending || isCurrentCanonical || del.isPending}
                  title={
                    isCurrentCanonical
                      ? "This is the artist's canonical base. Clear it first."
                      : undefined
                  }
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  {isCurrentCanonical ? "Delete (clear canonical first)" : "Delete look"}
                </Button>
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-border bg-card/30 p-4">
              <h2 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Star className="h-3 w-3" />
                Canonical base
              </h2>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {isCurrentCanonical
                  ? "This look is the saved identity photo. Compose-look will short-circuit Stage 1 and reuse this image."
                  : "Use this look as the locked identity photo for the canonical_base pipeline."}
              </p>
              {isCurrentCanonical ? (
                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full min-h-[44px] justify-start"
                    disabled
                  >
                    <Star className="mr-1.5 h-3.5 w-3.5 fill-current" />
                    Currently canonical base
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full min-h-[44px] text-muted-foreground hover:text-destructive"
                    disabled={setCanonicalBase.isPending}
                    onClick={async () => {
                      try {
                        await setCanonicalBase.mutateAsync({
                          artistId,
                          imageUrl: null,
                        });
                        toast.success("Cleared canonical base");
                      } catch (err) {
                        toast.error(
                          err instanceof Error
                            ? err.message
                            : "Clear failed",
                        );
                      }
                    }}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Clear
                  </Button>
                </div>
              ) : !publicImageUrl ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full min-h-[44px]"
                    disabled
                  >
                    <Star className="mr-1.5 h-3.5 w-3.5" />
                    Save as canonical base
                  </Button>
                  <p className="text-[10px] leading-snug text-muted-foreground/70">
                    This look only has a signed Supabase URL which would
                    expire. Re-generate to get a persistent Fal URL before
                    setting it as canonical.
                  </p>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="default"
                  className="w-full min-h-[44px]"
                  disabled={isPending || setCanonicalBase.isPending}
                  onClick={async () => {
                    try {
                      await setCanonicalBase.mutateAsync({
                        artistId,
                        imageUrl: publicImageUrl,
                      });
                      toast.success("Saved as canonical base");
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : "Save failed",
                      );
                    }
                  }}
                >
                  <Star className="mr-1.5 h-3.5 w-3.5" />
                  Save as canonical base
                </Button>
              )}
            </div>

            <div className="space-y-2 rounded-md border border-primary/40 bg-card/30 p-4">
              <h2 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Layers className="h-3 w-3" />
                Add layer
              </h2>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Locks this exact image as the canvas and inpaints ONE new
                garment on top. Approve the result, then layer the next piece.
              </p>
              <select
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
                value={layerItemId}
                onChange={(e) => setLayerItemId(e.target.value)}
                disabled={layerBusy}
              >
                <option value="">Pick a garment…</option>
                {(wardrobeQuery.data ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label} ({w.feature_type.replace("wardrobe_", "")})
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                className="w-full"
                disabled={
                  !layerItemId || layerBusy || isPending || look.status !== "complete"
                }
                onClick={handleAddLayer}
              >
                {layerBusy ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Layers className="mr-1.5 h-3.5 w-3.5" />
                )}
                Generate layer (~$0.09)
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={layerBusy || isPending || look.status !== "complete"}
                onClick={handleApplyIdentity}
                title="Identity inpaint re-renders the face/head with your FENDIFROST identity LoRA over a locked canvas. Outfit, pose, and lighting stay fixed. Use on imported stand-in canvases."
              >
                {layerBusy ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Apply my identity (~$0.09)
              </Button>
            </div>

            <div className="space-y-2 rounded-md border border-border bg-card/30 p-4">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Iterate
              </h2>
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link
                  to="/artists/$id/looks/new"
                  params={{ id: artistId }}
                  search={{ parentLookId: look.id } as any}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Duplicate / iterate
                </Link>
              </Button>
            </div>

            {iterationsQuery.data && iterationsQuery.data.length > 0 && (
              <div className="space-y-2 rounded-md border border-border bg-card/30 p-4">
                <h2 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <GitBranch className="h-3 w-3" />
                  Children ({iterationsQuery.data.length})
                </h2>
                <div className="space-y-1">
                  {iterationsQuery.data.map((child) => (
                    <Link
                      key={child.id}
                      to="/artists/$id/looks/$lookId"
                      params={{ id: artistId, lookId: child.id }}
                      className="flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-xs hover:bg-muted/30"
                    >
                      <span className="truncate">{child.name}</span>
                      <StatusPill status={child.status} />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {look.parent_look_id && (
              <div className="rounded-md border border-border bg-card/30 p-3 text-xs">
                <span className="text-muted-foreground">Iteration of </span>
                <Link
                  to="/artists/$id/looks/$lookId"
                  params={{ id: artistId, lookId: look.parent_look_id }}
                  className="underline"
                >
                  parent look →
                </Link>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Delete confirmation — replaces native confirm() for mobile reliability. */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this look?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{look.name}</span> will be
              removed from your library. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]" disabled={del.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={del.isPending}
              onClick={async (e) => {
                e.preventDefault();
                try {
                  await del.mutateAsync({ id: look.id, artistId });
                  toast.success("Deleted");
                  setDeleteOpen(false);
                  navigate({
                    to: "/artists/$id/looks",
                    params: { id: artistId },
                  });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Delete failed");
                }
              }}
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// RecipePanel — the picked refs that went into this composition
// ---------------------------------------------------------------------------
function RecipePanel({
  recipe,
  artistId: _artistId,
  features,
  wardrobe,
  locations,
  props,
}: {
  recipe: ReturnType<typeof useLook>["data"] extends infer T
    ? T extends { composition_recipe_json: infer R }
      ? R
      : never
    : never;
  artistId: string;
  features: ReturnType<typeof useCharacterFeatures>["data"] extends infer T
    ? T extends Array<infer R>
      ? R[]
      : []
    : [];
  wardrobe: ReturnType<typeof useWardrobe>["data"] extends infer T
    ? T extends Array<infer R>
      ? R[]
      : []
    : [];
  locations: ReturnType<typeof useLocations>["data"] extends infer T
    ? T extends Array<infer R>
      ? R[]
      : []
    : [];
  props: ReturnType<typeof useProps>["data"] extends infer T
    ? T extends Array<infer R>
      ? R[]
      : []
    : [];
}) {
  const face = recipe?.face_feature_id
    ? features.find((f: any) => f.id === recipe.face_feature_id) ?? null
    : null;
  const wardrobePicks = useMemo(
    () =>
      (recipe?.wardrobe_feature_ids ?? [])
        .map((id: string) => wardrobe.find((w: any) => w.id === id))
        .filter(Boolean),
    [recipe?.wardrobe_feature_ids, wardrobe],
  );
  const jewelryPicks = useMemo(
    () =>
      (recipe?.jewelry_feature_ids ?? [])
        .map((id: string) => features.find((f: any) => f.id === id))
        .filter(Boolean),
    [recipe?.jewelry_feature_ids, features],
  );
  const location = recipe?.location_id
    ? locations.find((l: any) => l.id === recipe.location_id) ?? null
    : null;
  const propPicks = useMemo(
    () =>
      (recipe?.prop_ids ?? [])
        .map((id: string) => props.find((p: any) => p.id === id))
        .filter(Boolean),
    [recipe?.prop_ids, props],
  );

  return (
    <section className="space-y-3 rounded-md border border-border bg-card/30 p-4">
      <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Composition recipe
      </h2>

      <div className="space-y-2 text-xs">
        {recipe?.base_prompt && (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Base prompt
            </span>
            <p className="mt-0.5 whitespace-pre-wrap">{recipe.base_prompt}</p>
          </div>
        )}
        {recipe?.styling_notes && (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Styling
            </span>
            <p className="mt-0.5 whitespace-pre-wrap">{recipe.styling_notes}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {face && (
          <AssetThumb
            bucket="artist-assets"
            path={(face as any).storage_path ?? (face as any).file_url}
            label={(face as any).label}
            badge="Face"
          />
        )}
        {wardrobePicks.map((w: any) => (
          <AssetThumb
            key={w.id}
            bucket="wardrobe-refs"
            path={w.storage_path ?? w.file_url}
            label={w.label}
            badge={w.feature_type?.replace?.("wardrobe_", "") ?? "wardrobe"}
          />
        ))}
        {jewelryPicks.map((j: any) => (
          <AssetThumb
            key={j.id}
            bucket="artist-assets"
            path={j.storage_path ?? j.file_url}
            label={j.label}
            badge="Jewelry"
          />
        ))}
        {location && (
          <AssetThumb
            bucket="location-refs"
            path={(location as any).storage_path ?? (location as any).file_url}
            label={(location as any).name}
            badge="Location"
          />
        )}
        {propPicks.map((p: any) => (
          <AssetThumb
            key={p.id}
            bucket="prop-refs"
            path={p.storage_path ?? p.file_url}
            label={p.name}
            badge="Prop"
          />
        ))}
      </div>
    </section>
  );
}
