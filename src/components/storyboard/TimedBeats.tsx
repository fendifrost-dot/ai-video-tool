import { useEffect, useMemo, useState } from "react";
import { Clock, Music2, Plus, Save, Scissors, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StoryboardBox } from "@/lib/storyboard/boxes";
import {
  EFFECT_LABEL,
  EVENT_FACETS,
  FACET_LABEL,
  beatTimeIn,
  beatsInShot,
  eventNotes,
  eventPhrases,
  lyricTimeIn,
  nextEventId,
  offsetLabel,
  sanitizeEvents,
  triggerLabel,
  wordsInShot,
  type EventFacet,
  type ResolvedEvent,
  type ShotEvent,
} from "@/lib/storyboard/events";
import { SHOT_EVENT_EFFECTS, SHOT_EVENT_PHRASE_MAX, SHOT_EVENTS_MAX } from "@/lib/treatment/shotSpec";
import { ALTERNATIVE_LABEL } from "@/lib/storyboard/temporal";
import { useStoryboard } from "./useStoryboardController";

const KIND_STYLE: Record<EventFacet | "effect", string> = {
  lighting: "bg-amber-400/15 text-amber-200",
  camera: "bg-sky-400/15 text-sky-200",
  action: "bg-emerald-400/15 text-emerald-200",
  visual: "bg-fuchsia-400/15 text-fuchsia-200",
  effect: "bg-white/10 text-foreground/80",
};

/**
 * A shot's change over its own length, at a glance: a bar the length of the shot with a mark at every beat, then one
 * line per beat — its time, what it hangs on, and what changes, a few words per kind. The opening state is the shot's
 * scene; it is not repeated here. Read-only: the editor is `BeatsEditor`.
 */
export function BeatStrip({ box, compact = false }: { box: StoryboardBox; compact?: boolean }) {
  const sb = useStoryboard();
  const resolved = sb.eventsOf(box);
  if (resolved.length === 0) return null;
  const seconds = Math.max(0.01, box.end - box.start);
  return (
    <div className={cn("rounded-lg border border-border/70 bg-white/[0.02]", compact ? "px-2.5 py-2" : "px-3 py-2.5")} data-testid="beats-strip" data-beats={resolved.length}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/55">
        <Clock className="h-3 w-3" /> Timed beats
        <span className="font-normal normal-case tracking-normal text-foreground/40">· {resolved.length} in {seconds.toFixed(1)} s</span>
      </div>
      {/* the shot, left to right, with a mark where each beat lands */}
      <div className="relative mb-2 h-1.5 rounded-full bg-white/10" aria-hidden>
        {resolved.map((e) => (
          <span
            key={e.id}
            className={cn("absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full", e.effect ? "bg-white" : "bg-primary")}
            style={{ left: `${Math.min(100, Math.max(0, (e.offset / seconds) * 100))}%` }}
            data-testid="beats-mark"
            data-offset={e.offset}
          />
        ))}
      </div>
      <ol className="space-y-1">
        {resolved.map((e) => (
          <BeatLine key={e.id} event={e} compact={compact} />
        ))}
      </ol>
    </div>
  );
}

function BeatLine({ event, compact }: { event: ResolvedEvent; compact: boolean }) {
  const sb = useStoryboard();
  const hangs = triggerLabel(event);
  // the lighting state the beat switches to, by its name (its key when the project no longer has it)
  const stateName = event.lightingState ? (sb.entities.find((e) => e.key === event.lightingState)?.name ?? event.lightingState) : null;
  return (
    <li className="flex items-start gap-2 text-xs leading-snug" data-testid="beats-line" data-event-id={event.id} data-offset={event.offset} data-placed-by={event.placedBy}>
      <span className="mt-px shrink-0 font-mono text-[11px] tabular-nums text-foreground/60">{offsetLabel(event.offset)}</span>
      <span className="min-w-0 flex-1 space-x-1.5">
        {hangs && (
          <span className={cn("inline-flex items-center gap-1 text-[11px] italic", event.placedBy === "fallback" ? "text-amber-300/90" : "text-foreground/55")} data-testid="beats-trigger">
            <Music2 className="h-3 w-3" />
            {hangs}
          </span>
        )}
        {stateName && (
          <span className="inline-flex items-center rounded-full border border-amber-400/30 px-1.5 text-[10px] text-amber-200/90" data-testid="beats-state" data-entity-key={event.lightingState}>
            {stateName}
          </span>
        )}
        {eventPhrases(event).map((p) => (
          <span key={p.kind} className="inline-flex items-baseline gap-1" data-beat-kind={p.kind}>
            <span className={cn("rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide", KIND_STYLE[p.kind])}>{p.label}</span>
            <span className={cn("text-foreground/85", compact && "line-clamp-1")}>{p.text}</span>
          </span>
        ))}
      </span>
    </li>
  );
}

