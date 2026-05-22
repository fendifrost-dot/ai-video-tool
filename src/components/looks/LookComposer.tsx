import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  Gem,
  Loader2,
  MapPin,
  Package,
  Shirt,
  Sparkles,
  User,
  Wand2,
} from "lucide-react";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useArtist } from "@/lib/queries/artists";
import {
  useCharacterFeatures,
  type CharacterFeature,
} from "@/lib/queries/characterFeatures";
import { useWardrobe, type WardrobeItem } from "@/lib/queries/wardrobe";
import { useLocations, type LocationItem } from "@/lib/queries/locations";
import { useProps, type PropItem } from "@/lib/queries/props";
import {
  formatCost,
  pipelineEstimateCents,
  useComposeLook,
  useLook,
} from "@/lib/queries/looks";
import { AssetThumb } from "./AssetThumb";

const PIPELINE_LABELS = {
  auto: "Auto (recommended)",
  lora_seedream: "LoRA + Seedream",
  seedream_only: "Seedream only",
  kontext_multi: "Kontext multi-image",
  lora_idm_vton: "LoRA + IDM-VTON (experimental)",
} as const;

// One-line plain-English descriptions for each pipeline option — surfaced
// as a hover tooltip (native `title` + sub-line in the dropdown) so a user
// without ML domain knowledge can pick the right one.
const PIPELINE_DESCRIPTIONS: Record<keyof typeof PIPELINE_LABELS, string> = {
  auto: "Picks the best pipeline based on what you've selected",
  lora_seedream:
    "Identity LoRA generates a base photo, Seedream overlays wardrobe — fast, sometimes loses garment length",
  lora_idm_vton:
    "Identity LoRA + dedicated virtual try-on model for accurate garment fit and closure",
  seedream_only:
    "Skip the LoRA step, use only Seedream for editing — cheapest, weaker identity match",
  kontext_multi:
    "FLUX Kontext with multiple references — alternative if Seedream is misbehaving",
};

type PipelinePref = keyof typeof PIPELINE_LABELS;

