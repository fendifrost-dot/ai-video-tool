/**
 * Everything the storyboard page does, in one place: the box records, the footage on them, and the actions on a
 * box. The card and the full-screen view are two presentations of the SAME records through this one controller, so
 * an edit made in one is the edit seen in the other.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { lyricsForShot, lyricStateForShot, type ShotLyric } from "@/lib/lyrics/lyricsForShot";
import { projectAssetsKeys } from "@/lib/queries/projectAssets";
import { projectsKeys } from "@/lib/queries/projects";
import { useBoxJobs, type BoxJobStatus } from "@/lib/queries/boxJobs";
import {
  removeMergedBox,
  storyboardKeys,
  useApplyAssignmentOps,
  useAssignments,
  useProjectMedia,
  useStoryboardBoxes,
  useTakeSyncs,
  useWriteBoxes,
} from "@/lib/queries/storyboard";
import { useTreatmentInputs } from "@/lib/queries/treatmentInputs";
import { useWardrobe } from "@/lib/queries/wardrobe";
import { DEFAULT_STILL_REFERENCE_CAP, useStillReferenceSupport } from "@/lib/queries/stillReferences";
import { linkPictureNeeds, linkPromptLines, linksOfBox, type ResolvedLink } from "@/lib/storyboard/links";
import { planStillReferences, referenceSummary, undeliveredProblem, type ReferenceProblem, type StillReference } from "@/lib/storyboard/references";
import { useCharacterFeatures } from "@/lib/queries/characterFeatures";
import { actionIsPerforming, productionRoute, routeLine, type ProductionRoute } from "@/lib/storyboard/route";
import type { StillReferencesOnJob } from "@/lib/worldBatch/runner";
import { useContinuityEntities, useContinuityMutations } from "@/lib/queries/continuity";
import { useSceneMutations, useScenes, type SceneWrite } from "@/lib/queries/scenes";
import { effectiveGarments, isOutfit, jobOutfitRecord, outfitFlags, outfitOutdated, outfitRecordOf, resolveOutfit, scenesFromWriter, type Outfit, type OutfitFlag, type ProposedScene, type Scene, type ShotOutfit } from "@/lib/wardrobe/outfits";
import {
  canonicalWords,
  continuitySource,
  entityPictureRefusal,
  entityUsage as usageOfEntities,
  indexEntities,
  resolveContinuity,
  withReference,
  type ContinuityEntity,
  type EntityKind,
  type EntityPatch,
  type LookRef,
  type ShotContinuity,
} from "@/lib/continuity/entities";
import { castProblems, resolveCast, type CastFacts, type CastProblem, type ShotCast } from "@/lib/casting/cast";
import type { ContinuityOverride, CastOverride } from "@/lib/treatment/overrides";
import { useEventClock } from "@/lib/queries/eventClock";
import { providerJobsKeys } from "@/lib/providerJobs/queries";
import {
  BLANK_OVERRIDE,
  applyOverride,
  boxIsStale,
  wardrobeGap,
  directorSet,
  editedOverride,
  machineContext,
  neighbourSummaries,
  planMerge,
  planSplit,
  planSplitAtBeats,
  rewrittenOverride,
  writeOf,
  type BoxOverride,
  type StoryboardBox,
} from "@/lib/storyboard/boxes";
import { resolveEvents, type EventClock, type ResolvedEvent, type ShotEvent } from "@/lib/storyboard/events";
import { ALTERNATIVE_LABEL, beatLines, type TemporalPlan } from "@/lib/storyboard/temporal";
import type { AskedChange } from "@/lib/storyboard/beatCheck";
import { measureClip as measureClipFile, saveBeatCheck } from "@/lib/queries/beatCheck";
import { measureAgainstTake, saveTakeCheck } from "@/lib/queries/takeCheck";
import { asksByAsset, saveJudgement } from "@/lib/queries/acceptance";
import { acceptanceOf as acceptanceFor, reviewedByAsset, type Acceptance, type Requirement } from "@/lib/storyboard/acceptance";
import { readStoredReview } from "@/lib/storyboard/astraSection";
import { analyzeTake, saveFootageAnalysis } from "@/lib/queries/footageAnalysis";
import {
  pickAnalysis,
  type Staleness,
  type StoredFootageAnalysis,
} from "@/lib/storyboard/footageRecord";
import { settingsOf } from "@/lib/worldBatch";
import { ensureStoryboardMaterialized, type MaterializeResult } from "@/lib/storyboard/build";
import { aspectOfProject, stillRequestAspect, type ProjectAspect } from "@/lib/project/aspect";
import { boxShot, clipEstimateUsd, clipTemporalPlan, entityShot, generateBoxClip, generateBoxImage, generateEntityReference, imageEstimateUsd, imageTemporalPlan, previewStillRequest } from "@/lib/storyboard/generate";
import { restageBox, restageEstimateUsd, restageSeconds, restageSource, restageTemporalPlan } from "@/lib/storyboard/restage";
import {
  boxMedia,
  imageForClip,
  planAssign,
  planDeselect,
  planMove,
  planMoveAll,
  planSelect,
  roleForAsset,
  sourceOfDerived,
  type AssignmentRole,
  type BoxMedia,
  type BoxMediaItem,
  type MediaAsset,
} from "@/lib/storyboard/media";
import { energyForWindow } from "@/lib/storyboard/rewrite";
import { buildClipGrid, type ClipEnergy } from "@/lib/treatment/grid";
import { DEFAULT_MOTION_TEMPLATE, regenerateShotFromLyrics, type RegenerateMode } from "@/lib/treatment/regenerateFromLyrics";
import { directorNotes, fingerprint, hasTreatment, parseTreatmentDoc } from "@/lib/treatment/treatmentDoc";
import { mediaRefKey, playbackRef, useSignedRefs } from "./signedUrls";

const mmss = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export type ConfirmRequest = {
  title: string;
  body: string;
  confirmLabel: string;
  testId: string;
  onConfirm: () => void | Promise<void>;
  /**
   * The picture the paid work is made from, shown before the press. A shot can hold several images (and one put on
   * it from another shot): "this shot's image" in words does not say which — the first live section restaged a take
   * into a runway whose centre line the model then drew straight through him, and nothing had shown that picture.
   */
  picture?: { url?: string; caption: string };
  /** A second thing the director can choose instead (its own button, beside the first). */
  secondary?: { label: string; testId: string; onConfirm: () => void | Promise<void> };
};

export type ClipRequest = { mode: "timed_script" | "ordered" | "single"; asked: AskedChange[]; prompt: string; route: string | null; submittedAt: string };

export type BoxEstimates = {
  image: number;
  clip: number;
  clipDrawsImage: boolean;
  /** Set on a performance shot with a take in sync: its clip is the take itself, restaged in the shot's scene. */
  restage?: { seconds: number; takeName: string; takeIn: number; takeOut: number } | null;
  /** Why this shot's clip cannot be made right now (a performance shot too long to restage). */
  clipBlocked?: string | null;
} | null;

