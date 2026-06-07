import { useState } from "react";
import { toast } from "sonner";
import { Save, ThumbsDown, ThumbsUp } from "lucide-react";
import type {
  ApprovalStatus,
  ClipReview,
  Json,
  ProjectAsset,
} from "@/integrations/supabase/aliases";
import {
  SCORE_METRICS,
  averageScore,
  useSaveClipReview,
  type ScoreMetric,
} from "@/lib/queries/clipReviews";
import { useUpdateProjectAsset } from "@/lib/queries/projectAssets";
import { useProjectRailCollapsed } from "@/lib/projectRail";
import { Button } from "@/components/ui/button";
import { ClipDecision } from "@/components/review/ClipDecision";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";

type FormState = Partial<Record<ScoreMetric, number>> & {
  final_usefulness: boolean | null;
  notes: string;
};

function makeInitial(prior: ClipReview | null): FormState {
  return {
    face_consistency_score: prior?.face_consistency_score ?? undefined,
    realism_score: prior?.realism_score ?? undefined,
    lighting_score: prior?.lighting_score ?? undefined,
    wardrobe_score: prior?.wardrobe_score ?? undefined,
    camera_score: prior?.camera_score ?? undefined,
    lipsync_score: prior?.lipsync_score ?? undefined,
    final_usefulness: prior?.final_usefulness ?? null,
    notes: prior?.notes ?? "",
  };
}

export function ScorecardForm({
  asset,
  prior,
  onSaved,
  stickyFooter = false,
}: {
  asset: ProjectAsset;
  prior: ClipReview | null;
  onSaved?: () => void;
  /** Pin Save / Approve / Reject to the viewport bottom (review queue mode). */
  stickyFooter?: boolean;
}) {
  const [state, setState] = useState<FormState>(() => makeInitial(prior));
  const save = useSaveClipReview();
  const updateAsset = useUpdateProjectAsset();

  function setScore(key: ScoreMetric, value: number) {
    setState((s) => ({ ...s, [key]: value }));
  }

  const avg = averageScore(state as Partial<ClipReview>);

  async function persist(opts: { promoteStatus?: ApprovalStatus } = {}) {
    try {
      await save.mutateAsync({
        asset_id: asset.id,
        face_consistency_score: state.face_consistency_score ?? null,
        realism_score: state.realism_score ?? null,
        lighting_score: state.lighting_score ?? null,
        wardrobe_score: state.wardrobe_score ?? null,
        camera_score: state.camera_score ?? null,
        lipsync_score: state.lipsync_score ?? null,
        final_usefulness: state.final_usefulness,
        notes: state.notes.trim() || null,
      });
      if (opts.promoteStatus) {
        await updateAsset.mutateAsync({
          id: asset.id,
          patch: {
            approval_status: opts.promoteStatus,
            metadata_json: {
              ...(asset.metadata_json as Record<string, unknown> | null),
              last_review_avg: avg,
            } as Json,
          },
        });
      }
      toast.success(
        opts.promoteStatus
          ? `Saved + ${opts.promoteStatus === "approved" ? "approved" : "rejected"}`
          : "Saved",
      );
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  const isLipsyncRelevant = isLipsyncAsset(asset);
  const submitting = save.isPending || updateAsset.isPending;

  return (
    <div className="space-y-3 rounded-md border border-border bg-card/30 p-3">
      <div className="grid grid-cols-1 gap-y-3">
        {SCORE_METRICS.map((m) => {
          if (m.key === "lipsync_score" && !isLipsyncRelevant) return null;
          return (
            <ScoreRow
              key={m.key}
              label={m.label}
              description={m.description}
              value={state[m.key]}
              onChange={(v) => setScore(m.key, v)}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Average</span>
        <span className="font-mono">{avg != null ? avg.toFixed(1) : "—"}/10</span>
      </div>

      <div>
        <Textarea
          rows={2}
          placeholder="Notes (what works, what doesn't)"
          value={state.notes}
          onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
        />
      </div>

      <ActionBar
        sticky={stickyFooter}
        approvalStatus={asset.approval_status}
        usefulness={state.final_usefulness}
        onUsefulnessChange={(v) => setState((s) => ({ ...s, final_usefulness: v }))}
        onSave={() => persist()}
        onApprove={() => persist({ promoteStatus: "approved" })}
        onReject={() => persist({ promoteStatus: "rejected" })}
        submitting={submitting}
      />
    </div>
  );
}

function ScoreRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: number | undefined;
  onChange: (next: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {value != null ? `${value}/10` : "—"}
        </span>
      </div>
      <Slider
        value={[value ?? 0]}
        min={0}
        max={10}
        step={1}
        onValueChange={(v) => onChange(v[0])}
      />
      <p className="text-[10px] text-muted-foreground">{description}</p>
    </div>
  );
}

function ActionBar({
  sticky,
  approvalStatus,
  usefulness,
  onUsefulnessChange,
  onSave,
  onApprove,
  onReject,
  submitting,
}: {
  sticky: boolean;
  approvalStatus: ApprovalStatus;
  usefulness: boolean | null;
  onUsefulnessChange: (next: boolean | null) => void;
  onSave: () => void;
  onApprove: () => void;
  onReject: () => void;
  submitting: boolean;
}) {
  const railCollapsed = useProjectRailCollapsed();

  const inner = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-1.5">
        <UsefulnessButton
          active={usefulness === true}
          label="Useful"
          icon={ThumbsUp}
          onClick={() =>
            onUsefulnessChange(usefulness === true ? null : true)
          }
        />
        <UsefulnessButton
          active={usefulness === false}
          label="Not useful"
          icon={ThumbsDown}
          onClick={() =>
            onUsefulnessChange(usefulness === false ? null : false)
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSave}
          disabled={submitting}
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Save
        </Button>
        <ClipDecision
          status={approvalStatus}
          onApprove={onApprove}
          onReject={onReject}
          disabled={submitting}
          approveLabel="Save + Approve"
          rejectLabel="Save + Reject"
        />
      </div>
    </div>
  );

  if (!sticky) return inner;

  return (
    <div
      className={
        railCollapsed
          ? "fixed inset-x-0 bottom-28 z-30 border-t md:bottom-0 border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:pl-[calc(4.5rem+1rem)]"
          : "fixed inset-x-0 bottom-28 z-30 border-t md:bottom-0 border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:pl-[calc(16rem+1rem)]"
      }
    >
      <div className="mx-auto max-w-5xl">{inner}</div>
    </div>
  );
}

function UsefulnessButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: typeof ThumbsUp;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className="h-8"
    >
      <Icon className="mr-1.5 h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

function isLipsyncAsset(asset: ProjectAsset): boolean {
  // Heuristic: video clips with shot lipsync category, OR generated_clip type.
  // We don't have the shot context here, so default-on for clips and let user ignore.
  return (
    asset.asset_type === "generated_clip" ||
    asset.asset_type === "edited_clip" ||
    asset.asset_type === "social_cutdown"
  );
}