// ---------------------------------------------------------------------------
// LookComposer — 3-panel UI to assemble + generate a new look.
// ---------------------------------------------------------------------------
export function LookComposer({
  artistId,
  parentLookId,
}: {
  artistId: string;
  parentLookId?: string | null;
}) {
  const navigate = useNavigate();
  const artistQuery = useArtist(artistId);
  const featuresQuery = useCharacterFeatures(artistId);
  const wardrobeQuery = useWardrobe(artistId);
  const locationsQuery = useLocations();
  const propsQuery = useProps();
  const parentQuery = useLook(parentLookId ?? undefined);
  const compose = useComposeLook();

  const hasLora = useMemo(() => {
    const identity = (artistQuery.data?.identity_profile_json ?? {}) as Record<string, unknown>;
    const lora = (identity as any)?.lora;
    return !!(lora && typeof lora.url === "string" && lora.url.length > 0);
  }, [artistQuery.data]);

  // -------------------------------------------------------------------------
  // Picker state
  // -------------------------------------------------------------------------
  const [faceFeatureId, setFaceFeatureId] = useState<string | null>(null);
  const [wardrobeIds, setWardrobeIds] = useState<string[]>([]);
  const [jewelryIds, setJewelryIds] = useState<string[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [propIds, setPropIds] = useState<string[]>([]);

  // -------------------------------------------------------------------------
  // Prompt state
  // -------------------------------------------------------------------------
  const [name, setName] = useState("");
  const [basePrompt, setBasePrompt] = useState("");
  const [stylingNotes, setStylingNotes] = useState("");
  const [pipelinePref, setPipelinePref] = useState<PipelinePref>("auto");

  // -------------------------------------------------------------------------
  // Pre-fill from parent (for iterations / variants)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!parentQuery.data) return;
    const recipe = parentQuery.data.composition_recipe_json;
    if (!recipe) return;
    setFaceFeatureId(recipe.face_feature_id ?? null);
    setWardrobeIds(recipe.wardrobe_feature_ids ?? []);
    setJewelryIds(recipe.jewelry_feature_ids ?? []);
    setLocationId(recipe.location_id ?? null);
    setPropIds(recipe.prop_ids ?? []);
    setBasePrompt(recipe.base_prompt ?? "");
    setStylingNotes(recipe.styling_notes ?? "");
    setName(`${parentQuery.data.name} (variant)`);
  }, [parentQuery.data]);

  // -------------------------------------------------------------------------
  // Categorise features
  // -------------------------------------------------------------------------
  const faceOptions = useMemo<CharacterFeature[]>(
    () =>
      (featuresQuery.data ?? []).filter((f) => f.feature_type === "face"),
    [featuresQuery.data],
  );
  const jewelryFeatures = useMemo<CharacterFeature[]>(
    () => (featuresQuery.data ?? []).filter((f) => f.feature_type === "jewelry"),
    [featuresQuery.data],
  );
  const wardrobeByCategory = useMemo(() => {
    const byCat: Record<string, WardrobeItem[]> = {
      wardrobe_outerwear: [],
      wardrobe_top: [],
      wardrobe_bottom: [],
      wardrobe_footwear: [],
      wardrobe_accessory: [],
    };
    for (const item of wardrobeQuery.data ?? []) {
      const cat = item.feature_type;
      if (cat in byCat) byCat[cat].push(item);
    }
    return byCat;
  }, [wardrobeQuery.data]);

  // -------------------------------------------------------------------------
  // Validation + cost
  // -------------------------------------------------------------------------
  const canGenerate =
    wardrobeIds.length > 0 && basePrompt.trim().length >= 4 && !compose.isPending;
  const estCents = pipelineEstimateCents(pipelinePref, hasLora);

  // Dynamic tooltip / hint reason for why the Generate button is disabled.
  // Matches the canGenerate predicate so the user knows exactly what's
  // missing before they click anything.
  const generateBlockedReason: string | null = compose.isPending
    ? "Generation in progress — wait for the current run to finish"
    : wardrobeIds.length === 0
      ? "Add at least one wardrobe item to generate"
      : basePrompt.trim().length < 4
        ? "Add a description to generate (4+ characters)"
        : null;

  // -------------------------------------------------------------------------
  // Toggle helpers
  // -------------------------------------------------------------------------
  function toggleWardrobe(id: string) {
    setWardrobeIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    );
  }
  function toggleJewelry(id: string) {
    setJewelryIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    );
  }
  function toggleProp(id: string) {
    setPropIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    );
  }

  // -------------------------------------------------------------------------
  // Generate
  //
  // Phase-2 UX refactor: as soon as the proxy returns a look_id we
  // navigate to /artists/$id/looks/$lookId so the URL reflects the active
  // look and a browser refresh resumes the pending preview correctly. The
  // LookDetailPage owns the polling loop from that point on (so closing /
  // re-opening the tab keeps working).
  // -------------------------------------------------------------------------
  async function handleGenerate() {
    if (!canGenerate) return;
    let submitRes: Awaited<ReturnType<typeof compose.mutateAsync>> | null = null;
    try {
      submitRes = await compose.mutateAsync({
        artistId,
        faceFeatureId: faceFeatureId ?? undefined,
        wardrobeFeatureIds: wardrobeIds,
        jewelryFeatureIds: jewelryIds.length > 0 ? jewelryIds : undefined,
        locationId: locationId ?? undefined,
        propIds: propIds.length > 0 ? propIds : undefined,
        basePrompt: basePrompt.trim(),
        stylingNotes: stylingNotes.trim() || undefined,
        pipelinePreference: pipelinePref,
        parentLookId: parentLookId ?? undefined,
        name: name.trim() || undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generate failed");
      return;
    }

    const lookId = submitRes.look_id ?? submitRes.look.id;

    // If the legacy synchronous proxy already returned a complete look,
    // still go to the detail page — it knows how to render a complete row
    // and we keep the URL semantics consistent.
    if (submitRes.status === "complete" && submitRes.signed_url) {
      toast.success(
        `Look generated — ${submitRes.pipeline_used ?? "unknown"} pipeline, ${formatCost(submitRes.cost_cents)}`,
      );
    }

    navigate({
      to: "/artists/$id/looks/$lookId",
      params: { id: artistId, lookId },
    });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const noFeaturesAtAll =
    !featuresQuery.isLoading &&
    !wardrobeQuery.isLoading &&
    (featuresQuery.data?.length ?? 0) === 0 &&
    (wardrobeQuery.data?.length ?? 0) === 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_320px]">
      {/* ====================== LEFT RAIL — pickers ====================== */}
      <aside className="space-y-3 overflow-y-auto pr-1 lg:max-h-[calc(100vh-180px)]">
        {noFeaturesAtAll && (
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            This artist has no Character DNA or wardrobe yet. Build them on the{" "}
            <a
              href={`/artists/${artistId}`}
              className="underline"
            >
              artist page
            </a>{" "}
            before composing a look.
          </div>
        )}

        {/* Face slot */}
        <PickerSection
          icon={<User className="h-3.5 w-3.5" />}
          title="Face"
          subtitle={
            hasLora ? "LoRA available — face slot optional" : "Pick the face reference"
          }
        >
          <Select
            value={faceFeatureId ?? "_default_"}
            onValueChange={(v) => setFaceFeatureId(v === "_default_" ? null : v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Default locked face" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_default_">Default locked face</SelectItem>
              {faceOptions.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.label}
                  {f.is_locked ? " (locked)" : ""}
                  {f.is_primary ? " ★" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PickerSection>

        {/* Wardrobe accordions */}
        <PickerSection icon={<Shirt className="h-3.5 w-3.5" />} title="Wardrobe" defaultOpen>
          {(["wardrobe_outerwear", "wardrobe_top", "wardrobe_bottom", "wardrobe_footwear", "wardrobe_accessory"] as const).map(
            (cat) => (
              <WardrobeCategory
                key={cat}
                category={cat}
                items={wardrobeByCategory[cat] ?? []}
                selectedIds={wardrobeIds}
                onToggle={toggleWardrobe}
              />
            ),
          )}
        </PickerSection>

        {/* Jewelry */}
        <PickerSection icon={<Gem className="h-3.5 w-3.5" />} title="Jewelry">
          {jewelryFeatures.length === 0 ? (
            <p className="px-1 text-[10px] text-muted-foreground">None.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {jewelryFeatures.map((j) => (
                <AssetThumb
                  key={j.id}
                  bucket="artist-assets"
                  path={j.storage_path ?? j.file_url}
                  label={j.label}
                  size="sm"
                  selected={jewelryIds.includes(j.id)}
                  onClick={() => toggleJewelry(j.id)}
                />
              ))}
            </div>
          )}
        </PickerSection>

        {/* Location */}
        <PickerSection icon={<MapPin className="h-3.5 w-3.5" />} title="Location">
          <Select
            value={locationId ?? "_none_"}
            onValueChange={(v) => setLocationId(v === "_none_" ? null : v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="No location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none_">No location</SelectItem>
              {(locationsQuery.data ?? []).map((l: LocationItem) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                  {l.category ? ` · ${l.category}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PickerSection>

        {/* Props */}
        <PickerSection icon={<Package className="h-3.5 w-3.5" />} title="Props">
          {(propsQuery.data ?? []).length === 0 ? (
            <p className="px-1 text-[10px] text-muted-foreground">No props yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {(propsQuery.data ?? []).map((p: PropItem) => (
                <AssetThumb
                  key={p.id}
                  bucket="prop-refs"
                  path={p.storage_path ?? p.file_url}
                  label={p.name}
                  size="sm"
                  selected={propIds.includes(p.id)}
                  onClick={() => toggleProp(p.id)}
                />
              ))}
            </div>
          )}
        </PickerSection>
      </aside>

      {/* ====================== CENTER — canvas + preview ============== */}
      <section className="space-y-4">
        <div className="rounded-md border border-border bg-card/30 p-4">
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Composition canvas
          </h2>
          <CanvasStrip
            artistId={artistId}
            faceFeatureId={faceFeatureId}
            wardrobeIds={wardrobeIds}
            jewelryIds={jewelryIds}
            locationId={locationId}
            propIds={propIds}
            features={featuresQuery.data ?? []}
            wardrobe={wardrobeQuery.data ?? []}
            locations={locationsQuery.data ?? []}
            props={propsQuery.data ?? []}
            onRemoveWardrobe={(id) =>
              setWardrobeIds((c) => c.filter((x) => x !== id))
            }
            onRemoveJewelry={(id) =>
              setJewelryIds((c) => c.filter((x) => x !== id))
            }
            onClearLocation={() => setLocationId(null)}
            onRemoveProp={(id) => setPropIds((c) => c.filter((x) => x !== id))}
          />
        </div>

        <div className="rounded-md border border-border bg-card/30">
          <h2 className="border-b border-border px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Preview
          </h2>
          <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden bg-muted/10 p-4">
            {compose.isPending ? (
              <>
                {/* Shimmer skeleton background while the proxy is accepting
                    the submission. As soon as it returns a look_id we
                    navigate to the look detail page, which owns the rest of
                    the wait loop. Matches LookCard's skeleton visually. */}
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
                <style>{`@keyframes shimmer { 100% { transform: translateX(100%); } }`}</style>
                <div className="relative z-10 flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>
                    Composing — {pipelinePref === "auto" ? (hasLora ? "LoRA + Seedream" : "Seedream") : PIPELINE_LABELS[pipelinePref]}
                  </span>
                  <span className="text-[10px]">Submitting…</span>
                </div>
              </>
            ) : (
              <div className="text-center text-sm text-muted-foreground">
                <Sparkles className="mx-auto h-6 w-6 text-muted-foreground/40" />
                <p className="mt-2">Pick references and write a prompt to generate.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ====================== RIGHT RAIL — prompt + actions ========== */}
      <aside className="space-y-3 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto">
        <div className="rounded-md border border-border bg-card/30 p-4">
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Look details
          </h2>

          <div className="space-y-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Look name
              </Label>
              <Input
                placeholder='e.g. "Chrome Luxe"'
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-8 text-sm"
              />
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Description / mood
              </Label>
              <Textarea
                placeholder="Photorealistic portrait, golden-hour light, full body, slight high-fashion edge…"
                value={basePrompt}
                onChange={(e) => setBasePrompt(e.target.value)}
                rows={4}
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Styling notes
              </Label>
              <Textarea
                placeholder="Shirt tucked, jeans slim no ankle bunch, chain over collar…"
                value={stylingNotes}
                onChange={(e) => setStylingNotes(e.target.value)}
                rows={3}
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Pipeline
              </Label>
              <Select value={pipelinePref} onValueChange={(v) => setPipelinePref(v as PipelinePref)}>
                <SelectTrigger className="mt-1 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(PIPELINE_LABELS) as [PipelinePref, string][]).map(([k, v]) => (
                    <SelectItem
                      key={k}
                      value={k}
                      className="text-xs"
                      title={PIPELINE_DESCRIPTIONS[k]}
                    >
                      <div className="flex flex-col gap-0.5 py-0.5">
                        <span>
                          {v}
                          {(k === "lora_seedream" || k === "lora_idm_vton") && !hasLora && (
                            <span className="ml-1 text-[10px] text-muted-foreground">(no LoRA — will downgrade)</span>
                          )}
                        </span>
                        <span className="max-w-[300px] text-[10px] leading-snug text-muted-foreground">
                          {PIPELINE_DESCRIPTIONS[k]}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-border bg-card/30 p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Estimated cost</span>
            <span className="font-mono">{formatCost(estCents)}</span>
          </div>
          {parentLookId && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Iteration of</span>
              <span className="font-mono">{parentQuery.data?.name ?? "…"}</span>
            </div>
          )}
          {/* Wrap Generate in a Tooltip so users hovering the disabled
              button learn exactly which requirement is missing. The
              tooltip is suppressed once `canGenerate` is true so we don't
              show stale messaging on the happy path. The trigger wraps a
              span because Radix tooltips need a non-disabled hover
              surface — disabled buttons swallow pointer events. */}
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={!canGenerate ? "block w-full cursor-not-allowed" : "block w-full"}>
                  <Button
                    size="lg"
                    className="w-full"
                    disabled={!canGenerate}
                    onClick={handleGenerate}
                  >
                    {compose.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Composing…
                      </>
                    ) : (
                      <>
                        <Wand2 className="mr-2 h-4 w-4" />
                        Generate look
                      </>
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              {generateBlockedReason && (
                <TooltipContent side="top">{generateBlockedReason}</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {!canGenerate && !compose.isPending && generateBlockedReason && (
            <p className="text-[10px] text-muted-foreground">
              {generateBlockedReason}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

// ===========================================================================
// PickerSection — collapsible header for the left rail
// ===========================================================================
function PickerSection({
  icon,
  title,
  subtitle,
  children,
  defaultOpen,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <section className="rounded-md border border-border bg-card/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {title}
        </div>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border px-3 py-2">
          {subtitle && (
            <p className="text-[10px] text-muted-foreground">{subtitle}</p>
          )}
          {children}
        </div>
      )}
    </section>
  );
}

// ===========================================================================
// WardrobeCategory — sub-accordion for one wardrobe sub-type
// ===========================================================================
function WardrobeCategory({
  category,
  items,
  selectedIds,
  onToggle,
}: {
  category:
    | "wardrobe_outerwear"
    | "wardrobe_top"
    | "wardrobe_bottom"
    | "wardrobe_footwear"
    | "wardrobe_accessory";
  items: WardrobeItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const label = category.replace("wardrobe_", "").replace(/^./, (s) => s.toUpperCase());
  if (items.length === 0) {
    return (
      <details className="text-[10px]" open={false}>
        <summary className="cursor-pointer text-muted-foreground">
          {label} (0)
        </summary>
      </details>
    );
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {label} ({items.length})
      </button>
      {open && (
        <div className="grid grid-cols-3 gap-1.5">
          {items.map((item) => (
            <AssetThumb
              key={item.id}
              bucket="wardrobe-refs"
              path={item.storage_path ?? item.file_url}
              label={item.label}
              size="sm"
              selected={selectedIds.includes(item.id)}
              onClick={() => onToggle(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// CanvasStrip — the row of picked refs in the center panel
// ===========================================================================
function CanvasStrip({
  artistId,
  faceFeatureId,
  wardrobeIds,
  jewelryIds,
  locationId,
  propIds,
  features,
  wardrobe,
  locations,
  props,
  onRemoveWardrobe,
  onRemoveJewelry,
  onClearLocation,
  onRemoveProp,
}: {
  artistId: string;
  faceFeatureId: string | null;
  wardrobeIds: string[];
  jewelryIds: string[];
  locationId: string | null;
  propIds: string[];
  features: CharacterFeature[];
  wardrobe: WardrobeItem[];
  locations: LocationItem[];
  props: PropItem[];
  onRemoveWardrobe: (id: string) => void;
  onRemoveJewelry: (id: string) => void;
  onClearLocation: () => void;
  onRemoveProp: (id: string) => void;
}) {
  const face = faceFeatureId
    ? features.find((f) => f.id === faceFeatureId) ?? null
    : null;
  const pickedWardrobe = wardrobeIds
    .map((id) => wardrobe.find((w) => w.id === id))
    .filter((w): w is WardrobeItem => !!w);
  const pickedJewelry = jewelryIds
    .map((id) => features.find((f) => f.id === id))
    .filter((j): j is CharacterFeature => !!j);
  const location = locationId
    ? locations.find((l) => l.id === locationId) ?? null
    : null;
  const pickedProps = propIds
    .map((id) => props.find((p) => p.id === id))
    .filter((p): p is PropItem => !!p);

  const totalPicked =
    (face ? 1 : 0) +
    pickedWardrobe.length +
    pickedJewelry.length +
    (location ? 1 : 0) +
    pickedProps.length;

  if (totalPicked === 0) {
    return (
      <div className="rounded-sm border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        Pick references from the left to start composing.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {face && (
        <AssetThumb
          bucket="artist-assets"
          path={face.storage_path ?? face.file_url}
          label={face.label}
          badge="Face"
        />
      )}
      {pickedWardrobe.map((w) => (
        <AssetThumb
          key={w.id}
          bucket="wardrobe-refs"
          path={w.storage_path ?? w.file_url}
          label={w.label}
          badge={w.feature_type.replace("wardrobe_", "")}
          onRemove={() => onRemoveWardrobe(w.id)}
        />
      ))}
      {pickedJewelry.map((j) => (
        <AssetThumb
          key={j.id}
          bucket="artist-assets"
          path={j.storage_path ?? j.file_url}
          label={j.label}
          badge="Jewelry"
          onRemove={() => onRemoveJewelry(j.id)}
        />
      ))}
      {location && (
        <AssetThumb
          bucket="location-refs"
          path={location.storage_path ?? location.file_url}
          label={location.name}
          badge="Location"
          onRemove={onClearLocation}
        />
      )}
      {pickedProps.map((p) => (
        <AssetThumb
          key={p.id}
          bucket="prop-refs"
          path={p.storage_path ?? p.file_url}
          label={p.name}
          badge="Prop"
          onRemove={() => onRemoveProp(p.id)}
        />
      ))}
    </div>
  );
}

