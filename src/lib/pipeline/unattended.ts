/**
 * Unattended Product OS runner.
 *
 * Advances the graph until a G2 pause (blocked / failed / retryable backoff)
 * or the run passes. Callers do not dispatch stages one-by-one.
 */

import { applyHandoffs, buildHandoffs } from "./handoff";
import { isPauseLifecycle, lifecycleFromStatus } from "./lifecycle";
import {
  advancePipeline,
  type AdvanceOptions,
  type CreatePipelineRunInput,
  createPipelineRun,
} from "./orchestrator";
import { productOsGraphNodes, type ProductOsGraphNode } from "./productOs";
import type { G2StageState, PipelineClock, PipelineRun, PipelineStageId } from "./types";
import { PIPELINE_STAGE_IDS } from "./types";

export type UnattendedPauseReason =
  | "passed_complete"
  | "blocked"
  | "failed"
  | "retryable"
  | "cancelled"
  | "idle";

export type UnattendedResult = {
  run: PipelineRun;
  steps: number;
  pauseReason: UnattendedPauseReason;
  graph: ProductOsGraphNode[];
  lifecycles: Record<PipelineStageId, G2StageState>;
  paidCalls: false;
};

function lifecyclesOf(run: PipelineRun): Record<PipelineStageId, G2StageState> {
  const out = {} as Record<PipelineStageId, G2StageState>;
  for (const id of PIPELINE_STAGE_IDS) {
    const rec = run.stages[id];
    out[id] = rec.lifecycle ?? lifecycleFromStatus(rec.status, rec.lastError);
  }
  return out;
}

function pauseReasonOf(run: PipelineRun): UnattendedPauseReason {
  if (run.status === "succeeded") return "passed_complete";
  if (run.status === "cancelled") return "cancelled";
  if (run.status === "failed") return "failed";
  if (run.status === "blocked" || run.status === "needs_review") return "blocked";
  const states = PIPELINE_STAGE_IDS.map((id) => run.stages[id]);
  if (states.some((s) => (s.lifecycle ?? lifecycleFromStatus(s.status, s.lastError)) === "retryable")) {
    return "retryable";
  }
  return "idle";
}

export async function runUnattendedPipeline(
  run: PipelineRun,
  options: AdvanceOptions & { maxSteps?: number } = {},
  clock?: PipelineClock,
): Promise<UnattendedResult> {
  const maxSteps = options.maxSteps ?? PIPELINE_STAGE_IDS.length * 4;
  let current = run;
  let steps = 0;
  for (let i = 0; i < maxSteps; i++) {
    const before = current;
    current = await advancePipeline(current, options, clock);
    steps += 1;
    const fromIds = PIPELINE_STAGE_IDS.filter((id) => {
      const prev = before.stages[id];
      const next = current.stages[id];
      const prevLife = prev.lifecycle ?? lifecycleFromStatus(prev.status, prev.lastError);
      const nextLife = next.lifecycle ?? lifecycleFromStatus(next.status, next.lastError);
      return prevLife !== "passed" && nextLife === "passed";
    });
    if (clock) {
      for (const fromStage of fromIds) {
        const added = buildHandoffs(current, fromStage, clock.createId, clock.now());
        current = applyHandoffs(current, added);
      }
    } else {
      const fallbackClock = {
        now: () => current.updatedAt,
        createId: () => `handoff_${current.handoffs.length + 1}`,
      };
      for (const fromStage of fromIds) {
        const added = buildHandoffs(
          current,
          fromStage,
          fallbackClock.createId,
          fallbackClock.now(),
        );
        current = applyHandoffs(current, added);
      }
    }

    if (
      current.status === "succeeded" ||
      current.status === "failed" ||
      current.status === "blocked" ||
      current.status === "needs_review" ||
      current.status === "cancelled"
    ) {
      break;
    }
    if (current === before) break;
    const retrying = PIPELINE_STAGE_IDS.some((id) => current.stages[id].status === "retrying");
    if (retrying && !options.ignoreBackoff) break;
  }

  return {
    run: current,
    steps,
    pauseReason: pauseReasonOf(current),
    graph: productOsGraphNodes(),
    lifecycles: lifecyclesOf(current),
    paidCalls: false,
  };
}

export function createCatalogPipelineRun(
  input: CreatePipelineRunInput & { catalogId?: string },
  clock?: PipelineClock,
): PipelineRun {
  return createPipelineRun(input, clock);
}

export function stageGraphSnapshot(): {
  order: PipelineStageId[];
  nodes: ProductOsGraphNode[];
  requiredStates: readonly G2StageState[];
} {
  const nodes = productOsGraphNodes();
  return {
    order: nodes.map((n) => n.stageId),
    nodes,
    requiredStates: ["queued", "running", "passed", "failed", "blocked", "retryable"],
  };
}
