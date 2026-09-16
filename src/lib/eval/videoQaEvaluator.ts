/**
 * Lane E2 — video-level automated evaluator.
 *
 * Scores reconstructed clips / MP4 frame packs. Does not reopen chest 11/11
 * or sleeve 6/6 still goldens. Does not decode MP4 (Lane H supplies rasters).
 * paidCalls stays false. Claude investigates unexplained[] only.
 */

import {
  MAX_CENTROID_DRIFT_PX,
  MAX_INSIDE_MEAN_ABS_LUMA_DELTA,
  MAX_MASK_XOR_MAX,
  MAX_MASK_XOR_MEAN,
  MAX_OUTSIDE_EXCESS_MEAN_ABS_LUMA,
  MAX_REPAIR_COVERAGE,
  MAX_REPAIR_COVERAGE_FRAME_DELTA,
  MAX_SEAM_TEMPORAL_MEAN_ABS_LUMA,
  MAX_UNAUTHORIZED_CHANGED_FRAC,
  MAX_UNAUTHORIZED_CHANGED_PIXELS,
  VIDEO_QA_CRITERION_NAMES,
  VIDEO_QA_NOT_CLAIMED,
} from "./videoQaCriteria";
import {
  boxFromIndices,
  hypot,
  makeCrop,
  maxOf,
  meanOf,
  scoreFrame,
  scorePair,
  worstAbsDiffCrop,
} from "./videoQaMetrics";
import type {
  VideoQaCriterion,
  VideoQaCriterionId,
  VideoQaEscalate,
  VideoQaInput,
  VideoQaReport,
  VideoQaTemporal,
  VideoQaVerdict,
} from "./videoQaTypes";
import { VIDEO_QA_SPEC_VERSION } from "./videoQaTypes";

function criterion(
  id: VideoQaCriterionId,
  verdict: VideoQaCriterion["verdict"],
  metrics: Record<string, number>,
  note: string,
  failureReason: string | null,
): VideoQaCriterion {
  return {
    id,
    name: VIDEO_QA_CRITERION_NAMES[id],
    verdict,
    metrics,
    note,
    failureReason: verdict === "FAIL" ? failureReason : null,
  };
}

function finish(
  criteria: VideoQaCriterion[],
  extras: Omit<
    VideoQaReport,
    | "schemaVersion"
    | "verdict"
    | "passCount"
    | "failCount"
    | "skipCount"
    | "criteria"
    | "paidCalls"
    | "stillGoldensReopened"
    | "blockingArtifactProducer"
    | "claudeInvestigates"
  >,
): VideoQaReport {
  const passCount = criteria.filter((c) => c.verdict === "PASS").length;
  const failCount = criteria.filter((c) => c.verdict === "FAIL").length;
  const skipCount = criteria.filter((c) => c.verdict === "SKIP").length;
  let verdict: VideoQaVerdict;
  if (failCount > 0) verdict = "FAIL";
  else if (extras.awaiting.length > 0 || extras.unexplained.length > 0) verdict = "INCOMPLETE";
  else verdict = "PASS";
  return {
    schemaVersion: VIDEO_QA_SPEC_VERSION,
    verdict,
    passCount,
    failCount,
    skipCount,
    paidCalls: false,
    stillGoldensReopened: false,
    blockingArtifactProducer: false,
    claudeInvestigates: "unexplained_only",
    criteria,
    ...extras,
  };
}

/**
 * Score a reconstructed clip / MP4 frame pack.
 * Never invokes the chest 11-point still scorer. Never blocks Lane H MP4 production.
 */