type Row = ShotEvent & { _key: string };

const blank = (id: string, at: number): Row => ({ id, _key: `${id}:${Math.random().toString(36).slice(2, 8)}`, at, trigger: { kind: "time", ref: "" }, visual: "", camera: "", lighting: "", action: "", lightingState: null, effect: null });

const inputClass = "h-8 w-full rounded-md border border-border bg-background/60 px-2 text-xs text-foreground placeholder:text-foreground/30";

/**
 * The shot's timed beats, edited. A beat is a moment inside the shot — typed as a time, or hung on words that are
 * sung in the shot or on one of its beats — and a few words for what changes then, per kind. An effect is a change
 * the edit makes itself, on the clock. Saved together, as the shot's own record.
 */
export function BeatsEditor({ box }: { box: StoryboardBox }) {
  const sb = useStoryboard();
  const seconds = Math.max(0.1, box.end - box.start);
  const window = useMemo(() => ({ start: box.start, end: box.end }), [box.start, box.end]);
  const resolved = sb.eventsOf(box);
  // a light phrase that is the lighting state's own description is not the event's: the row keeps the pointer only
  const seed = (): Row[] => resolved.map((e) => ({ id: e.id, _key: e.id, at: e.offset, trigger: e.trigger, visual: e.visual, camera: e.camera, lighting: e.lightingFromState ? "" : e.lighting, action: e.action, lightingState: e.lightingState, effect: e.effect }));
  const lightingStates = sb.entities.filter((e) => e.kind === "lighting" && !e.archived);
  const [rows, setRows] = useState<Row[]>(seed);
  const [dirty, setDirty] = useState(false);
  const busy = sb.busyOf(box.id);

  // the record is the starting point; re-seed when it changes underneath, never over unsaved typing
  const stamp = `${box.id}:${box.updatedAt}:${box.start}:${box.end}`;
  useEffect(() => {
    if (!dirty) setRows(seed());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, dirty]);

  const words = useMemo(() => wordsInShot(sb.clock.lyricLines, window), [sb.clock.lyricLines, window]);
  const beats = useMemo(() => beatsInShot(sb.clock.beats, window), [sb.clock.beats, window]);
  const plan = sb.clipPlanOf(box);

  const patch = (key: string, p: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, ...p } : r)));
    setDirty(true);
  };
  const add = () => {
    if (rows.length >= SHOT_EVENTS_MAX) return;
    const last = rows.reduce((m, r) => Math.max(m, r.at), 0);
    const at = Math.min(Math.max(0, seconds - 0.1), rows.length ? Math.round((last + (seconds - last) / 2) * 10) / 10 : Math.round((seconds / 2) * 10) / 10);
    setRows((rs) => [...rs, blank(nextEventId(rs), at)]);
    setDirty(true);
  };
  const remove = (key: string) => {
    setRows((rs) => rs.filter((r) => r._key !== key));
    setDirty(true);
  };
  const save = () => {
    const events = sanitizeEvents(rows, seconds);
    void sb.saveEvents(box, events).then(() => setDirty(false));
  };
  // whether the words / beat a row hangs on are inside this shot (the same lookup that places the beat)
  const hangsHere = (r: Row) =>
    r.trigger.kind === "lyric" ? lyricTimeIn(sb.clock.lyricLines ?? [], window, r.trigger.ref) != null : r.trigger.kind === "beat" ? beatTimeIn(sb.clock.beats ?? [], window, r.trigger.ref) != null : true;
  // what the select shows for a row: its own trigger, even when it is no longer inside this shot
  const hangValue = (r: Row) => (r.trigger.kind === "time" ? "time" : `${r.trigger.kind}:${r.trigger.ref}`);

  return (
    <div className="space-y-2.5 border-t border-border/50 pt-3" data-testid="beats-editor">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/55">Timed beats — change inside this shot</p>
        <p className="mt-0.5 text-[11px] leading-snug text-foreground/45">
          The scene above is how the shot opens. A beat is a moment inside its {seconds.toFixed(1)} s and what changes then — a few words, not a paragraph.
        </p>
      </div>

      {rows.map((r) => (
        <div key={r._key} className="space-y-1.5 rounded-lg border border-border p-2" data-testid="beat-row" data-event-id={r.id}>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={Math.max(0, seconds - 0.05)}
              step={0.1}
              value={Number.isFinite(r.at) ? r.at : 0}
              onChange={(e) => patch(r._key, { at: Math.max(0, Number(e.target.value) || 0), trigger: { kind: "time", ref: "" } })}
              className={cn(inputClass, "w-[4.5rem] font-mono")}
              aria-label="Seconds into the shot"
              data-testid="beat-at"
            />
            <span className="text-[10px] text-foreground/40">s</span>
            <select
              className={cn(inputClass, "min-w-0 flex-1")}
              value={hangValue(r)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "time") return patch(r._key, { trigger: { kind: "time", ref: "" } });
                const [kind, ...rest] = v.split(":");
                const ref = rest.join(":");
                const at = kind === "lyric" ? words.find((w) => w.text === ref)?.offset : beats.find((b) => String(b.n) === ref)?.offset;
                patch(r._key, { trigger: { kind: kind as "lyric" | "beat", ref }, ...(at != null ? { at } : {}) });
              }}
              aria-label="What the beat hangs on"
              data-testid="beat-trigger"
            >
              <option value="time">at this time</option>
              {r.trigger.kind !== "time" && !words.some((w) => `lyric:${w.text}` === hangValue(r)) && !beats.some((b) => `beat:${b.n}` === hangValue(r)) && (
                <option value={hangValue(r)}>
                  {r.trigger.kind === "lyric" ? `on “${r.trigger.ref}”` : `on beat ${r.trigger.ref}`}
                  {hangsHere(r) ? "" : " (not in this shot)"}
                </option>
              )}
              {words.length > 0 && (
                <optgroup label="on the words">
                  {words.map((w, i) => (
                    <option key={`${w.lineIndex}:${i}`} value={`lyric:${w.text}`}>
                      “{w.text}” · {offsetLabel(w.offset)}
                    </option>
                  ))}
                </optgroup>
              )}
              {beats.length > 0 && (
                <optgroup label="on the beat">
                  {beats.map((b) => (
                    <option key={b.n} value={`beat:${b.n}`}>
                      beat {b.n} · {offsetLabel(b.offset)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button type="button" onClick={() => remove(r._key)} aria-label="Remove this beat" className="rounded p-1.5 text-foreground/45 hover:bg-white/5 hover:text-rose-300" data-testid="beat-remove">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {EVENT_FACETS.map((f) => (
              <label key={f} className="flex items-center gap-1.5">
                <span className={cn("w-14 shrink-0 rounded px-1 py-px text-center text-[9px] font-semibold uppercase tracking-wide", KIND_STYLE[f])}>{FACET_LABEL[f]}</span>
                <input
                  value={r[f]}
                  maxLength={SHOT_EVENT_PHRASE_MAX}
                  onChange={(e) => patch(r._key, { [f]: e.target.value } as Partial<Row>)}
                  placeholder={f === "lighting" ? "what the light does" : f === "camera" ? "what the camera starts doing" : f === "action" ? "what he / the subject does" : "what else changes in the picture"}
                  className={inputClass}
                  data-testid={`beat-${f}`}
                />
              </label>
            ))}
          </div>
          {(lightingStates.length > 0 || r.lightingState) && (
            <label className="flex items-center gap-1.5">
              <span className={cn("w-14 shrink-0 rounded px-1 py-px text-center text-[9px] font-semibold uppercase tracking-wide", KIND_STYLE.lighting)}>State</span>
              <select
                className={cn(inputClass, "flex-1")}
                value={r.lightingState ?? ""}
                // a state is a light the footage shows: an exposure effect cannot be on the same beat
                onChange={(e) => patch(r._key, { lightingState: e.target.value || null, ...(e.target.value && r.effect && r.effect.type !== "flash" ? { effect: null } : {}) })}
                aria-label="The lighting state the light switches to at this beat"
                data-testid="beat-lighting-state"
              >
                <option value="">no lighting state — the words above say the light</option>
                {r.lightingState && !lightingStates.some((x) => x.key === r.lightingState) && <option value={r.lightingState}>{r.lightingState} (not in this project)</option>}
                {lightingStates.map((x) => (
                  <option key={x.key} value={x.key}>
                    switch to {x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5">
            <span className={cn("inline-flex w-14 shrink-0 items-center justify-center gap-0.5 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide", KIND_STYLE.effect)}>
              <Zap className="h-2.5 w-2.5" /> Effect
            </span>
            <select
              className={cn(inputClass, "flex-1")}
              value={r.effect?.type ?? ""}
              onChange={(e) =>
                patch(r._key, {
                  effect: e.target.value ? { type: e.target.value as (typeof SHOT_EVENT_EFFECTS)[number], seconds: null, level: null } : null,
                  // an exposure effect is the edit's change of light; a lighting state is the footage's — one or the other
                  ...(e.target.value && e.target.value !== "flash" && r.lightingState ? { lightingState: null } : {}),
                })
              }
              aria-label="An effect the edit makes at this beat"
              data-testid="beat-effect"
            >
              <option value="">none — the change is in the footage</option>
              {SHOT_EVENT_EFFECTS.map((t) => (
                <option key={t} value={t}>
                  {EFFECT_LABEL[t]} — made by the edit, exactly on this beat
                </option>
              ))}
            </select>
          </label>
          {r.effect && r.effect.type !== "flash" && r.lighting.trim() && !r.lightingState && (
            <p className="text-[10px] leading-snug text-foreground/45" data-testid="beat-effect-note">
              The edit makes this change of light. Its words say what the effect is; they are not also asked of a generator.
            </p>
          )}
          {r.lightingState && (
            <p className="text-[10px] leading-snug text-foreground/45" data-testid="beat-state-note">
              A lighting state is a light the footage has to show: the generator is asked for it at this moment. An exposure effect cannot be on the same beat — put one on a beat of its own.
            </p>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={add} disabled={!!busy || rows.length >= SHOT_EVENTS_MAX} data-testid="beats-add">
          <Plus className="mr-1 h-3.5 w-3.5" /> Add a beat
        </Button>
        <Button size="sm" className="h-8 text-[11px]" onClick={save} disabled={!!busy || !dirty} data-testid="beats-save">
          <Save className="mr-1 h-3.5 w-3.5" /> Save beats
        </Button>
        {dirty && <span className="text-[11px] text-amber-300/80">unsaved</span>}
      </div>

      {!dirty &&
        eventNotes(resolved).map((n) => (
          <p key={n} className="rounded-lg border border-amber-400/25 bg-amber-400/5 p-2.5 text-[11px] leading-snug text-amber-100/90" data-testid="beats-note">
            {n}
          </p>
        ))}

      {/* what generating does with these beats — said before anything is spent */}
      {!dirty && plan.mode !== "single" && (
        <div className="space-y-1.5 rounded-lg border border-amber-400/25 bg-amber-400/5 p-2.5 text-[11px] leading-snug text-amber-100/90" data-testid="beats-plan" data-plan={plan.mode}>
          {plan.mode === "refused" && (
            <>
              <p>{plan.reason} A clip of the whole shot is not generated as if it were one state.</p>
              <ul className="list-disc space-y-0.5 pl-4 text-amber-100/75">
                {plan.alternatives.map((a) => (
                  <li key={a}>{ALTERNATIVE_LABEL[a]}</li>
                ))}
              </ul>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!!busy} onClick={() => void sb.splitAtBeats(box)} data-testid="beats-split">
                <Scissors className="mr-1 h-3 w-3" /> Split at the beats
              </Button>
            </>
          )}
          {plan.mode === "timed_script" && <p data-testid="beats-timing">Restaging gives the model these beats as a script with times. {plan.timing}</p>}
          {plan.mode === "opening_state" && <p>{plan.note}</p>}
        </div>
      )}
    </div>
  );
}
