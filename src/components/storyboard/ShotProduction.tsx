import { useState } from "react";
import { Code2, Link2, Plus, Route, Shirt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LINK_LABEL, linkSummary } from "@/lib/storyboard/links";
import { METHOD_LABEL, routeLine } from "@/lib/storyboard/route";
import type { StoryboardBox } from "@/lib/storyboard/boxes";
import { PRODUCTION_METHODS, SHOT_LINK_KINDS, type ShotLinkKind } from "@/lib/treatment/shotSpec";
import { useStoryboard } from "./useStoryboardController";

const selectClass = "h-9 w-full rounded-md border border-border bg-background/60 px-2 text-xs text-foreground";
const chip = "inline-flex items-center gap-1 rounded-full border border-border/70 bg-white/[0.03] px-2 py-0.5 text-[10px] text-foreground/75";

/** The card's line about how the shot is made and what it is tied to. Nothing when there is nothing to say. */
export function ProductionChips({ box, className }: { box: StoryboardBox; className?: string }) {
  const sb = useStoryboard();
  const route = sb.routeOf(box);
  const links = sb.linksOf(box);
  const garments = box.spec.wardrobe.garments.length;
  if (route.inferred && route.verdict === "storyboard" && links.length === 0 && garments === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)} data-testid="box-production">
      {(!route.inferred || route.verdict !== "storyboard") && (
        <span
          className={cn(chip, route.verdict === "elsewhere" && "border-sky-400/40 text-sky-200", route.verdict === "unsupported" && "border-amber-400/40 text-amber-200")}
          data-route-verdict={route.verdict}
          title={routeLine(route)}
        >
          <Route className="h-2.5 w-2.5" /> {METHOD_LABEL[route.method]}
          {route.verdict === "elsewhere" ? " — elsewhere" : route.verdict === "unsupported" ? " — cannot be made yet" : ""}
        </span>
      )}
      {links.map((l) => (
        <span key={`${l.direction}-${l.kind}-${l.otherKey}`} className={cn(chip, !l.other && "border-amber-400/40 text-amber-200")} data-link-kind={l.kind} data-link-direction={l.direction}>
          <Link2 className="h-2.5 w-2.5" /> {linkSummary(l)}
        </span>
      ))}
      {garments > 0 && (
        <span className={chip} data-testid="box-garments">
          <Shirt className="h-2.5 w-2.5" /> {garments} exact garment{garments === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

/**
 * How the shot is made, what it is tied to, what it wears exactly, and the pictures its still is drawn with. Every
 * choice is saved at once onto the shot's own record (the same override as its continuity).
 */
export function ShotProductionEditor({ box }: { box: StoryboardBox }) {
  const sb = useStoryboard();
  const busy = !!sb.busyOf(box.id);
  const route = sb.routeOf(box);
  const links = sb.linksOf(box);
  const refs = sb.referencesOf(box);
  const own = box.spec.continuity.links ?? [];
  const others = sb.boxes.filter((b) => b.key !== box.key);
  const [kind, setKind] = useState<ShotLinkKind>("screen_shows");
  const [target, setTarget] = useState<string>("");
  const [note, setNote] = useState("");
  const [showRequest, setShowRequest] = useState(false);
  const garments = new Set(box.spec.wardrobe.garments);
  const request = showRequest ? sb.stillRequestOf(box) : null;

  const saveLinks = (next: { kind: string; shot: string; note?: string }[]) => void sb.saveContinuity(box, { links: next });

  return (
    <div className="space-y-2.5 border-t border-border/50 pt-3" data-testid="shot-production">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/55">Production — how this shot is made</p>
        <p className={cn("mt-0.5 text-[11px] leading-snug", route.verdict === "storyboard" ? "text-foreground/45" : route.verdict === "elsewhere" ? "text-sky-200/80" : "text-amber-200/90")} data-testid="shot-route">
          {routeLine(route)}
        </p>
      </div>

      <label className="block space-y-1">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-foreground/50">
          <Route className="h-3 w-3" /> Method
        </span>
        <select className={selectClass} value={box.spec.production.method} disabled={busy} onChange={(e) => void sb.saveContinuity(box, { production: { method: e.target.value } })} data-testid="shot-production-method">
          <option value="">from the shot type</option>
          {PRODUCTION_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-1">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-foreground/50">
          <Link2 className="h-3 w-3" /> Tied to other shots
        </span>
        {links.length === 0 && <p className="text-[11px] text-foreground/45">Not tied to another shot.</p>}
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={`${l.direction}-${l.kind}-${l.otherKey}`} className="flex items-center justify-between gap-2 text-[11px] text-foreground/75" data-testid="shot-link">
              <span>
                This shot {linkSummary(l)}
                {!l.other && <span className="text-amber-200"> — not a shot of this board</span>}
                {l.direction === "in" && <span className="text-foreground/40"> (set on that shot)</span>}
              </span>
              {l.direction === "out" && (
                <button
                  type="button"
                  className="text-foreground/50 hover:text-foreground"
                  disabled={busy}
                  aria-label="Remove link"
                  onClick={() => saveLinks(own.filter((o) => !(o.kind === l.kind && o.shot === l.otherKey)))}
                  data-testid="shot-link-remove"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
          <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as ShotLinkKind)} data-testid="shot-link-kind">
            {SHOT_LINK_KINDS.map((k) => (
              <option key={k} value={k}>
                {LINK_LABEL[k].out}
              </option>
            ))}
          </select>
          <select className={selectClass} value={target} onChange={(e) => setTarget(e.target.value)} data-testid="shot-link-target">
            <option value="">which shot…</option>
            {others.map((b) => (
              <option key={b.key} value={b.key}>
                shot {sb.numberOf(b.id)}
              </option>
            ))}
          </select>
          <Input className="h-9 text-xs" placeholder="which screen, door, position…" value={note} onChange={(e) => setNote(e.target.value)} data-testid="shot-link-note" />
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            disabled={busy || !target}
            onClick={() => {
              saveLinks([...own.filter((o) => !(o.kind === kind && o.shot === target)), { kind, shot: target, note }]);
              setTarget("");
              setNote("");
            }}
            data-testid="shot-link-add"
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Link
          </Button>
        </div>
      </div>

      {/* the pieces he wears are the outfit's (Outfits.tsx ShotOutfitEditor, above); this shot's own pieces are set there too */}
      <div className="space-y-1" data-testid="shot-references">
        <span className="text-[10px] uppercase tracking-wide text-foreground/50">Pictures its image is drawn with (up to {refs.cap})</span>
        {!refs.delivered && refs.sent.length > 0 && (
          <p className="text-[11px] text-amber-200/90" data-testid="shot-references-undelivered">
            The image generator does not take reference pictures yet. A shot that needs a screen picture, an exact garment or an identity is not generated until it does; the rest are described in words only, and the job records that they were not sent.
          </p>
        )}
        {refs.model && (
          <p className="text-[11px] text-amber-200/80" data-testid="shot-references-model">
            {refs.sent.length} pictures are more than the usual image model takes ({refs.baseCap}), so this still is drawn on {refs.model} — a different model from your stills with up to {refs.baseCap} pictures. How exactly it reproduces a garment is not yet verified: check each piece against its photo.
          </p>
        )}
        {refs.sent.length === 0 && refs.notSent.length === 0 && <p className="text-[11px] text-foreground/45">None — drawn from words.</p>}
        <ul className="space-y-0.5 text-[11px] text-foreground/75">
          {refs.sent.map((r, i) => (
            <li key={`s-${r.source}-${r.id}`} data-testid="shot-reference-sent">
              &lt;IMAGE_{i}&gt; {r.label} — {r.role}
            </li>
          ))}
          {refs.notSent.map((n) => (
            <li key={`n-${n.ref.source}-${n.ref.id}`} className="text-foreground/45" data-testid="shot-reference-not-sent">
              not sent: {n.ref.label} — {n.why}
            </li>
          ))}
          {refs.problems.map((p) => (
            <li key={p.text} className={p.level === "blocking" ? "text-amber-200" : "text-amber-200/70"} data-testid="shot-reference-problem" data-level={p.level}>
              {p.text} {p.fix}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setShowRequest((v) => !v)} data-testid="shot-request-toggle">
          <Code2 className="mr-1 h-3.5 w-3.5" /> {showRequest ? "Hide" : "Show"} the image request (nothing is sent)
        </Button>
        {showRequest && (
          <pre className="mt-1 max-h-72 overflow-auto rounded-md border border-border/60 bg-black/40 p-2 text-[10px] leading-snug text-foreground/70" data-testid="shot-request">
            {request ? JSON.stringify(request, null, 2) : "This shot has no scene to draw yet."}
          </pre>
        )}
      </div>
    </div>
  );
}