export function evaluateVideoQa(input: VideoQaInput): VideoQaReport {
  const unexplained: string[] = [];
  const awaiting: string[] = [];
  const paidOk = input.paidCalls === false;
  const frames = input.artifact?.frames ?? [];
  const mp4 = input.artifact?.mp4 ?? null;
  const artifactKind = input.artifact?.kind ?? "reconstructed_frames";
  const provenance = input.provenance ?? {};

  const paid = criterion(
    "paid_calls_false",
    paidOk ? "PASS" : "FAIL",
    { paidCalls: paidOk ? 0 : 1 },
    "Lane E2 is $0. paidCalls must stay false.",
    "paidCalls was not false",
  );

  const stillLock = criterion(
    "still_goldens_not_reopened",
    "PASS",
    { chest11: 0, sleeve6: 0 },
    "This evaluator never calls chest 11/11 or sleeve 6/6 gates.",
    "still goldens were reopened",
  );

  const mp4Produced = mp4?.produced === true;
  const hasFrames = frames.length > 0;
  if (mp4Produced && !hasFrames) awaiting.push("decoded_frames");
  if (!hasFrames && !mp4Produced) awaiting.push("reconstructed_frames_or_mp4");

  const mp4Scored = criterion(
    "mp4_artifact_scored",
    mp4Produced && hasFrames
      ? "PASS"
      : mp4Produced && !hasFrames
        ? "SKIP"
        : artifactKind === "reconstructed_frames" && hasFrames
          ? "SKIP"
          : "SKIP",
    {
      produced: mp4Produced ? 1 : 0,
      decodedFrames: frames.length,
    },
    mp4Produced && hasFrames
      ? "Lane H MP4 provenance present and decoded frames scored."
      : mp4Produced
        ? "MP4 produced; waiting on decoded rasters. Does not block Lane H."
        : "Frame-pack path (no MP4 yet). Lane H may attach mp4 later.",
    "MP4 artifact missing",
  );

  if (!hasFrames) {
    const skippedIds: VideoQaCriterionId[] = [
      "per_frame_repair_coverage",
      "original_master_preservation",
      "unintended_outside_region_change",
      "mask_discontinuity",
      "temporal_jitter_drift",
      "seam_edge_instability",
    ];
    const skipped = skippedIds.map((id) =>
      criterion(id, "SKIP", {}, "No decoded frames yet.", "no frames"),
    );
    return finish([paid, stillLock, mp4Scored, ...skipped], {
      awaiting,
      frameCount: 0,
      artifactKind,
      mp4,
      perFrame: [],
      temporal: emptyTemporal(),
      artifacts: { crops: [] },
      unexplained,
      escalate: null,
      notClaimed: [...VIDEO_QA_NOT_CLAIMED],
      provenance,
    });
  }

  const frameScores = frames.map(scoreFrame);
  for (const s of frameScores) unexplained.push(...s.unexplained);
  const perFrame = frameScores.map((s) => s.perFrame);

  const repairCoverages = perFrame.map((p) => p.repairCoverage);
  const hasRepair = repairCoverages.some((v) => v !== null);
  let repairVerdict: VideoQaCriterion["verdict"] = "SKIP";
  let repairFail: string | null = null;
  let repairDelta = 0;
  if (hasRepair) {
    const present = repairCoverages.filter((v): v is number => v !== null);
    const maxCov = Math.max(...present);
    const deltas: number[] = [];
    for (let i = 1; i < repairCoverages.length; i++) {
      const a = repairCoverages[i - 1];
      const b = repairCoverages[i];
      if (a === null || b === null) continue;
      deltas.push(Math.abs(b - a));
    }
    repairDelta = deltas.length ? Math.max(...deltas) : 0;
    if (maxCov > MAX_REPAIR_COVERAGE) {
      repairVerdict = "FAIL";
      repairFail = `repair coverage ${maxCov} exceeds ${MAX_REPAIR_COVERAGE}`;
    } else if (repairDelta > MAX_REPAIR_COVERAGE_FRAME_DELTA) {
      repairVerdict = "FAIL";
      repairFail = `repair coverage jumped ${repairDelta} (max ${MAX_REPAIR_COVERAGE_FRAME_DELTA})`;
    } else {
      repairVerdict = "PASS";
    }
  }
  const repairCrit = criterion(
    "per_frame_repair_coverage",
    repairVerdict,
    {
      framesWithRepair: repairCoverages.filter((v) => v !== null).length,
      maxCoverage: hasRepair
        ? Math.max(...repairCoverages.filter((v): v is number => v !== null))
        : 0,
      maxFrameDelta: repairDelta,
    },
    hasRepair
      ? "Repair α > 0.5 fraction per frame; FAIL on coverage jumps, not still rescoring."
      : "repairAlpha omitted — coverage not scored.",
    repairFail,
  );

  const changed = perFrame.map((p) => p.unauthorizedChangedPixels);
  const frac = perFrame.map((p) => p.unauthorizedChangedFrac);
  const hasAuth = changed.some((v) => v !== null);
  const totalChanged = hasAuth ? changed.reduce((s, v) => s + (v ?? 0), 0) : 0;
  const maxFrac = hasAuth ? Math.max(...frac.map((v) => v ?? 0)) : 0;
  const preservationPass =
    hasAuth &&
    totalChanged <= MAX_UNAUTHORIZED_CHANGED_PIXELS &&
    maxFrac <= MAX_UNAUTHORIZED_CHANGED_FRAC;
  const preserveCrit = criterion(
    "original_master_preservation",
    !hasAuth ? "SKIP" : preservationPass ? "PASS" : "FAIL",
    { unauthorizedChangedPixels: totalChanged, maxUnauthorizedChangedFrac: maxFrac },
    "α === 0 reconstructed RGB must be byte-identical to original master.",
    "unauthorized pixels drifted from original RGB",
  );
  const outsideCrit = criterion(
    "unintended_outside_region_change",
    !hasAuth ? "SKIP" : preservationPass ? "PASS" : "FAIL",
    { unauthorizedChangedPixels: totalChanged, maxUnauthorizedChangedFrac: maxFrac },
    "Outside the authorized region, reconstructed must not invent pixels.",
    "unintended RGB change outside authorized α",
  );

  const pairs = [];
  for (let i = 1; i < frames.length; i++) {
    pairs.push(scorePair(frames[i - 1]!, frames[i]!));
  }
  const temporal: VideoQaTemporal = {
    maskXorMean: meanOf(pairs.map((p) => p.maskXorFrac)),
    maskXorMax: maxOf(pairs.map((p) => p.maskXorFrac)),
    outsideExcessMeanAbsLuma: meanOf(pairs.map((p) => p.outsideExcessMeanAbsLuma)),
    insideMeanAbsLumaDelta: meanOf(pairs.map((p) => p.insideMeanAbsLumaDelta)),
    seamTemporalMeanAbsLuma: meanOf(pairs.map((p) => p.seamTemporalMeanAbsLuma)),
    centroidDriftPx: centroidDrift(frameScores),
  };

  const needPairs = frames.length >= 2 && hasAuth;
  const maskFail =
    needPairs &&
    ((temporal.maskXorMean !== null && temporal.maskXorMean > MAX_MASK_XOR_MEAN) ||
      (temporal.maskXorMax !== null && temporal.maskXorMax > MAX_MASK_XOR_MAX));
  const maskCrit = criterion(
    "mask_discontinuity",
    !needPairs ? "SKIP" : maskFail ? "FAIL" : "PASS",
    {
      maskXorMean: temporal.maskXorMean ?? -1,
      maskXorMax: temporal.maskXorMax ?? -1,
    },
    "Frame-to-frame XOR of binarized authorized masks.",
    "authorized mask jumped between adjacent frames",
  );

  const jitterFail =
    needPairs &&
    ((temporal.outsideExcessMeanAbsLuma !== null &&
      temporal.outsideExcessMeanAbsLuma > MAX_OUTSIDE_EXCESS_MEAN_ABS_LUMA) ||
      (temporal.insideMeanAbsLumaDelta !== null &&
        temporal.insideMeanAbsLumaDelta > MAX_INSIDE_MEAN_ABS_LUMA_DELTA) ||
      (temporal.centroidDriftPx !== null && temporal.centroidDriftPx > MAX_CENTROID_DRIFT_PX));
  const jitterCrit = criterion(
    "temporal_jitter_drift",
    !needPairs ? "SKIP" : jitterFail ? "FAIL" : "PASS",
    {
      outsideExcessMeanAbsLuma: temporal.outsideExcessMeanAbsLuma ?? -1,
      insideMeanAbsLumaDelta: temporal.insideMeanAbsLumaDelta ?? -1,
      centroidDriftPx: temporal.centroidDriftPx ?? -1,
    },
    "Outside excess luma vs original motion; inside boiling; changed-region centroid drift.",
    "temporal jitter or centroid drift exceeded provisional gate",
  );

  const seamFail =
    needPairs &&
    temporal.seamTemporalMeanAbsLuma !== null &&
    temporal.seamTemporalMeanAbsLuma > MAX_SEAM_TEMPORAL_MEAN_ABS_LUMA;
  const seamCrit = criterion(
    "seam_edge_instability",
    !needPairs ? "SKIP" : seamFail ? "FAIL" : "PASS",
    { seamTemporalMeanAbsLuma: temporal.seamTemporalMeanAbsLuma ?? -1 },
    "Frame-to-frame |Δluma| on mask-boundary / soft-α pixels.",
    "seam/edge luma oscillated across frames",
  );

  const crops = diagnosticCrops(frames, frameScores);
  const escalate = buildEscalate(preservationPass, hasAuth, totalChanged);

  return finish(
    [
      paid,
      stillLock,
      mp4Scored,
      repairCrit,
      preserveCrit,
      outsideCrit,
      maskCrit,
      jitterCrit,
      seamCrit,
    ],
    {
      awaiting,
      frameCount: frames.length,
      artifactKind,
      mp4,
      perFrame,
      temporal,
      artifacts: { crops },
      unexplained,
      escalate,
      notClaimed: [...VIDEO_QA_NOT_CLAIMED],
      provenance,
    },
  );
}

