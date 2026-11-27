import { useMemo, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  GATE_PROVENANCE,
  IDENTITY_DISTANCE_MAX,
  LANDMARK_DISTANCE_WATCH,
  MOUTH_TIMING_MIN,
  getPreset,
  listPresets,
  planAlter,
  planFinalize,
  type AlterMode,
  type AlterPlan,
} from "@/lib/alter";

const MODES: { id: AlterMode; label: string; keeps: string }[] = [
  {
    id: "swap",
    label: "Swap",
    keeps: "Keep the person, the light and the camera. Change one thing.",
  },
  {
    id: "motion",
    label: "Motion transfer",
    keeps: "Keep the performance and the camera. Change who or where.",
  },
  {
    id: "restyle",
    label: "Restyle",
    keeps: "Keep the motion and the framing. Change the whole look.",
  },
];

export default function AlterPage({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<AlterMode>("swap");
  const presets = useMemo(() => listPresets(mode), [mode]);
  const [presetName, setPresetName] = useState(presets[0]?.name ?? "outfit");
  const preset = getPreset(presetName) ?? presets[0] ?? null;
  const [who, setWho] = useState("the man with the beard");
  const [slots, setSlots] = useState<Record<string, string>>({});
  const [videoUrl, setVideoUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [performance, setPerformance] = useState(true);
  const [plan, setPlan] = useState<AlterPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  function prepare() {
    if (!preset) return;
    const next = planAlter({
      preset: preset.name,
      who,
      slots,
      performance,
      videoUrl: videoUrl.trim() || undefined,
      targetFrameUrl: targetUrl.trim() || undefined,
    });
    if ("ok" in next && next.ok === false) {
      setPlan(null);
      setError(next.error);
      return;
    }
    setError(null);
    setPlan(next as AlterPlan);
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8" data-testid="alter-page">
      <PageHeader
        title="Alter"
        subtitle="Change one thing in a take. Draft at 480p, check it, and do not spend until a person sends it."
        variant="compact"
        context={projectId.slice(0, 8)}
      />
      <section className="rounded-xl border border-border bg-card/80 p-4 text-sm text-foreground/80">
        <p>
          The three modes and 36 presets follow the MIT scenario-alter skill; the action preset is
          AVT's own. This page builds the Seedance video-edit request for the route Fendi passed and
          does not send it. A rapping redraw is kept only when the mouth timing stays at or above{" "}
          {MOUTH_TIMING_MIN} and the face passes: an identity distance at or below{" "}
          {IDENTITY_DISTANCE_MAX}, or his own word on the face sheet. A draft that fails is
          re-rolled. His original face is not laid back onto a redraw. Every output is planned with
          the take's audio.
        </p>
      </section>

      <div className="grid gap-2 sm:grid-cols-3" data-testid="alter-modes">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={mode === item.id}
            className={`rounded-lg border p-3 text-left text-sm ${mode === item.id ? "border-primary" : "border-border"}`}
            onClick={() => {
              setMode(item.id);
              const first = listPresets(item.id)[0];
              if (first) setPresetName(first.name);
              setPlan(null);
            }}
          >
            <span className="font-medium">{item.label}</span>
            <span className="mt-1 block text-foreground/70">{item.keeps}</span>
          </button>
        ))}
      </div>

      {preset && (
        <section className="flex flex-col gap-3" data-testid="alter-preset">
          <label className="flex flex-col gap-1 text-sm">
            Preset
            <select
              value={preset.name}
              onChange={(event) => {
                setPresetName(event.target.value);
                setPlan(null);
              }}
              className="rounded-md border border-border bg-background px-3 py-2"
              data-testid="alter-preset-select"
            >
              {presets.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.group}: {item.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-foreground/70">{preset.change}</p>
          <label className="flex flex-col gap-1 text-sm">
            Who is in the take
            <input
              value={who}
              onChange={(event) => setWho(event.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2"
              data-testid="alter-who"
            />
          </label>
          {Object.entries(preset.fill).map(([key, hint]) => (
            <label key={key} className="flex flex-col gap-1 text-sm">
              {key}
              <input
                value={slots[key] ?? ""}
                placeholder={hint}
                onChange={(event) =>
                  setSlots((current) => ({ ...current, [key]: event.target.value }))
                }
                className="rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
          ))}
          <label className="flex flex-col gap-1 text-sm">
            Take URL (https)
            <input
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2"
              data-testid="alter-video"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Target frame URL (https). One still of the change, already in a frame of the take.
            <input
              value={targetUrl}
              onChange={(event) => setTargetUrl(event.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2"
              data-testid="alter-target"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={performance}
              onChange={(event) => setPerformance(event.target.checked)}
            />
            He is rapping in this take
          </label>
          <Button type="button" onClick={prepare} data-testid="alter-prepare">
            Prepare 480p draft
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {plan && (
            <div className="flex flex-col gap-2 text-sm" data-testid="alter-plan">
              <p>{plan.report}</p>
              <p>
                Submitted: {String(plan.submitted)}. Ready: {String(plan.ready)}. Resolution:{" "}
                {plan.draft.body.body.resolution}. Audio generated:{" "}
                {String(plan.draft.body.body.generate_audio)}.
              </p>
              {plan.blocked.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p>{plan.ifItFails}</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                {plan.prompt}
              </pre>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setPlan(
                    planFinalize(plan, {
                      verdict: "CHECK",
                      mode: preset.check,
                      framesCompared: 0,
                      changedArea: 0,
                      structureMedian: 0,
                      motionCorrelation: 0,
                      jumps: [],
                      tailTrimFrames: 0,
                      frozenFrom: [],
                      mouth: null,
                      identity: { measured: false, fails: false, distance: null },
                      redrawCleared: false,
                      faceNeedsHisEye: false,
                      issues: ["not scored yet"],
                      gates: {
                        structureFloor: 0,
                        changed: [0, 1],
                        motionMin: MOUTH_TIMING_MIN,
                        restyleStructureMax: 0.65,
                      },
                    }),
                  )
                }
              >
                Finalize stays off until a draft passes
              </Button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-border p-4 text-sm" data-testid="alter-gates">
        <h2 className="font-medium">What the checker scores</h2>
        <ul className="mt-2 list-disc pl-5 text-foreground/80">
          <li>
            Length, how much changed, structure kept, motion match, pose jumps, tail drift, frozen
            frames. {GATE_PROVENANCE.motionMin}
          </li>
          <li>
            Mouth timing minimum {MOUTH_TIMING_MIN}. {GATE_PROVENANCE.mouthTimingMin}
          </li>
          <li>
            Identity distance maximum {IDENTITY_DISTANCE_MAX}. {GATE_PROVENANCE.identityDistanceMax}
          </li>
          <li>
            Landmark distance watch {LANDMARK_DISTANCE_WATCH}.{" "}
            {GATE_PROVENANCE.landmarkDistanceWatch}
          </li>
        </ul>
        <p className="mt-2 text-foreground/70">
          Run the numbers on two clips with{" "}
          <code>
            node --experimental-strip-types scripts/alter/check_clip.ts take.mp4 draft.mp4 --mode
            swap
          </code>
          . A rapping shot without mouth landmarks does not pass.
        </p>
      </section>
    </div>
  );
}