export type StoryboardController = {
  projectId: string;
  loading: boolean;
  error: string | null;
  boxes: StoryboardBox[];
  /** 1-based position of a box in song order. A label for people — never an identity. */
  numberOf: (boxId: string) => number;
  mediaOf: (boxId: string) => BoxMedia;
  /** The signed link to play/show an asset (undefined until signed). */
  urlFor: (asset: MediaAsset) => string | undefined;
  lyricsOf: (box: StoryboardBox) => { lines: ShotLyric[]; state: "lyrics" | "instrumental" | "unknown" };
  energyOf: (box: StoryboardBox) => ClipEnergy | null;
  jobOf: (box: StoryboardBox) => BoxJobStatus | null;
  busyOf: (boxId: string) => string | null;
  estimatesOf: (box: StoryboardBox) => BoxEstimates;
  /** Why a box cannot be rewritten right now, or null. */
  rewriteBlockedReason: (box: StoryboardBox) => string | null;
  /** The library: everything that can be put on a box, and what it would be there. */
  library: { asset: MediaAsset; role: AssignmentRole }[];
  /** What the one-time move from the old storyboard did, when it ran in this session. */
  migrated: MaterializeResult | null;
  hasTreatment: boolean;
  /** True when this shot was written from another text than the treatment that stands now (boxes.ts `boxIsStale`). */
  staleOf: (box: StoryboardBox) => boolean;
  /** What the treatment asks him to wear in this shot that the footage or the image model cannot deliver (boxes.ts `wardrobeGap`), or null. */
  wardrobeGapOf: (box: StoryboardBox) => string | null;
  /** The project's frame: what every stage is shaped as and what images and clips are asked for. */
  aspect: ProjectAspect;

  saveEdit: (box: StoryboardBox, next: BoxOverride) => Promise<void>;
  resetBox: (box: StoryboardBox) => Promise<void>;
  rewrite: (box: StoryboardBox, mode?: RegenerateMode) => Promise<void>;
  restoreVersion: (box: StoryboardBox, entry: { direction?: string; purpose?: string; frame?: string; events?: ShotEvent[] }) => Promise<void>;
  /** The shot's timed events, placed on the song (a lyric or beat trigger looked up in the lyric timing / beat map). */
  eventsOf: (box: StoryboardBox) => ResolvedEvent[];
  /** What a lyric or beat trigger can hang on: the project's timed lines and the song's beats. */
  clock: EventClock;
  /** Save the shot's timed events (the director's list is exactly the shot's events). */
  saveEvents: (box: StoryboardBox, events: ShotEvent[]) => Promise<void>;
  /** Cut the shot at its beats: every state becomes a shot of its own. */
  splitAtBeats: (box: StoryboardBox) => Promise<void>;
  /** What generating a clip (or restaging) does with this shot's timed events. */
  clipPlanOf: (box: StoryboardBox) => TemporalPlan;
  /**
   * How a generated clip was asked for: the script's lines as data (empty = it was asked for as one state), whether
   * the times were promised ("timed_script") or only the order, and the exact words the provider was given. Null for
   * footage the app did not generate.
   */
  requestOf: (asset: MediaAsset) => ClipRequest | null;
  /** Measure a clip against its script (or re-measure it) and keep the result on the clip. */
  measureClip: (asset: MediaAsset) => Promise<void>;
  /** A clip being measured right now. */
  measuringOf: (assetId: string) => boolean;
  /** The take a restaged clip was made from, and the stretch of it (on the take's own clock) — from the job that made the clip. */
  takeOf: (asset: MediaAsset) => { take: MediaAsset; window: [number, number] } | null;
  /** Hold a restaged clip against its take (lips, framing) and keep the result on the clip. */
  checkAgainstTake: (asset: MediaAsset) => Promise<void>;
  /** What a check in flight is doing, when one is. */
  checkingOf: (assetId: string) => string | null;
  /**
   * Read a TAKE for what it is — framing, movement, light, focus, how hard he is to cut out — and what a background
   * would have to be to sit with it (storyboard/footage.ts, storyboard/compatibility.ts). Advisory: it writes a
   * record on the take and changes nothing else.
   */
  analyzeFootage: (asset: MediaAsset) => Promise<void>;
  /** The reading kept for this take and the stretch in hand, with whether it may still be believed. */
  footageAnalysisOf: (
    asset: MediaAsset,
  ) => { analysis: StoredFootageAnalysis; staleness: Staleness } | null;
  /** What a reading in flight is doing, when one is. */
  analyzingOf: (assetId: string) => string | null;
  /**
   * A generated clip held against everything it was asked for: what was measured, what a person judged by looking,
   * and what nothing has looked at yet. Null for footage the app did not generate.
   */
  acceptanceOf: (asset: MediaAsset) => Acceptance | null;
  /** Record what was decided by looking at the clip (or, with `finding` null, take that back). */
  judge: (asset: MediaAsset, requirement: Requirement, finding: "meets" | "fails" | null, note: string) => Promise<void>;
  /** The project's continuity entities: places, props and lighting states, each described once. */
  entities: ContinuityEntity[];
  /** The artist's wardrobe looks — the existing Look records a shot can point at. */
  looks: LookRef[];
  /** What a shot's continuity references resolve to. */
  continuityOf: (box: StoryboardBox) => ShotContinuity;
  /** Which shots (by number) point at each entity, by its key. */
  entityUsage: ReadonlyMap<string, number[]>;
  /** An entity's reference pictures, the approved one first. */
  picturesOf: (entity: ContinuityEntity) => MediaAsset[];
  entityBusyOf: (entityId: string) => string | null;
  createEntity: (kind: EntityKind, name: string, cast?: CastFacts) => Promise<ContinuityEntity | null>;
  saveEntity: (entity: ContinuityEntity, patch: EntityPatch) => Promise<void>;
  /** Draw reference pictures of an entity from its canonical description (asks first: it costs money). */
  generateEntityPicture: (entity: ContinuityEntity) => void;
  /** Make the image this shot shows the approved picture of an entity. */
  useShotImageFor: (box: StoryboardBox, entity: ContinuityEntity) => Promise<void>;
  /** Point the shot at entities (or take a reference away) — and its links, garments and production method. */
  saveContinuity: (box: StoryboardBox, refs: ContinuityOverride) => Promise<void>;
  /** Who is in this shot, resolved against this variation's characters. */
  castOf: (box: StoryboardBox) => ShotCast;

  // --- what he wears (wardrobe/outfits.ts) ---------------------------------------------------------------------------
  /** This video's outfits: entities of kind `outfit`, archived ones left out. */
  outfits: Outfit[];
  /** This video's scenes: the stretches of the song that wear one outfit, in song order. */
  scenes: Scene[];
  /** What a shot wears: its scene's outfit, its own exception, or none — and where that came from. */
  outfitOf: (box: StoryboardBox) => ShotOutfit;
  /** The exact pieces a shot is dressed in (the outfit's, or the shot's own), with their labels; a missing piece has none. */
  piecesOf: (box: StoryboardBox) => { id: string; label: string | null; from: "shot" | "outfit" | "none" }[];
  /** What stands between a shot and being dressed as the treatment asks (missing selection, contradiction, missing piece). */
  outfitFlagsOf: (box: StoryboardBox) => OutfitFlag[];
  /** Why the shot's selected image no longer matches what it wears (the outfit changed since), or null. */
  outfitOutdatedOf: (box: StoryboardBox) => string | null;
  /** The scenes the writer's own wardrobe words imply, resolved against the outfits — for the director to adopt. */
  proposedScenes: ProposedScene[];
  createOutfit: (name: string, garmentFeatureIds: string[], description?: string) => Promise<Outfit | null>;
  createScene: (scene: SceneWrite) => Promise<void>;
  saveScene: (scene: Scene, patch: Partial<SceneWrite>) => Promise<void>;
  removeScene: (scene: Scene) => Promise<void>;
  /** Adopt the proposed scenes that resolved to one outfit (the unresolved ones wait for an outfit of that name). */
  adoptProposedScenes: (proposed: readonly ProposedScene[]) => Promise<void>;
  sceneBusy: boolean;
  /** What is wrong with this shot's casting, before anything is generated. */
  castProblemsOf: (box: StoryboardBox) => CastProblem[];
  /** Put people in the shot, or take them out. An empty members list means nobody is cast. */
  saveCast: (box: StoryboardBox, cast: CastOverride) => Promise<void>;
  /** The artist's wardrobe pictures a shot can be dressed in exactly (character_features of a wardrobe_* type). */
  wardrobe: { id: string; label: string; featureType: string }[];
  /** Every link that touches this shot, from both ends (links.ts). */
  linksOf: (box: StoryboardBox) => ResolvedLink[];
  /** How this shot gets made, and whether the storyboard can make it (route.ts). */
  routeOf: (box: StoryboardBox) => ProductionRoute;
  /** The reference pictures its still is drawn with, what does not fit, and what is missing (references.ts). */
  referencesOf: (box: StoryboardBox) => StillReferencesOnJob & { problems: ReferenceProblem[]; cap: number };
  /** The exact still request this shot would send — built, not sent. */
  stillRequestOf: (box: StoryboardBox) => ReturnType<typeof previewStillRequest> | null;
  toggleLock: (box: StoryboardBox) => Promise<void>;
  split: (box: StoryboardBox, atSeconds: number) => Promise<void>;
  mergeWithNext: (box: StoryboardBox) => void;
  assign: (box: StoryboardBox, asset: MediaAsset, role?: AssignmentRole) => Promise<void>;
  select: (item: BoxMediaItem, box: StoryboardBox) => Promise<void>;
  showBaseLayer: (box: StoryboardBox) => Promise<void>;
  takeOff: (item: BoxMediaItem) => Promise<void>;
  moveTo: (item: BoxMediaItem, toBoxId: string) => Promise<void>;
  generateImage: (box: StoryboardBox) => void;
  generateClip: (box: StoryboardBox) => void;

  focusId: string | null;
  openFocus: (boxId: string | null) => void;
  pickerFor: string | null;
  openPicker: (boxId: string | null) => void;
  confirm: ConfirmRequest | null;
  askConfirm: (req: ConfirmRequest | null) => void;
};

/** Said before anything is generated from a shot that was written from another treatment than the one that stands. */
export const STALE_SHOT_WARNING =
  "NOTE: this shot was written from an earlier version of the treatment and has not been rewritten since — what is generated follows the old scene, not the treatment as it stands.";

const Ctx = createContext<StoryboardController | null>(null);

