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
import { providerJobsKeys } from "@/lib/providerJobs/queries";
import {
  applyOverride,
  directorSet,
  editedOverride,
  machineContext,
  neighbourSummaries,
  planMerge,
  planSplit,
  rewrittenOverride,
  writeOf,
  type BoxOverride,
  type StoryboardBox,
} from "@/lib/storyboard/boxes";
import { ensureStoryboardMaterialized, type MaterializeResult } from "@/lib/storyboard/build";
import { aspectOfProject, stillRequestAspect, type ProjectAspect } from "@/lib/project/aspect";
import { boxShot, clipEstimateUsd, generateBoxClip, generateBoxImage, imageEstimateUsd } from "@/lib/storyboard/generate";
import { restageBox, restageEstimateUsd, restageSeconds, restageSource } from "@/lib/storyboard/restage";
import {
  boxMedia,
  planAssign,
  planDeselect,
  planMove,
  planMoveAll,
  planSelect,
  roleForAsset,
  type AssignmentRole,
  type BoxMedia,
  type BoxMediaItem,
  type MediaAsset,
} from "@/lib/storyboard/media";
import { energyForWindow } from "@/lib/storyboard/rewrite";
import { buildClipGrid, type ClipEnergy } from "@/lib/treatment/grid";
import { DEFAULT_MOTION_TEMPLATE, regenerateShotFromLyrics, type RegenerateMode } from "@/lib/treatment/regenerateFromLyrics";
import { directorNotes, hasTreatment, parseTreatmentDoc } from "@/lib/treatment/treatmentDoc";
import { mediaRefKey, playbackRef, useSignedRefs } from "./signedUrls";

