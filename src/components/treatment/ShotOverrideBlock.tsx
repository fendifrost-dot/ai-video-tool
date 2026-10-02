import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Pencil, RotateCcw, Save, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CAMERA_MOTIONS, FRAMINGS, type ShotSpec } from "@/lib/treatment/shotSpec";
import {
  DEFAULT_TRANSITION_PRESET_NAMES,
  DEFAULT_TRANSITION_PRESETS,
} from "@/lib/treatment/transitions";
import { NoLyricsInWindowError, type RegenerateMode } from "@/lib/treatment/regenerateFromLyrics";
import { cameraMotionLabel, framingLabel } from "./shotLabels";
import { useShotOverrideContext, type ShotOverrideDraft } from "./shotOverrideContext";

/**
 * B3 + B4 — the director's hand on one storyboard box.
 *
 * B3: override the generated direction, camera move, framing, transition and the
 * elements the shot must contain. Save upserts; "Reset to generated" deletes, and the
 * coverage planner takes the box back.
 *
 * B4: "From the lyrics" regenerates the box from the words sung inside its window and
 * drops the result into these SAME fields, UNSAVED. One write path, so a regenerated box
 * and a hand-written one are the same kind of thing to everything downstream.
 *
 * Nothing here is saved until Save is pressed — including a regeneration. That is what
 * makes the button safe to press on a box you like.
 */

const NONE = "_none_";

/** The transition vocabulary: the assembler's preset names, mirrored from
 *  config/transition_presets.json by transitions.ts. A preset brings its coarse DB family
 *  with it (see applyShotOverride), so the card and the cut cannot disagree. */
const TRANSITION_OPTIONS = DEFAULT_TRANSITION_PRESET_NAMES;

function emptyDraft(): ShotOverrideDraft {
  return {
    direction: "",
    cameraMotionType: "",
    cameraMotionDescription: "",
    framing: "",
    transitionInPreset: "",
    requiredElements: [],
    notes: "",
  };
}