export function StoryboardProvider({ value, children }: { value: StoryboardController; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStoryboard(): StoryboardController {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStoryboard needs a StoryboardProvider above it");
  return v;
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const EMPTY_MEDIA: BoxMedia = { items: [], showing: null };

export function useStoryboardController(projectId: string): StoryboardController {
  const qc = useQueryClient();
  const inputs = useTreatmentInputs(projectId);
  const { project, lyricLines, analysis } = inputs;
  const boxesQuery = useStoryboardBoxes(projectId);
  const assignmentsQuery = useAssignments(projectId);
  const syncsQuery = useTakeSyncs(projectId);
  const media = useProjectMedia(projectId);
  const jobs = useBoxJobs(projectId);
  const writeBoxes = useWriteBoxes(projectId);
  const applyOps = useApplyAssignmentOps(projectId);
  const entitiesQuery = useContinuityEntities(projectId);
  const entityMutations = useContinuityMutations(projectId);

  const boxes = useMemo(() => boxesQuery.data ?? [], [boxesQuery.data]);
  const assignments = useMemo(() => assignmentsQuery.data ?? [], [assignmentsQuery.data]);
  const syncs = useMemo(() => syncsQuery.data ?? [], [syncsQuery.data]);
  const doc = useMemo(() => parseTreatmentDoc(project?.treatment_json), [project?.treatment_json]);
  const treatmentStamp = useMemo(() => (hasTreatment(doc) ? fingerprint(doc.text) : undefined), [doc]);
  /** Whether a shot was written from another text than the treatment that stands now. */
  const staleOf = useCallback((box: StoryboardBox) => boxIsStale(box, doc), [doc]);
  /** What a generation is told about a shot the treatment has moved on from: it costs money and follows the old scene. */
  const staleNote = useCallback((box: StoryboardBox) => (boxIsStale(box, doc) ? ` ${STALE_SHOT_WARNING}` : ""), [doc]);
  const aspect = aspectOfProject(project);

  const [busy, setBusy] = useState<Record<string, string>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [migrated, setMigrated] = useState<MaterializeResult | null>(null);
  const [entityBusy, setEntityBusy] = useState<Record<string, string>>({});

  const setBusyFor = useCallback((id: string, text: string | null) => {
    setBusy((b) => {
      if (text) return { ...b, [id]: text };
      const { [id]: _gone, ...rest } = b;
      return rest;
    });
  }, []);

  // --- the one-time move from the old storyboard (treatment_json + shot_overrides) onto box records ---------------
  // once per variation: another video of the same project has its own board to move or not
  const ensured = useRef<string | null>(null);
  useEffect(() => {
    const variationId = project?.active_variation_id ?? null;
    if (!project || !variationId || ensured.current === variationId || boxesQuery.isLoading || boxesQuery.data === undefined) return;
    if (boxesQuery.data.length > 0) {
      ensured.current = variationId;
      return;
    }
    ensured.current = variationId;
    void ensureStoryboardMaterialized({ projectId, variationId, treatmentJson: project.treatment_json, lyricLines })
      .then((r) => {
        if (!r) return;
        setMigrated(r);
        void qc.invalidateQueries({ queryKey: storyboardKeys.boxes(projectId) });
        void qc.invalidateQueries({ queryKey: storyboardKeys.assignments(projectId) });
        void qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(projectId) });
      })
      .catch((e) => toast.error(`The storyboard could not be opened: ${message(e)}`));
  }, [project, boxesQuery.isLoading, boxesQuery.data, projectId, lyricLines, qc]);

  // --- derived --------------------------------------------------------------------------------------------------
  const numberById = useMemo(() => new Map(boxes.map((b, i) => [b.id, i + 1])), [boxes]);
  const mediaByBox = useMemo(() => {
    const out = new Map<string, BoxMedia>();
    for (const b of boxes) out.set(b.id, boxMedia({ box: b, assignments, assets: media.byId, syncs }));
    return out;
  }, [boxes, assignments, media.byId, syncs]);

  const wardrobeGapOf = useCallback(
    (box: StoryboardBox) => {
      // the real take under this shot says what he was filmed in
      const take = (mediaByBox.get(box.id) ?? EMPTY_MEDIA).items.find((i) => i.base || (i.role === "performance" && !i.asset.derivedFrom));
      return wardrobeGap(box.spec, take?.asset.shows ?? null);
    },
    [mediaByBox],
  );

  // --- continuity: the entities, and what each shot's references resolve to -----------------------------------------
  const entities = useMemo(() => entitiesQuery.data ?? [], [entitiesQuery.data]);
  const entityIndex = useMemo(() => indexEntities(entities), [entities]);
  const looks = useMemo<LookRef[]>(() => inputs.looks.map((l) => ({ id: l.id, name: l.name, description: l.description ?? null })), [inputs.looks]);
  const continuityOf = useCallback((box: StoryboardBox) => resolveContinuity(box.spec, entityIndex, looks), [entityIndex, looks]);

  // --- what he wears: the outfits, the scenes, and what each shot resolves to (wardrobe/outfits.ts) -----------------
  const scenesQuery = useScenes(projectId);
  const sceneMutations = useSceneMutations(projectId);
  const scenes = useMemo<Scene[]>(() => scenesQuery.data ?? [], [scenesQuery.data]);
  const outfits = useMemo<Outfit[]>(() => entities.filter(isOutfit).filter((o) => !o.archived), [entities]);
  const outfitOf = useCallback((box: StoryboardBox) => resolveOutfit(box.spec, { start: box.start }, scenes, entityIndex), [scenes, entityIndex]);
  const proposedScenes = useMemo(() => scenesFromWriter(boxes, outfits), [boxes, outfits]);

  // --- cast: who is in each shot ------------------------------------------------------------------------------------
  const castOf = useCallback((box: StoryboardBox) => resolveCast(box.spec, entityIndex), [entityIndex]);
  const castProblemsOf = useCallback((box: StoryboardBox) => castProblems(castOf(box)), [castOf]);

  // --- links between shots, the artist's wardrobe, and what the still generator takes ------------------------------
  const board = useMemo(() => boxes.map((b, i) => ({ ...b, shotNumber: i + 1 })), [boxes]);
  const linksOf = useCallback((box: StoryboardBox) => linksOfBox(box, board), [board]);
  const wardrobeQuery = useWardrobe(project?.artist_id ?? undefined);
  // the artist's own identity pictures (Character DNA, character_features `face`): what a shot that casts the artist
  // is drawn against when the character record has no approved picture of its own — the artist record is the authority
  const featuresQuery = useCharacterFeatures(project?.artist_id ?? undefined);
  const artistFace = useMemo(() => {
    const faces = (featuresQuery.data ?? []).filter((f) => f.feature_type === "face" && !!f.storage_path);
    const pick = faces.find((f) => f.label === "neutral" && f.is_primary) ?? faces.find((f) => f.is_primary) ?? faces[0];
    return pick ? { id: pick.id, artistId: project?.artist_id ?? "" } : null;
  }, [featuresQuery.data, project?.artist_id]);
  /** The identity pictures of the people cast in a shot (casting/cast.ts decides who must be matched). */
  const castReferencesOf = useCallback(
    (box: StoryboardBox): StillReference[] => {
      const out: StillReference[] = [];
      for (const m of castOf(box).members) {
        if (m.mode === "invent") continue;
        const own = m.entity.approvedAssetId ?? m.entity.referenceAssetIds[0] ?? null;
        if (own) out.push({ source: "project_asset", id: own, role: "cast", label: m.entity.name });
        else if (m.entity.cast.role === "primary_artist" && m.entity.cast.artistId && artistFace && m.entity.cast.artistId === artistFace.artistId)
          out.push({ source: "character_feature", id: artistFace.id, role: "cast", label: m.entity.name });
      }
      return out;
    },
    [castOf, artistFace],
  );
  const wardrobe = useMemo(() => (wardrobeQuery.data ?? []).map((w) => ({ id: w.id, label: w.label, featureType: w.feature_type })), [wardrobeQuery.data]);
  const wardrobeIds = useMemo(() => new Set(wardrobe.map((w) => w.id)), [wardrobe]);
  const piecesOf = useCallback(
    (box: StoryboardBox) => {
      const g = effectiveGarments(box.spec, outfitOf(box));
      const labels = new Map(wardrobe.map((w) => [w.id, w.label]));
      return g.ids.map((id) => ({ id, label: labels.get(id) ?? null, from: g.from }));
    },
    [outfitOf, wardrobe],
  );
  const outfitFlagsOf = useCallback(
    // while the wardrobe is still loading, no piece is reported missing
    (box: StoryboardBox) => outfitFlags(box.spec, outfitOf(box), wardrobeQuery.data === undefined ? new Set(effectiveGarments(box.spec, outfitOf(box)).ids) : wardrobeIds, outfits),
    [outfitOf, wardrobeIds, wardrobeQuery.data, outfits],
  );
  const sceneRun = useCallback(async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (e) {
      toast.error(message(e));
    }
  }, []);
  const createScene = useCallback((scene: SceneWrite) => sceneRun(() => sceneMutations.create.mutateAsync(scene)), [sceneRun, sceneMutations.create]);
  const saveScene = useCallback((scene: Scene, patch: Partial<SceneWrite>) => sceneRun(() => sceneMutations.update.mutateAsync({ id: scene.id, patch })), [sceneRun, sceneMutations.update]);
  const removeScene = useCallback((scene: Scene) => sceneRun(() => sceneMutations.remove.mutateAsync(scene.id)), [sceneRun, sceneMutations.remove]);
  const adoptProposedScenes = useCallback(
    (proposed: readonly ProposedScene[]) =>
      sceneRun(() => sceneMutations.createMany.mutateAsync(proposed.map((p) => ({ name: p.name, start: p.start, end: p.end, outfitKey: p.outfitKey, notes: p.outfitKey ? `from the treatment's words: “${p.phrase}”` : `from the treatment's words: “${p.phrase}” — no outfit of that name yet` })))),
    [sceneRun, sceneMutations.createMany],
  );
  const supportData = useStillReferenceSupport(projectId).data;
  const referenceSupport = useMemo(() => supportData ?? { accepted: false, max: DEFAULT_STILL_REFERENCE_CAP, model: null }, [supportData]);
  const routeOf = useCallback(
    (box: StoryboardBox) => {
      // the artist in this shot with his real identity, and what he does here: a take-based route can only show him performing
      const him = castOf(box).members.find((m) => m.mode === "preserve");
      const artist = him ? { performs: box.spec.shotType === "performance" || actionIsPerforming(him.ref.action), action: him.ref.action } : null;
      return productionRoute(box.spec, { hasTake: restageSource((mediaByBox.get(box.id) ?? EMPTY_MEDIA).items, syncs).ok, links: linksOf(box), artist });
    },
    [mediaByBox, syncs, linksOf, castOf],
  );
  const entityUsage = useMemo(() => usageOfEntities(boxes.map((b, i) => ({ number: i + 1, spec: b.spec }))), [boxes]);
  const picturesOf = useCallback(
    (entity: ContinuityEntity): MediaAsset[] => {
      const ids = [entity.approvedAssetId, ...entity.referenceAssetIds].filter((x, i, all): x is string => !!x && all.indexOf(x) === i);
      return ids.map((id) => media.byId.get(id)).filter((a): a is MediaAsset => !!a);
    },
    [media.byId],
  );

  const refs = useMemo(() => {
    const seen = new Map<string, { bucket: string; path: string }>();
    for (const m of mediaByBox.values()) for (const i of m.items) {
      const r = playbackRef(i.asset);
      seen.set(mediaRefKey(r), r);
    }
    // an entity's reference pictures are shown too
    for (const e of entities) for (const a of picturesOf(e)) {
      const r = playbackRef(a);
      seen.set(mediaRefKey(r), r);
    }
    return [...seen.values()];
  }, [mediaByBox, entities, picturesOf]);
  const urls = useSignedRefs(refs);
  const urlFor = useCallback((asset: MediaAsset) => urls[mediaRefKey(playbackRef(asset))], [urls]);

  const beatGrid = useMemo(() => (analysis ? buildClipGrid({ analysis }) : []), [analysis]);
  // what a timed event's trigger is looked up in: the lyric timing and the song's beats
  const clock = useEventClock(projectId);
  const eventsOf = useCallback((box: StoryboardBox) => resolveEvents(box.spec.events, { start: box.start, end: box.end }, clock), [clock]);

  const library = useMemo(
    () =>
      media.list
        .map((asset) => ({ asset, role: roleForAsset(asset) }))
        .filter((x): x is { asset: MediaAsset; role: AssignmentRole } => !!x.role)
        .sort((a, b) => b.asset.createdAt.localeCompare(a.asset.createdAt)),
    [media.list],
  );


  const rewriteBlockedReason = useCallback(
    (box: StoryboardBox) => {
      if (!inputs.heroDescription) return "Set the artist's identity profile first — the scene is written around him";
      if (!project?.visual_style?.trim()) return "Set the visual direction on the Treatment page first — it is the world the scene is staged in";
      const hasLyrics = lyricsForShot(lyricLines ?? [], { start: box.start, end: box.end }).length > 0;
      if (!hasLyrics && !hasTreatment(doc)) return "No words are sung here and there is no treatment yet — write the treatment first";
      return null;
    },
    [inputs.heroDescription, project?.visual_style, lyricLines, doc],
  );

  // --- box text -------------------------------------------------------------------------------------------------
  const run = useCallback(
    async (box: StoryboardBox, label: string, fn: () => Promise<void>) => {
      setBusyFor(box.id, label);
      try {
        await fn();
      } catch (e) {
        toast.error(message(e));
      } finally {
        setBusyFor(box.id, null);
      }
    },
    [setBusyFor],
  );

  const saveEdit = useCallback(
    (box: StoryboardBox, next: BoxOverride) =>
      run(box, "saving…", async () => {
        const at = new Date().toISOString();
        // a scene he writes by hand is written under the treatment that stands now (applyOverride stamps it only
        // when the scene itself changed)
        await writeBoxes.mutateAsync({ updates: [{ id: box.id, write: applyOverride(box, editedOverride(box.override, next), at, "edit", treatmentStamp) }] });
        toast.success("Saved");
      }),
    [run, writeBoxes, treatmentStamp],
  );

  const resetBox = useCallback(
    (box: StoryboardBox) =>
      run(box, "resetting…", async () => {
        await writeBoxes.mutateAsync({ updates: [{ id: box.id, write: applyOverride(box, null, new Date().toISOString(), "reset") }] });
        toast.success("Back to the generated scene");
      }),
    [run, writeBoxes],
  );

  const rewrite = useCallback(
    (box: StoryboardBox, mode?: RegenerateMode) =>
      run(box, "rewriting the scene…", async () => {
        const blocked = rewriteBlockedReason(box);
        if (blocked) {
          toast.info(blocked);
          return;
        }
        const m = mediaByBox.get(box.id) ?? EMPTY_MEDIA;
        const take = m.items.find((i) => i.role === "performance" && i.sourceIn != null && i.sourceOut != null);
        const his = directorSet(box.override);
        // the scene is rewritten INSIDE the entities the shot points at, in their canonical words
        const held = continuityOf(box);
        const state = machineContext({
          box,
          performance: take ? { takeName: take.asset.name, range: { start: take.sourceIn!, end: take.sourceOut! }, shows: take.asset.shows ?? null, filmedIn: take.asset.filmedIn ?? null } : null,
          media: m.items.filter((i) => !i.base).map((i) => ({ role: i.role, name: i.asset.name, selected: i.selected })),
          look: { name: (held.look ?? inputs.looks[0])?.name ?? null, description: held.look?.description ?? box.spec.wardrobe.description },
          continuity: {
            location: held.location ? { name: held.location.name, words: canonicalWords(held.location) } : null,
            props: held.props.map((p) => ({ name: p.name, words: canonicalWords(p) })),
            lighting: held.lighting ? { name: held.lighting.name, words: canonicalWords(held.lighting) } : null,
          },
          constraints: [directorNotes(project?.notes, doc.notes)],
        });
        const r = await regenerateShotFromLyrics({
          projectId,
          spec: box.spec,
          mode,
          lyricLines,
          template: DEFAULT_MOTION_TEMPLATE,
          templateContext: inputs.templateContext,
          heroDescription: inputs.heroDescription,
          environment: project?.visual_style ?? "",
          style: project?.mood || null,
          section: box.section,
          treatment: doc.text,
          neighbours: neighbourSummaries(boxes, box.id),
          projectState: state as unknown as Record<string, unknown>,
          directorFixed: {
            framing: his.has("framing") ? (box.override?.framing ?? null) : null,
            cameraMotion: his.has("cameraMotion") ? [box.override?.cameraMotion?.type, box.override?.cameraMotion?.description].filter(Boolean).join(" — ") || null : null,
          },
        });
        const next = rewrittenOverride(box.override, {
          direction: r.direction || null,
          frame: r.frame || null,
          cameraMotion: r.cameraMotion.type || r.cameraMotion.description ? { type: r.cameraMotion.type, description: r.cameraMotion.description || null } : null,
          framing: r.framing,
          transitionIn: r.transitionIn.preset ? { preset: r.transitionIn.preset } : null,
          requiredElements: r.requiredElements.length ? r.requiredElements : null,
          // the rewrite writes the shot's timed beats too (an empty list = this scene is one state); beats the
          // director set by hand are his and are kept (rewrittenOverride)
          events: r.events,
        });
        const at = new Date().toISOString();
        await writeBoxes.mutateAsync({ updates: [{ id: box.id, write: applyOverride(box, next, at, "rewrite", fingerprint(doc.text)) }] });
        toast.success("Scene rewritten — the earlier version is under Versions");
      }),
    [run, rewriteBlockedReason, mediaByBox, inputs, doc, project, projectId, lyricLines, boxes, writeBoxes, continuityOf],
  );

  const saveEvents = useCallback(
    (box: StoryboardBox, events: ShotEvent[]) =>
      run(box, "saving…", async () => {
        const next: BoxOverride = { ...(box.override ?? BLANK_OVERRIDE), events };
        await writeBoxes.mutateAsync({ updates: [{ id: box.id, write: applyOverride(box, editedOverride(box.override, next), new Date().toISOString(), "edit") }] });
        toast.success(events.length ? "Timed beats saved" : "Timed beats removed — the shot is one state");
      }),
    [run, writeBoxes],
  );

  const restoreVersion = useCallback(
    (box: StoryboardBox, entry: { direction?: string; purpose?: string; frame?: string; events?: ShotEvent[] }) =>
      run(box, "restoring…", async () => {
        const next: BoxOverride = {
          ...(box.override ?? BLANK_OVERRIDE),
          direction: entry.direction || entry.purpose || null,
          frame: entry.frame ?? null,
          // a version is the scene AND the beats it had (a version from before beats existed leaves them as they are)
          ...(entry.events ? { events: entry.events } : {}),
        };
        await writeBoxes.mutateAsync({ updates: [{ id: box.id, write: applyOverride(box, editedOverride(box.override, next), new Date().toISOString(), "edit") }] });
        toast.success("Earlier version restored");
      }),
    [run, writeBoxes],
  );

  const toggleLock = useCallback(
    (box: StoryboardBox) =>
      run(box, "saving…", async () => {
        await writeBoxes.mutateAsync({ updates: [{ id: box.id, write: writeOf(box, { locked: !box.locked }) }] });
      }),
    [run, writeBoxes],
  );

  // --- split / merge --------------------------------------------------------------------------------------------
  const split = useCallback(
    (box: StoryboardBox, atSeconds: number) =>
      run(box, "splitting…", async () => {
        const plan = planSplit(box, atSeconds, boxes.map((b) => b.key), new Date().toISOString(), clock);
        const res = await writeBoxes.mutateAsync({ updates: [{ id: box.id, write: plan.first }], inserts: [plan.second] });
        // the take plays in both halves (its range follows each window); other footage stays on the first half
        const newId = res.inserted[0];
        const takeRows = assignments.filter((a) => a.shotId === box.id && a.role === "performance");
        if (newId) {
          for (const a of takeRows) {
            await applyOps.mutateAsync(planAssign({ assignments: [], shotId: newId, assetId: a.assetId, role: "performance", select: a.isPrimary }));
          }
        }
        toast.success("Split into two shots");
      }),
    [run, boxes, writeBoxes, assignments, applyOps, clock],
  );

  const splitAtBeats = useCallback(
    (box: StoryboardBox) =>
      run(box, "splitting at the beats…", async () => {
        const plan = planSplitAtBeats(box, boxes.map((b) => b.key), new Date().toISOString(), clock);
        const res = await writeBoxes.mutateAsync({ updates: [{ id: box.id, write: plan.first }], inserts: plan.rest });
        // the take plays in every piece (its range follows each window); other footage stays on the first piece
        const takeRows = assignments.filter((a) => a.shotId === box.id && a.role === "performance" && !media.byId.get(a.assetId)?.derivedFrom);
        for (const newId of res.inserted) {
          for (const a of takeRows) await applyOps.mutateAsync(planAssign({ assignments: [], shotId: newId, assetId: a.assetId, role: "performance", select: a.isPrimary }));
        }
        toast.success(`Split into ${plan.rest.length + 1} shots at ${plan.cuts.map((c) => `${c.toFixed(1)} s`).join(", ")}${plan.kept ? ` — ${plan.kept} beat${plan.kept === 1 ? "" : "s"} too close to a cut stayed as beats` : ""}`);
      }),
    [run, boxes, writeBoxes, assignments, applyOps, clock, media.byId],
  );

  const mergeWithNext = useCallback(
    (box: StoryboardBox) => {
      const i = boxes.findIndex((b) => b.id === box.id);
      const next = i >= 0 ? boxes[i + 1] : undefined;
      if (!next) {
        toast.info("This is the last shot — there is nothing after it to merge with");
        return;
      }
      setConfirm({
        title: `Merge shot ${i + 1} with shot ${i + 2}?`,
        body: `Shot ${i + 1} takes the whole window. Shot ${i + 2}'s footage moves onto it and its scene is kept under Versions.`,
        confirmLabel: "Merge",
        testId: "confirm-merge",
        onConfirm: () =>
          run(box, "merging…", async () => {
            const write = planMerge(box, next, new Date().toISOString(), clock);
            await applyOps.mutateAsync(planMoveAll(assignments, next.id, box.id));
            await removeMergedBox(projectId, next.id, box.id);
            await writeBoxes.mutateAsync({ updates: [{ id: box.id, write }] });
            if (focusId === next.id) setFocusId(box.id);
            void qc.invalidateQueries({ queryKey: storyboardKeys.assignments(projectId) });
            void qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(projectId) });
            toast.success("Merged");
          }),
      });
    },
    [boxes, run, applyOps, assignments, projectId, writeBoxes, focusId, qc, clock],
  );

  // --- footage --------------------------------------------------------------------------------------------------
  const assign = useCallback(
    (box: StoryboardBox, asset: MediaAsset, role?: AssignmentRole) =>
      run(box, "adding…", async () => {
        const r = role ?? roleForAsset(asset);
        if (!r) throw new Error("That file cannot be put on a shot");
        // an image put on a performance shot is the place his take can be restaged in: the take keeps showing
        const select = !(box.spec.shotType === "performance" && r === "generated_image");
        await applyOps.mutateAsync(planAssign({ assignments, shotId: box.id, assetId: asset.id, role: r, select }));
      }),
    [run, applyOps, assignments],
  );

  const select = useCallback(
    (item: BoxMediaItem, box: StoryboardBox) =>
      run(box, "switching…", async () => {
        // the base layer has no row until it is chosen: choosing it puts the take on the box
        const ops = item.assignmentId
          ? planSelect(assignments, item.assignmentId)
          : planAssign({ assignments, shotId: box.id, assetId: item.asset.id, role: item.role });
        await applyOps.mutateAsync(ops);
      }),
    [run, applyOps, assignments],
  );

  const showBaseLayer = useCallback(
    (box: StoryboardBox) => run(box, "switching…", async () => void (await applyOps.mutateAsync(planDeselect(assignments, box.id)))),
    [run, applyOps, assignments],
  );

  const takeOff = useCallback(
    async (item: BoxMediaItem) => {
      if (!item.assignmentId) return;
      try {
        await applyOps.mutateAsync([{ op: "delete", id: item.assignmentId }]);
        toast.success("Taken off this shot — the file is still in the project");
      } catch (e) {
        toast.error(message(e));
      }
    },
    [applyOps],
  );

  const moveTo = useCallback(
    async (item: BoxMediaItem, toBoxId: string) => {
      if (!item.assignmentId) return;
      try {
        await applyOps.mutateAsync(planMove(assignments, item.assignmentId, toBoxId));
        toast.success(`Moved to shot ${numberById.get(toBoxId) ?? ""}`.trim());
      } catch (e) {
        toast.error(message(e));
      }
    },
    [applyOps, assignments, numberById],
  );

  // --- generation -----------------------------------------------------------------------------------------------
  /** The image a clip (or a restaging) of this shot is made from, when the shot has one. */
  const selectedStill = useCallback(
    (box: StoryboardBox): MediaAsset | null => {
      const pick = imageForClip((mediaByBox.get(box.id) ?? EMPTY_MEDIA).items);
      return pick && pick.asset.bucket === "project-references" ? pick.asset : null;
    },
    [mediaByBox],
  );
  const selectedStillPath = useCallback((box: StoryboardBox): string | null => selectedStill(box)?.path ?? null, [selectedStill]);
  /**
   * The place a performance shot is restaged into. A shot set in one of the project's locations uses THAT location's
   * approved picture — the same picture for every shot set there — before any image of its own.
   */
  const placeStill = useCallback(
    (box: StoryboardBox): { asset: MediaAsset; of: { key: string; name: string } | null } | null => {
      const source = continuitySource(continuityOf(box), { forPlate: true });
      const canonical = source.placeAssetId ? media.byId.get(source.placeAssetId) : null;
      if (canonical && canonical.bucket === "project-references") return { asset: canonical, of: source.placeOf };
      const own = selectedStill(box);
      return own ? { asset: own, of: null } : null;
    },
    [continuityOf, media.byId, selectedStill],
  );

  const referencesOf = useCallback(
    (box: StoryboardBox) => {
      const needs = linkPictureNeeds(linksOf(box)).map((n) => {
        const other = n.link.other ? boxes.find((b) => b.key === n.link.otherKey) : null;
        const still = other ? selectedStill(other) : null;
        return { ...n, still: still ? { assetId: still.id } : null };
      });
      const onFile = new Map(wardrobe.map((w) => [w.id, w]));
      // while the wardrobe is still loading a garment is not reported missing
      const loaded = wardrobeQuery.data !== undefined;
      // the exact pieces: the outfit the shot wears (its scene's, or its own exception), or the shot's own garments
      const pieces = effectiveGarments(box.spec, outfitOf(box)).ids;
      const plan = planStillReferences({
        isPerformance: box.spec.shotType === "performance",
        continuity: continuityOf(box),
        linkNeeds: needs,
        garments: pieces.map((id) => ({ id, onFile: onFile.has(id) ? { id, label: onFile.get(id)!.label } : loaded ? null : { id, label: id } })),
        extra: castReferencesOf(box),
        cap: referenceSupport.max,
      });
      return { sent: plan.sent, notSent: plan.notSent, legend: plan.legend, delivered: referenceSupport.accepted, problems: plan.problems, cap: plan.cap };
    },
    [linksOf, boxes, selectedStill, wardrobe, wardrobeQuery.data, continuityOf, referenceSupport, castReferencesOf, outfitOf],
  );
  const linkLinesOf = useCallback((box: StoryboardBox) => linkPromptLines(linksOf(box)), [linksOf]);
  const stillRequestOf = useCallback(
    (box: StoryboardBox) => {
      try {
        return previewStillRequest(box, lyricLines, { aspect, continuity: continuityOf(box), cast: castOf(box), linkLines: linkLinesOf(box), references: referencesOf(box), outfit: outfitOf(box) });
      } catch {
        return null;
      }
    },
    [lyricLines, aspect, continuityOf, castOf, linkLinesOf, referencesOf, outfitOf],
  );
  /** What the confirmation says about the shot's route, links and pictures — and whether it may go at all. */
  const generationNotes = useCallback(
    (box: StoryboardBox): { text: string; blocked: string | null } => {
      const r = referencesOf(box);
      const o = outfitFlagsOf(box);
      // a shot that needs a screen picture, an exact garment or an identity is not drawn from words when the pictures cannot go;
      // an outfit whose piece the wardrobe no longer has, or a key this video has no outfit for, stops it the same way
      const blocking = r.problems.find((p) => p.level === "blocking") ?? o.find((f) => f.level === "blocking") ?? undeliveredProblem(r.sent, r.delivered);
      const pictures = r.sent.length || r.notSent.length ? ` ${referenceSummary({ sent: r.delivered ? r.sent : [], notSent: r.delivered ? r.notSent : [...r.notSent, ...r.sent.map((ref) => ({ ref, why: "the image generator does not take reference pictures yet" }))] })}` : "";
      const worn = outfitOf(box);
      const wears = worn.outfit ? ` He wears “${worn.outfit.name}” v${worn.outfit.outfit.version} (${worn.source === "scene" ? `the scene “${worn.scene?.name}”` : "set on this shot"}).` : "";
      const warnings = [...r.problems.filter((p) => p.level === "warning").map((p) => p.text), ...o.filter((f) => f.level === "warning").map((f) => f.text)].map((t) => ` NOTE: ${t}`).join("");
      return { text: ` ${routeLine(routeOf(box))}${wears}${pictures}${warnings}`, blocked: blocking ? `${blocking.text} ${blocking.fix}` : null };
    },
    [referencesOf, routeOf, outfitFlagsOf, outfitOf],
  );

  const estimatesOf = useCallback(
    (box: StoryboardBox): BoxEstimates => {
      try {
        const continuity = continuityOf(box);
        const cast = castOf(box);
        const isPerformance = box.spec.shotType === "performance";
        const still = isPerformance ? (placeStill(box)?.asset.path ?? null) : selectedStillPath(box);
        const image = imageEstimateUsd(boxShot(box, lyricLines, { aspect, continuity, cast }));
        // a performance shot with a take in sync: the clip is the take, restaged in this shot's scene
        if (box.spec.shotType === "performance") {
          const src = restageSource((mediaByBox.get(box.id) ?? EMPTY_MEDIA).items, syncs);
          if (src.ok) {
            const seconds = restageSeconds(src.source.takeOut - src.source.takeIn);
            const restage = { seconds: seconds ?? 0, takeName: src.source.take.name, takeIn: src.source.takeIn, takeOut: src.source.takeOut };
            if (!seconds) return { image, clip: 0, clipDrawsImage: !still, restage, clipBlocked: `A shot of ${(box.end - box.start).toFixed(1)} s is too long to restage in one piece — split it first` };
            return { image, clip: restageEstimateUsd(seconds) + (still ? 0 : image), clipDrawsImage: !still, restage };
          }
        }
        return { image, clip: clipEstimateUsd(boxShot(box, lyricLines, { stillPath: still, aspect, continuity, cast })), clipDrawsImage: !still };
      } catch {
        return null;
      }
    },
    [selectedStillPath, placeStill, continuityOf, lyricLines, aspect, mediaByBox, syncs],
  );

  // where the image model has no picture of the project's shape, say what is asked for instead, before the spend
  const asked = stillRequestAspect(aspect);
  const shapeNote = asked.exact ? "" : ` The image model has no ${aspect}: the picture is drawn at ${asked.aspect} and shown whole inside the ${aspect} frame, not cropped.`;

  const afterGeneration = useCallback(() => {
    void qc.invalidateQueries({ queryKey: storyboardKeys.assignments(projectId) });
    void qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(projectId) });
    void qc.invalidateQueries({ queryKey: providerJobsKeys.forProject(projectId) });
  }, [qc, projectId]);

  const generateImage = useCallback(
    (box: StoryboardBox) => {
      const est = estimatesOf(box);
      if (!est) {
        toast.info("This shot has no scene to draw yet — write or regenerate its scene first");
        return;
      }
      const notes = generationNotes(box);
      if (notes.blocked) {
        toast.info(notes.blocked);
        return;
      }
      const imagePlan = imageTemporalPlan(box, clock);
      const continuity = continuityOf(box);
      const linkLines = linkLinesOf(box);
      const references = referencesOf(box);
      const source = continuitySource(continuity, { forPlate: !!est.restage });
      const held = source.lines.length
        ? ` It is drawn from the project's own description of ${[continuity.location?.name, ...continuity.props.map((p) => p.name), continuity.lighting?.name].filter(Boolean).join(", ")} — the same words every shot that points there is drawn from.${source.notes.length ? ` ${source.notes.join(" ")}` : ""}`
        : "";
      const old = staleNote(box);
      const opening = imagePlan.mode === "opening_state" ? ` This shot changes ${imagePlan.beats === 1 ? "once" : `${imagePlan.beats} times`} while it plays: the image is the frame it OPENS on, before its beats.` : "";
      setConfirm({
        title: `Generate an image for shot ${numberById.get(box.id) ?? ""}?`,
        body: est.restage
          ? `About ${usd(est.image)} at list price${references.delivered && references.sent.length ? " (the edits route is assumed to cost the same as a plain still; unverified)" : ""}. This is a performance shot: the image is the PLACE from this shot's scene, drawn empty — your take keeps showing, and "Restage" puts your real performance in this place.${held}${opening}${shapeNote}${old}${notes.text}`
          : `About ${usd(est.image)} at list price${references.delivered && references.sent.length ? " (the edits route is assumed to cost the same as a plain still; unverified)" : ""}. The image is drawn from this shot's scene and put on this shot only.${held}${opening}${shapeNote}${old}${notes.text}`,
        confirmLabel: `Generate image · ${usd(est.image)}`,
        testId: "confirm-generate-image",
        onConfirm: () =>
          run(box, "drawing the image…", async () => {
            const r = await generateBoxImage({ projectId, box, lyricLines, aspect, select: !est.restage, continuity, cast: castOf(box), linkLines, references, outfit: outfitOf(box) });
            afterGeneration();
            toast.success(r.rejected > 0 ? `Image ready (${r.rejected} of ${r.candidates} came back as stacked panels and was left out)` : "Image ready");
          }).finally(afterGeneration),
      });
    },
    [estimatesOf, numberById, run, projectId, lyricLines, afterGeneration, aspect, shapeNote, clock, continuityOf, staleNote, generationNotes, linkLinesOf, referencesOf],
  );

  const clipPlanOf = useCallback(
    (box: StoryboardBox): TemporalPlan => {
      const isRestage = box.spec.shotType === "performance" && restageSource((mediaByBox.get(box.id) ?? EMPTY_MEDIA).items, syncs).ok;
      return isRestage ? restageTemporalPlan(box, clock) : clipTemporalPlan(box, clock);
    },
    [clock, mediaByBox, syncs],
  );

  const generateClip = useCallback(
    (box: StoryboardBox) => {
      const est = estimatesOf(box);
      if (!est) {
        toast.info("This shot has no scene to generate from yet — write or regenerate its scene first");
        return;
      }
      if (est.clipBlocked) {
        toast.info(est.clipBlocked);
        return;
      }
      // a method the director or the writer chose that the storyboard cannot make is reported, never swapped
      const route = routeOf(box);
      if (!route.inferred && route.verdict !== "storyboard") {
        toast.info(routeLine(route));
        return;
      }
      const notes = generationNotes(box);
      if (notes.blocked && !(est.restage && placeStill(box))) {
        toast.info(notes.blocked);
        return;
      }
      const continuity = continuityOf(box);
      const linkLines = linkLinesOf(box);
      const references = referencesOf(box);
      // a performance shot set in one of the project's locations is restaged into that location's approved picture
      const place = est.restage ? placeStill(box) : null;
      const stillAsset = est.restage ? (place?.asset ?? null) : selectedStill(box);
      const still = stillAsset?.path ?? null;
      const picture = (caption: string) =>
        stillAsset ? { url: urlFor(stillAsset), caption: place?.of ? `The approved picture of ${place.of.name} — the place of every shot set there` : `${caption} — ${stillAsset.name}` } : undefined;
      if (est.restage) {
        const r = est.restage;
        const src = restageSource((mediaByBox.get(box.id) ?? EMPTY_MEDIA).items, syncs);
        if (!src.ok) {
          toast.info(src.why);
          return;
        }
        const restagePlan = restageTemporalPlan(box, clock);
        const timed =
          restagePlan.mode === "timed_script"
            ? ` This shot changes while it plays — ${beatLines(resolveEvents(box.spec.events, { start: box.start, end: box.end }, clock)).join(" · ")}. The model is given these beats as a script with times. ${restagePlan.timing}`
            : "";
        setConfirm({
          title: `Restage your take for shot ${numberById.get(box.id) ?? ""}?`,
          body:
            `About ${usd(est.clip)} by the provider's own pricing rule. Your real performance from ${r.takeName} (${mmss(r.takeIn)}–${mmss(r.takeOut)} of the take) is re-shot inside this shot's scene: ` +
            `${r.seconds} s of the take go to the video model with ${place?.of ? `the approved picture of ${place.of.name} as the place — the same picture every shot set there is restaged into` : "this shot's image as the place"}` +
            (est.clipDrawsImage ? " (the shot has no image yet, so one is drawn first)" : "") +
            ". He keeps his face and what he wears in the take. The result stays on the song clock and lands on this shot only; it takes several minutes." +
            timed +
            (est.clipDrawsImage ? shapeNote : "") +
            staleNote(box) +
            (wardrobeGapOf(box) ? ` NOTE: ${wardrobeGapOf(box)}` : ""),
          confirmLabel: `Restage take · ${usd(est.clip)}`,
          testId: "confirm-generate-clip",
          picture: picture("The place he is put in"),
          onConfirm: () =>
            run(box, "restaging the take…", async () => {
              let stillPath = still;
              if (!stillPath) {
                setBusyFor(box.id, "drawing the place first…");
                const img = await generateBoxImage({ projectId, box, lyricLines, aspect, select: false, continuity, cast: castOf(box), linkLines, references, outfit: outfitOf(box) });
                afterGeneration();
                stillPath = img.picked;
              }
              await restageBox({ projectId, box, lyricLines, source: src.source, stillPath, maxSeconds: r.seconds, aspect, temporal: restagePlan, continuity, onStage: (t) => setBusyFor(box.id, t) });
              afterGeneration();
              toast.success("The take is being restaged — it will appear on this shot when it is done");
            }).finally(afterGeneration),
        });
        return;
      }
      const submitClip = (temporal: TemporalPlan) =>
        run(box, still ? "sending the clip to render…" : "drawing the image first…", async () => {
          // The image is its own job with its own record (not a step hidden inside the clip's submit): if this page
          // closes while it is drawn, the picture is still filed on the shot by the server.
          let stillPath = still;
          if (!stillPath) {
            const img = await generateBoxImage({ projectId, box, lyricLines, aspect, select: true, continuity, cast: castOf(box), linkLines, references, outfit: outfitOf(box) });
            afterGeneration();
            stillPath = img.picked;
            setBusyFor(box.id, "sending the clip to render…");
          }
          await generateBoxClip({ projectId, box, lyricLines, stillPath, aspect, temporal, continuity, cast: castOf(box), linkLines, outfit: outfitOf(box) });
          afterGeneration();
          toast.success(temporal.mode === "ordered" ? "Clip is rendering with the beats in order — its timing is the model's own" : "Clip is rendering — it will appear on this shot when it is done");
        }).finally(afterGeneration);
      const clipPlan = clipTemporalPlan(box, clock);
      if (clipPlan.mode === "refused" && clipPlan.alternatives.length === 0) {
        // nothing can be asked of any model until the beat says what changes
        toast.info(clipPlan.reason);
        return;
      }
      if (clipPlan.mode === "refused") {
        // a shot that changes is never handed to a model that draws one state as if it were one state
        setConfirm({
          title: `Shot ${numberById.get(box.id) ?? ""} changes while it plays`,
          body:
            `${clipPlan.reason} So a clip of the whole shot is not generated. What can be done instead: ` +
            clipPlan.alternatives.map((a) => ALTERNATIVE_LABEL[a]).join(". ") +
            `. (An effect is set on the beat itself, under Timed beats.) "In order" costs about ${usd(est.clip)} at list price and makes no promise about when each beat happens.`,
          confirmLabel: "Split at the beats",
          testId: "confirm-split-beats",
          onConfirm: () => splitAtBeats(box),
          secondary: { label: `Generate in order · ${usd(est.clip)}`, testId: "confirm-generate-ordered", onConfirm: () => submitClip(clipTemporalPlan(box, clock, { allowOrdered: true })) },
        });
        return;
      }
      setConfirm({
        title: `Generate a clip for shot ${numberById.get(box.id) ?? ""}?`,
        body:
          `About ${usd(est.clip)} at list price` +
          (est.clipDrawsImage ? " — this shot has no image yet, so one is drawn first and the clip is made from it." : " — made from this shot's image.") +
          " The clip takes a few minutes and lands on this shot only." +
          (clipPlan.mode === "single" && clipPlan.effects > 0 ? ` Its ${clipPlan.effects === 1 ? "effect is" : `${clipPlan.effects} effects are`} made by the edit when the shot plays, not drawn into the clip.` : "") +
          (est.clipDrawsImage ? shapeNote : "") +
          staleNote(box),
        confirmLabel: `Generate clip · ${usd(est.clip)}`,
        testId: "confirm-generate-clip",
        picture: picture("The clip is made from this image"),
        onConfirm: () => submitClip(clipPlan),
      });
    },
    [estimatesOf, selectedStill, placeStill, continuityOf, urlFor, numberById, run, projectId, lyricLines, afterGeneration, aspect, shapeNote, mediaByBox, syncs, setBusyFor, clock, splitAtBeats, staleNote, wardrobeGapOf, routeOf, generationNotes, linkLinesOf, referencesOf],
  );

  // --- is what the shot shows still what it wears? (the outfit may have changed since the picture was made) ---------
  const outfitOutdatedOf = useCallback(
    (box: StoryboardBox) => {
      const still = selectedStill(box);
      if (!still) return null;
      const job = jobs.jobs.find((j) => j.result_asset_id === still.id);
      const resolved = outfitOf(box);
      // a picture with no job (uploaded, or from before jobs recorded outfits) is not accused when the shot wears nothing
      if (!job) return resolved.outfit ? `made before the shot wore “${resolved.outfit.name}”` : null;
      return outfitOutdated(resolved, outfitRecordOf(settingsOf(job) as Record<string, unknown> | null), effectiveGarments(box.spec, resolved).ids);
    },
    [selectedStill, jobs.jobs, outfitOf],
  );

  // --- what a clip was asked for, and whether it did it --------------------------------------------------------------
  const requestOf = useCallback(
    (asset: MediaAsset): ClipRequest | null => {
      const job = jobs.jobs.find((j) => j.result_asset_id === asset.id);
      const settings = job ? settingsOf(job) : null;
      if (!job || !settings) return null;
      const payload = (job.request_payload_json ?? {}) as { promptText?: unknown };
      const t = settings.temporal ?? null;
      return {
        mode: t?.mode ?? "single",
        asked: (t?.asked ?? []).map((b) => ({ id: b.id, offset: b.offset, kinds: b.kinds ?? [], says: b.says ?? "" })),
        prompt: typeof payload.promptText === "string" ? payload.promptText : "",
        route: settings.route ?? null,
        submittedAt: job.created_at,
      };
    },
    [jobs.jobs],
  );
  const [measuring, setMeasuring] = useState<Record<string, boolean>>({});
  const measureClip = useCallback(
    async (asset: MediaAsset) => {
      const url = urlFor(asset);
      const request = requestOf(asset);
      if (!url || !request || !asset.isVideo) return;
      setMeasuring((m) => ({ ...m, [asset.id]: true }));
      try {
        const check = await measureClipFile(asset, url, request.asked);
        await saveBeatCheck(asset.id, check);
        await qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(projectId) });
      } catch (e) {
        toast.error(`The clip could not be measured: ${message(e)}`);
      } finally {
        setMeasuring((m) => {
          const { [asset.id]: _gone, ...rest } = m;
          return rest;
        });
      }
    },
    [urlFor, requestOf, qc, projectId],
  );

  // --- a restaged clip against the take it was made from ----------------------------------------------------------------
  const takeOf = useCallback(
    (asset: MediaAsset): { take: MediaAsset; window: [number, number] } | null => {
      const job = jobs.jobs.find((j) => j.result_asset_id === asset.id);
      const from = sourceOfDerived(asset, job ? settingsOf(job) : null);
      const take = from ? media.byId.get(from.assetId) : null;
      return from && take && take.isVideo ? { take, window: from.window } : null;
    },
    [jobs.jobs, media.byId],
  );
  const [checking, setChecking] = useState<Record<string, string>>({});
  const checkAgainstTake = useCallback(
    async (asset: MediaAsset) => {
      const from = takeOf(asset);
      const clipUrl = urlFor(asset);
      const takeUrl = from ? urlFor(from.take) : undefined;
      if (!from || !asset.isVideo) return;
      if (!clipUrl || !takeUrl) {
        toast.info("The files are still being opened — try again in a moment");
        return;
      }
      const stage = (t: string) => setChecking((m) => ({ ...m, [asset.id]: t }));
      stage("loading the face reader…");
      try {
        const check = await measureAgainstTake({ clip: playbackRef(asset), clipUrl, take: playbackRef(from.take), takeUrl, window: from.window, onStage: stage });
        await saveTakeCheck(asset.id, check);
        await qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(projectId) });
      } catch (e) {
        toast.error(`The clip could not be held against its take: ${message(e)}`);
      } finally {
        setChecking((m) => {
          const { [asset.id]: _gone, ...rest } = m;
          return rest;
        });
      }
    },
    [takeOf, urlFor, qc, projectId],
  );

  // --- what a take IS, before anything is generated against it -------------------------------------------------------------
  const [analyzing, setAnalyzing] = useState<Record<string, string>>({});
  const analyzeFootage = useCallback(
    async (asset: MediaAsset) => {
      const url = urlFor(asset);
      if (!asset.isVideo) return;
      if (!url) {
        toast.info("The file is still being opened — try again in a moment");
        return;
      }
      const stage = (t: string) => setAnalyzing((m) => ({ ...m, [asset.id]: t }));
      stage("opening the take…");
      try {
        const next = await analyzeTake({
          asset: { id: asset.id, ...playbackRef(asset) },
          url,
          onStage: stage,
        });
        await saveFootageAnalysis(asset.id, next);
        await qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(projectId) });
      } catch (e) {
        toast.error(`The take could not be read: ${message(e)}`);
      } finally {
        setAnalyzing((m) => {
          const { [asset.id]: _gone, ...rest } = m;
          return rest;
        });
      }
    },
    [urlFor, qc, projectId],
  );

  const footageAnalysisOf = useCallback((asset: MediaAsset) => {
    const kept = asset.footageAnalyses ?? [];
    if (!kept.length) return null;
    const ref = playbackRef(asset);
    // the whole file, until a shot's own stretch is plumbed through — a narrower reading still shows, marked stale
    const first = kept[0];
    return pickAnalysis(kept, {
      fingerprint: {
        bucket: ref.bucket,
        path: ref.path,
        bytes: first.fingerprint.bytes,
        seconds: first.fingerprint.seconds,
        width: first.fingerprint.width,
        height: first.fingerprint.height,
      },
      range: first.analysis.range,
    });
  }, []);

  // --- whether a clip does what it was asked to ---------------------------------------------------------------------------
  // what each generated clip was asked for (off the job that made it), and what the last second opinion found on it
  const asks = useMemo(() => asksByAsset(jobs.jobs), [jobs.jobs]);
  const reviewed = useMemo(() => reviewedByAsset(readStoredReview(project?.treatment_json), assignments, media.byId, asks), [project?.treatment_json, assignments, media.byId, asks]);
  const acceptanceOf = useCallback(
    (asset: MediaAsset): Acceptance | null => {
      if (!asset.isVideo) return null;
      const ask = asks.get(asset.id);
      return ask ? acceptanceFor({ ask, beatCheck: asset.beatCheck ?? null, takeCheck: asset.takeCheck ?? null, record: asset.acceptance ?? null, reviewed: reviewed.get(asset.id) ?? null }) : null;
    },
    [asks, reviewed],
  );
  const judge = useCallback(
    async (asset: MediaAsset, requirement: Requirement, finding: "meets" | "fails" | null, note: string) => {
      try {
        await saveJudgement(asset.id, requirement, finding, note);
        await qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(projectId) });
      } catch (e) {
        toast.error(`The judgement could not be kept: ${message(e)}`);
      }
    },
    [qc, projectId],
  );

  // --- continuity entities ----------------------------------------------------------------------------------------
  const entityRun = useCallback(async (entityId: string, text: string, work: () => Promise<void>) => {
    setEntityBusy((b) => ({ ...b, [entityId]: text }));
    try {
      await work();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setEntityBusy((b) => {
        const { [entityId]: _gone, ...rest } = b;
        return rest;
      });
    }
  }, []);

  const createOutfit = useCallback(
    async (name: string, garmentFeatureIds: string[], description?: string) => {
      try {
        const e = await entityMutations.create.mutateAsync({ kind: "outfit", name, description, outfit: { garmentFeatureIds }, takenKeys: entities.map((x) => x.key) });
        return isOutfit(e) ? e : null;
      } catch (e) {
        toast.error(message(e));
        return null;
      }
    },
    [entityMutations.create, entities],
  );

  const createEntity = useCallback(
    async (kind: EntityKind, name: string, cast?: CastFacts) => {
      try {
        return await entityMutations.create.mutateAsync({ kind, name, cast, takenKeys: entities.map((e) => e.key) });
      } catch (e) {
        toast.error(message(e));
        return null;
      }
    },
    [entityMutations.create, entities],
  );


  const saveCast = useCallback(
    (box: StoryboardBox, cast: CastOverride) =>
      run(box, "saving…", async () => {
        const next: BoxOverride = { ...(box.override ?? BLANK_OVERRIDE), cast: { ...(box.override?.cast ?? {}), ...cast } };
        await writeBoxes.mutateAsync({ updates: [{ id: box.id, write: applyOverride(box, editedOverride(box.override, next), new Date().toISOString(), "edit") }] });
      }),
    [run, writeBoxes],
  );

  const saveEntity = useCallback(
    (entity: ContinuityEntity, patch: EntityPatch) =>
      entityRun(entity.id, "saving…", async () => {
        await entityMutations.update.mutateAsync({ id: entity.id, patch });
      }),
    [entityRun, entityMutations.update],
  );

  const generateEntityPicture = useCallback(
    (entity: ContinuityEntity) => {
      const refusal = entityPictureRefusal(entity);
      if (refusal) {
        toast.info(refusal);
        return;
      }
      let estimate = 0;
      try {
        estimate = imageEstimateUsd(entityShot(entity, aspect));
      } catch (e) {
        toast.info(message(e));
        return;
      }
      const used = entityUsage.get(entity.key)?.length ?? 0;
      setConfirm({
        title: `Draw reference pictures of ${entity.name}?`,
        body:
          `About ${usd(estimate)} at list price. ${entity.kind === "location" ? "The place is drawn empty, from its description here" : entity.kind === "character" ? "The person is drawn alone, from the description here" : "The object is drawn alone, from its description here"}, and the pictures are kept with ${entity.name}. ` +
          `Nothing is approved for you: choose the one that is right.` +
          (entity.kind === "location"
            ? ` The approved picture is the place every performance shot set in ${entity.name} is restaged into${used ? ` (${used} shot${used === 1 ? "" : "s"} now)` : ""}.`
            : entity.kind === "character"
              ? ` The approved picture is sent with every shot ${entity.name} is cast in${used ? ` (${used} shot${used === 1 ? "" : "s"} now)` : ""}, so they look the same in each.`
              : " The image model reads a prop's description, not its picture: the picture is the reference for your eye."),
        confirmLabel: `Draw pictures · ${usd(estimate)}`,
        testId: "confirm-entity-picture",
        onConfirm: () =>
          entityRun(entity.id, "drawing…", async () => {
            const r = await generateEntityReference({ projectId, entity, aspect });
            afterGeneration();
            if (r.assetIds.length === 0) throw new Error("No picture came back whole.");
            await entityMutations.update.mutateAsync({ id: entity.id, patch: { referenceAssetIds: [...new Set([...entity.referenceAssetIds, ...r.assetIds])] } });
            toast.success(`${r.assetIds.length} picture${r.assetIds.length === 1 ? "" : "s"} of ${entity.name} ready — approve the one that is right`);
          }),
      });
    },
    [aspect, entityUsage, entityRun, projectId, afterGeneration, entityMutations.update],
  );

  const useShotImageFor = useCallback(
    (box: StoryboardBox, entity: ContinuityEntity) =>
      entityRun(entity.id, "saving…", async () => {
        const image = selectedStill(box);
        if (!image) throw new Error("This shot has no image of its own to use.");
        await entityMutations.update.mutateAsync({ id: entity.id, patch: withReference(entity, image.id, true) });
        toast.success(`This shot's image is now the approved picture of ${entity.name}`);
      }),
    [entityRun, selectedStill, entityMutations.update],
  );

  const saveContinuity = useCallback(
    (box: StoryboardBox, refs: ContinuityOverride) =>
      run(box, "saving…", async () => {
        const next: BoxOverride = { ...(box.override ?? BLANK_OVERRIDE), continuity: { ...(box.override?.continuity ?? {}), ...refs } };
        await writeBoxes.mutateAsync({ updates: [{ id: box.id, write: applyOverride(box, editedOverride(box.override, next), new Date().toISOString(), "edit") }] });
      }),
    [run, writeBoxes],
  );

  const loading = boxesQuery.isLoading || inputs.projectQuery.isLoading;
  const error = boxesQuery.error ? message(boxesQuery.error) : null;

  // keep the project (treatment text) fresh when another page of the workflow changed it
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
  }, [qc, projectId]);

  return {
    projectId,
    loading,
    error,
    boxes,
    numberOf: (id) => numberById.get(id) ?? 0,
    mediaOf: (id) => mediaByBox.get(id) ?? EMPTY_MEDIA,
    urlFor,
    lyricsOf: (box) => ({
      lines: lyricLines ? lyricsForShot(lyricLines, { start: box.start, end: box.end }) : [],
      state: lyricLines ? lyricStateForShot(lyricLines, { start: box.start, end: box.end }) : "unknown",
    }),
    energyOf: (box) => (beatGrid.length ? energyForWindow(box, beatGrid) : null),
    jobOf: (box) => jobs.byKey[box.key] ?? null,
    busyOf: (id) => busy[id] ?? null,
    estimatesOf,
    rewriteBlockedReason,
    library,
    migrated,
    hasTreatment: hasTreatment(doc),
    staleOf,
    wardrobeGapOf,
    aspect,
    saveEdit,
    resetBox,
    rewrite,
    restoreVersion,
    eventsOf,
    clock,
    saveEvents,
    splitAtBeats,
    clipPlanOf,
    requestOf,
    measureClip,
    measuringOf: (id) => !!measuring[id],
    takeOf,
    checkAgainstTake,
    checkingOf: (id) => checking[id] ?? null,
    analyzeFootage,
    footageAnalysisOf,
    analyzingOf: (id) => analyzing[id] ?? null,
    acceptanceOf,
    judge,
    entities,
    looks,
    continuityOf,
    entityUsage,
    picturesOf,
    entityBusyOf: (id) => entityBusy[id] ?? null,
    createEntity,
    saveEntity,
    outfits,
    scenes,
    outfitOf,
    piecesOf,
    outfitFlagsOf,
    outfitOutdatedOf,
    proposedScenes,
    createOutfit,
    createScene,
    saveScene,
    removeScene,
    adoptProposedScenes,
    sceneBusy: sceneMutations.create.isPending || sceneMutations.update.isPending || sceneMutations.remove.isPending || sceneMutations.createMany.isPending,
    generateEntityPicture,
    useShotImageFor,
    saveContinuity,
    castOf,
    castProblemsOf,
    saveCast,
    wardrobe,
    linksOf,
    routeOf,
    referencesOf,
    stillRequestOf,
    toggleLock,
    split,
    mergeWithNext,
    assign,
    select,
    showBaseLayer,
    takeOff,
    moveTo,
    generateImage,
    generateClip,
    focusId,
    openFocus: setFocusId,
    pickerFor,
    openPicker: setPickerFor,
    confirm,
    askConfirm: setConfirm,
  };
}

export { invalidateStoryboard };
function invalidateStoryboard(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  void qc.invalidateQueries({ queryKey: storyboardKeys.boxes(projectId) });
  void qc.invalidateQueries({ queryKey: storyboardKeys.assignments(projectId) });
}