const mmss = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export type ConfirmRequest = {
  title: string;
  body: string;
  confirmLabel: string;
  testId: string;
  onConfirm: () => void | Promise<void>;
};

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
  /** The project's frame: what every stage is shaped as and what images and clips are asked for. */
  aspect: ProjectAspect;

  saveEdit: (box: StoryboardBox, next: BoxOverride) => Promise<void>;
  resetBox: (box: StoryboardBox) => Promise<void>;
  rewrite: (box: StoryboardBox, mode?: RegenerateMode) => Promise<void>;
  restoreVersion: (box: StoryboardBox, entry: { direction?: string; purpose?: string; frame?: string }) => Promise<void>;
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

  const boxes = useMemo(() => boxesQuery.data ?? [], [boxesQuery.data]);
  const assignments = useMemo(() => assignmentsQuery.data ?? [], [assignmentsQuery.data]);
  const syncs = useMemo(() => syncsQuery.data ?? [], [syncsQuery.data]);
  const doc = useMemo(() => parseTreatmentDoc(project?.treatment_json), [project?.treatment_json]);
  const aspect = aspectOfProject(project);

  const [busy, setBusy] = useState<Record<string, string>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [migrated, setMigrated] = useState<MaterializeResult | null>(null);

  const setBusyFor = useCallback((id: string, text: string | null) => {
    setBusy((b) => {
      if (text) return { ...b, [id]: text };
      const { [id]: _gone, ...rest } = b;
      return rest;
    });
  }, []);

  // --- the one-time move from the old storyboard (treatment_json + shot_overrides) onto box records ---------------
  const ensured = useRef(false);
  useEffect(() => {
    if (ensured.current || !project || boxesQuery.isLoading || boxesQuery.data === undefined) return;
    if (boxesQuery.data.length > 0) {
      ensured.current = true;
      return;
    }
    ensured.current = true;
    void ensureStoryboardMaterialized({ projectId, treatmentJson: project.treatment_json, lyricLines })
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

  const refs = useMemo(() => {
    const seen = new Map<string, { bucket: string; path: string }>();
    for (const m of mediaByBox.values()) for (const i of m.items) {
      const r = playbackRef(i.asset);
      seen.set(mediaRefKey(r), r);
    }
    return [...seen.values()];
  }, [mediaByBox]);
  const urls = useSignedRefs(refs);
  const urlFor = useCallback((asset: MediaAsset) => urls[mediaRefKey(playbackRef(asset))], [urls]);

  const beatGrid = useMemo(() => (analysis ? buildClipGrid({ analysis }) : []), [analysis]);

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
        await writeBoxes.mutateAsync({ updates: [{ id: box.id, write: applyOverride(box, editedOverride(box.override, next), at, "edit") }] });
        toast.success("Saved");
      }),
    [run, writeBoxes],
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
        const state = machineContext({
          box,
          performance: take ? { takeName: take.asset.name, range: { start: take.sourceIn!, end: take.sourceOut! }, shows: take.asset.shows ?? null, filmedIn: take.asset.filmedIn ?? null } : null,
          media: m.items.filter((i) => !i.base).map((i) => ({ role: i.role, name: i.asset.name, selected: i.selected })),
          look: { name: inputs.looks[0]?.name ?? null, description: box.spec.wardrobe.description },
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
        });
        const at = new Date().toISOString();
        await writeBoxes.mutateAsync({ updates: [{ id: box.id, write: applyOverride(box, next, at, "rewrite") }] });
        toast.success("Scene rewritten — the earlier version is under Versions");
      }),
    [run, rewriteBlockedReason, mediaByBox, inputs, doc, project, projectId, lyricLines, boxes, writeBoxes],
  );

  const restoreVersion = useCallback(
    (box: StoryboardBox, entry: { direction?: string; purpose?: string; frame?: string }) =>
      run(box, "restoring…", async () => {
        const next: BoxOverride = {
          ...(box.override ?? { direction: null, cameraMotion: null, framing: null, transitionIn: null, requiredElements: null, notes: null }),
          direction: entry.direction || entry.purpose || null,
          frame: entry.frame ?? null,
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
        const plan = planSplit(box, atSeconds, boxes.map((b) => b.key), new Date().toISOString());
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
    [run, boxes, writeBoxes, assignments, applyOps],
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
            const write = planMerge(box, next, new Date().toISOString());
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
    [boxes, run, applyOps, assignments, projectId, writeBoxes, focusId, qc],
  );

  // --- footage --------------------------------------------------------------------------------------------------
  const assign = useCallback(
    (box: StoryboardBox, asset: MediaAsset, role?: AssignmentRole) =>
      run(box, "adding…", async () => {
        const r = role ?? roleForAsset(asset);
        if (!r) throw new Error("That file cannot be put on a shot");
        await applyOps.mutateAsync(planAssign({ assignments, shotId: box.id, assetId: asset.id, role: r }));
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
  const selectedStillPath = useCallback(
    (box: StoryboardBox): string | null => {
      const items = (mediaByBox.get(box.id) ?? EMPTY_MEDIA).items.filter((i) => i.role === "generated_image");
      const pick = items.find((i) => i.selected) ?? items[0];
      return pick && pick.asset.bucket === "project-references" ? pick.asset.path : null;
    },
    [mediaByBox],
  );

  const estimatesOf = useCallback(
    (box: StoryboardBox): BoxEstimates => {
      try {
        const still = selectedStillPath(box);
        const image = imageEstimateUsd(boxShot(box, lyricLines, { aspect }));
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
        return { image, clip: clipEstimateUsd(boxShot(box, lyricLines, { stillPath: still, aspect })), clipDrawsImage: !still };
      } catch {
        return null;
      }
    },
    [selectedStillPath, lyricLines, aspect, mediaByBox, syncs],
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
      setConfirm({
        title: `Generate an image for shot ${numberById.get(box.id) ?? ""}?`,
        body: est.restage
          ? `About ${usd(est.image)} at list price. This is a performance shot: the image is the PLACE from this shot's scene, drawn empty — your take keeps showing, and "Restage" puts your real performance in this place.${shapeNote}`
          : `About ${usd(est.image)} at list price. The image is drawn from this shot's scene and put on this shot only.${shapeNote}`,
        confirmLabel: `Generate image · ${usd(est.image)}`,
        testId: "confirm-generate-image",
        onConfirm: () =>
          run(box, "drawing the image…", async () => {
            const r = await generateBoxImage({ projectId, box, lyricLines, aspect, select: !est.restage });
            afterGeneration();
            toast.success(r.rejected > 0 ? `Image ready (${r.rejected} of ${r.candidates} came back as stacked panels and was left out)` : "Image ready");
          }).finally(afterGeneration),
      });
    },
    [estimatesOf, numberById, run, projectId, lyricLines, afterGeneration, aspect, shapeNote],
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
      const still = selectedStillPath(box);
      if (est.restage) {
        const r = est.restage;
        const src = restageSource((mediaByBox.get(box.id) ?? EMPTY_MEDIA).items, syncs);
        if (!src.ok) {
          toast.info(src.why);
          return;
        }
        setConfirm({
          title: `Restage your take for shot ${numberById.get(box.id) ?? ""}?`,
          body:
            `About ${usd(est.clip)} at list price. Your real performance from ${r.takeName} (${mmss(r.takeIn)}–${mmss(r.takeOut)} of the take) is re-shot inside this shot's scene: ` +
            `${r.seconds} s of the take go to the video model with this shot's image as the place` +
            (est.clipDrawsImage ? " (the shot has no image yet, so one is drawn first)" : "") +
            ". He keeps his face and what he wears in the take. The result stays on the song clock and lands on this shot only; it takes several minutes." +
            (est.clipDrawsImage ? shapeNote : ""),
          confirmLabel: `Restage take · ${usd(est.clip)}`,
          testId: "confirm-generate-clip",
          onConfirm: () =>
            run(box, "restaging the take…", async () => {
              let stillPath = still;
              if (!stillPath) {
                setBusyFor(box.id, "drawing the place first…");
                const img = await generateBoxImage({ projectId, box, lyricLines, aspect, select: false });
                afterGeneration();
                stillPath = img.picked;
              }
              await restageBox({ projectId, box, lyricLines, source: src.source, stillPath, maxSeconds: r.seconds, aspect, onStage: (t) => setBusyFor(box.id, t) });
              afterGeneration();
              toast.success("The take is being restaged — it will appear on this shot when it is done");
            }).finally(afterGeneration),
        });
        return;
      }
      setConfirm({
        title: `Generate a clip for shot ${numberById.get(box.id) ?? ""}?`,
        body:
          `About ${usd(est.clip)} at list price` +
          (est.clipDrawsImage ? " — this shot has no image yet, so one is drawn first and the clip is made from it." : " — made from this shot's image.") +
          " The clip takes a few minutes and lands on this shot only." +
          (est.clipDrawsImage ? shapeNote : ""),
        confirmLabel: `Generate clip · ${usd(est.clip)}`,
        testId: "confirm-generate-clip",
        onConfirm: () =>
          run(box, "sending the clip to render…", async () => {
            await generateBoxClip({ projectId, box, lyricLines, stillPath: still, aspect });
            afterGeneration();
            toast.success("Clip is rendering — it will appear on this shot when it is done");
          }).finally(afterGeneration),
      });
    },
    [estimatesOf, selectedStillPath, numberById, run, projectId, lyricLines, afterGeneration, aspect, shapeNote, mediaByBox, syncs, setBusyFor],
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
    aspect,
    saveEdit,
    resetBox,
    rewrite,
    restoreVersion,
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