export function ShotOverrideBlock({ spec }: { spec: ShotSpec }) {
  const ctx = useShotOverrideContext();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ShotOverrideDraft>(emptyDraft);
  const [chip, setChip] = useState("");
  const [dirty, setDirty] = useState(false);

  const stored = ctx?.overrides[spec.id] ?? null;

  // The stored row is the draft's starting point. Re-seed when it changes underneath
  // (another tab, a fresh fetch) — but never while the director has unsaved edits.
  const storedKey = stored?.updatedAt ?? "none";
  useEffect(() => {
    if (dirty) return;
    setDraft(
      stored
        ? {
            direction: stored.direction ?? "",
            cameraMotionType: stored.cameraMotion?.type ?? "",
            cameraMotionDescription: stored.cameraMotion?.description ?? "",
            framing: stored.framing ?? "",
            transitionInPreset: stored.transitionIn?.preset ?? "",
            requiredElements: stored.requiredElements ?? [],
            notes: stored.notes ?? "",
          }
        : emptyDraft(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey, dirty]);

  const regenerating = ctx?.regeneratingSpecId === spec.id;
  const blockedReason = ctx ? ctx.regenerateBlockedReason(spec) : "unavailable";

  const placeholders = useMemo(
    () => ({
      direction: spec.performanceDirection || "the generated direction for this box",
      motion: spec.cameraMotion.description || "how the move is played",
    }),
    [spec.performanceDirection, spec.cameraMotion.description],
  );

  if (!ctx) return null;

  const set = <K extends keyof ShotOverrideDraft>(k: K, v: ShotOverrideDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };

  const addChip = () => {
    const v = chip.trim();
    if (!v || draft.requiredElements.includes(v)) return;
    set("requiredElements", [...draft.requiredElements, v]);
    setChip("");
  };

  async function handleSave() {
    try {
      await ctx!.save(spec.id, draft);
      setDirty(false);
      toast.success("Override saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function handleReset() {
    try {
      await ctx!.reset(spec.id);
      setDraft(emptyDraft());
      setDirty(false);
      toast.success("Back to the generated treatment");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    }
  }

  async function handleRegenerate(mode?: RegenerateMode) {
    try {
      const r = await ctx!.regenerate(spec, mode);
      setDraft((d) => ({
        ...d,
        direction: r.direction || d.direction,
        cameraMotionType: r.cameraMotion.type ?? d.cameraMotionType,
        cameraMotionDescription: r.cameraMotion.description || d.cameraMotionDescription,
        framing: r.framing ?? d.framing,
        transitionInPreset: r.transitionIn.preset ?? d.transitionInPreset,
        requiredElements: r.requiredElements.length ? r.requiredElements : d.requiredElements,
      }));
      setDirty(true);
      toast.success("Written from the lyrics — review it, then Save");
    } catch (err) {
      if (err instanceof NoLyricsInWindowError) toast.info(err.message);
      else toast.error(err instanceof Error ? err.message : "Regeneration failed");
    }
  }

  return (
    <div className="border-t border-border/50 pt-2" data-testid="shot-override">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-[10px] uppercase tracking-wider text-foreground/45 transition-colors hover:text-foreground/70"
      >
        <Pencil className="h-3 w-3" />
        Override
        {stored && <span className="text-foreground/30">· saved</span>}
        {dirty && <span className="text-amber-300/80">· unsaved</span>}
        <ChevronDown
          className={`ml-auto h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-foreground/40">
              Empty fields keep the generated value.
            </span>
            <span className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                onClick={() => void handleRegenerate()}
                disabled={blockedReason !== null || regenerating}
                title={blockedReason ?? "Write this box from the words sung inside its window"}
                data-testid="regenerate-from-lyrics"
              >
                {regenerating ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 className="mr-1.5 h-3 w-3" />
                )}
                From the lyrics
              </Button>
              {/* A card cut between the takes has a second reading: the line's image pushed past the literal — the
                  register of the director's own examples. A performance card is his real take, so it has one. */}
              {spec.shotType !== "performance" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => void handleRegenerate("surreal")}
                  disabled={blockedReason !== null || regenerating}
                  title={blockedReason ?? "The same words, pushed past the literal: an invented scene shot like a real event"}
                  data-testid="regenerate-further"
                >
                  Push it further
                </Button>
              )}
            </span>
          </div>

          <Textarea
            value={draft.direction}
            onChange={(e) => set("direction", e.target.value)}
            placeholder={placeholders.direction}
            rows={3}
            className="text-xs"
          />

          <div className="grid grid-cols-2 gap-2">
            <Select
              value={draft.cameraMotionType || NONE}
              onValueChange={(v) => set("cameraMotionType", v === NONE ? "" : v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Camera move" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Camera move — generated</SelectItem>
                {CAMERA_MOTIONS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {cameraMotionLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={draft.framing || NONE}
              onValueChange={(v) => set("framing", v === NONE ? "" : v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Framing" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Framing — generated</SelectItem>
                {FRAMINGS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {framingLabel(f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Input
            value={draft.cameraMotionDescription}
            onChange={(e) => set("cameraMotionDescription", e.target.value)}
            placeholder={placeholders.motion}
            className="h-8 text-xs"
          />

          <Select
            value={draft.transitionInPreset || NONE}
            onValueChange={(v) => set("transitionInPreset", v === NONE ? "" : v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Transition in" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Transition in — generated</SelectItem>
              {TRANSITION_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.replace(/_/g, " ")}
                  <span className="ml-2 text-foreground/40">
                    {DEFAULT_TRANSITION_PRESETS[t].suits}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Must be in frame -------------------------------------------- */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1">
              {draft.requiredElements.map((el) => (
                <span
                  key={el}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-200"
                >
                  {el}
                  <button
                    type="button"
                    aria-label={`Remove ${el}`}
                    onClick={() =>
                      set(
                        "requiredElements",
                        draft.requiredElements.filter((x) => x !== el),
                      )
                    }
                    className="text-emerald-200/60 hover:text-emerald-100"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <Input
              value={chip}
              onChange={(e) => setChip(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addChip();
                }
              }}
              onBlur={addChip}
              placeholder="Must be in frame — type and press Enter"
              className="h-8 text-xs"
            />
          </div>

          <Input
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Note to the day (not sent to the generators)"
            className="h-8 text-xs"
          />

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={handleSave}
              disabled={ctx.saving}
            >
              {ctx.saving ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3 w-3" />
              )}
              Save
            </Button>
            {stored && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] text-foreground/60"
                onClick={handleReset}
                disabled={ctx.saving}
              >
                <RotateCcw className="mr-1.5 h-3 w-3" />
                Reset to generated
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