function emptyTemporal(): VideoQaTemporal {
  return {
    maskXorMean: null,
    maskXorMax: null,
    outsideExcessMeanAbsLuma: null,
    insideMeanAbsLumaDelta: null,
    seamTemporalMeanAbsLuma: null,
    centroidDriftPx: null,
  };
}

function centroidDrift(
  scores: Array<{
    maskCx: number | null;
    maskCy: number | null;
    changedCx: number | null;
    changedCy: number | null;
  }>,
): number | null {
  const ds: number[] = [];
  for (const s of scores) {
    if (s.maskCx === null || s.maskCy === null || s.changedCx === null || s.changedCy === null)
      continue;
    ds.push(hypot(s.changedCx - s.maskCx, s.changedCy - s.maskCy));
  }
  return meanOf(ds);
}

function diagnosticCrops(
  frames: VideoQaInput["artifact"]["frames"],
  scores: ReturnType<typeof scoreFrame>[],
) {
  const usable = scores
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.unexplained.length === 0 && rasterReady(frames[i]!));
  if (usable.length === 0) return [];

  let worstOutside = usable[0]!;
  let worstSeam = usable[0]!;
  for (const u of usable) {
    if (
      (u.s.perFrame.unauthorizedChangedPixels ?? -1) >
      (worstOutside.s.perFrame.unauthorizedChangedPixels ?? -1)
    ) {
      worstOutside = u;
    }
    if ((u.s.perFrame.seamPixelCount ?? -1) > (worstSeam.s.perFrame.seamPixelCount ?? -1)) {
      worstSeam = u;
    }
  }

  const crops = [];
  const outsideFrame = frames[worstOutside.i]!;
  const leakIdx: number[] = [];
  if (outsideFrame.authorizedAlpha) {
    const n = outsideFrame.original.width * outsideFrame.original.height;
    const w = outsideFrame.original.width;
    for (let i = 0; i < n; i++) {
      if (outsideFrame.authorizedAlpha[i] !== 0) continue;
      const p = i * 4;
      const o = outsideFrame.original.data;
      const r = outsideFrame.reconstructed.data;
      if (o[p] !== r[p] || o[p + 1] !== r[p + 1] || o[p + 2] !== r[p + 2]) leakIdx.push(i);
    }
  }
  const leakBox = boxFromIndices(
    leakIdx.length ? leakIdx : [0],
    outsideFrame.original.width,
    outsideFrame.original.height,
  );
  if (leakBox) {
    crops.push(
      makeCrop(`outside_change_f${outsideFrame.index}`, outsideFrame.reconstructed, leakBox),
    );
  }

  const seamFrame = frames[worstSeam.i]!;
  const seamBox = boxFromIndices(
    worstSeam.s.seamIndices.length ? worstSeam.s.seamIndices : [0],
    seamFrame.original.width,
    seamFrame.original.height,
  );
  if (seamBox) {
    crops.push(makeCrop(`seam_f${seamFrame.index}`, seamFrame.reconstructed, seamBox));
  }

  const jitter = usable[Math.min(1, usable.length - 1)]!;
  const jitterFrame = frames[jitter.i]!;
  crops.push(
    worstAbsDiffCrop(
      jitterFrame.original,
      jitterFrame.reconstructed,
      `abs_diff_f${jitterFrame.index}`,
    ),
  );
  return crops.slice(0, 4);
}

function rasterReady(frame: VideoQaInput["artifact"]["frames"][number]): boolean {
  return (
    frame.original.width > 0 &&
    frame.reconstructed.width === frame.original.width &&
    frame.reconstructed.height === frame.original.height
  );
}

function buildEscalate(
  preservationPass: boolean,
  hasAuth: boolean,
  totalChanged: number,
): VideoQaEscalate | null {
  if (hasAuth && !preservationPass && totalChanged > 0) {
    return {
      kind: "architectural_blocker",
      message:
        "Original-master pixels drifted outside authorized α. Assign to reconstruct/compositing — do not reopen chest 11/11 or sleeve 6/6 still goldens.",
      stillGoldensReopened: false,
    };
  }
  return null;
}
