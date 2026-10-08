/**
 * WARDROBE — what he wears in the video, and what each shot wears.
 *
 * Two surfaces inside the Storyboard, beside Continuity and Cast:
 *   • the video's OUTFITS (an entity of kind `outfit`: words + the exact pieces from the artist's wardrobe pictures),
 *     each defined once, and its SCENES (a stretch of the song that wears one outfit);
 *   • one shot's outfit: inherited from its scene, a deliberate exception, or none — and the pieces generation
 *     will actually receive, with what stands in the way (src/lib/wardrobe/outfits.ts).
 *
 * The thing this UI exists to make impossible: the treatment dressing him in something, and a picture being drawn
 * with the model choosing his clothes. Every flag `outfitFlags` finds is shown on the shot, before the generate
 * buttons, with what would clear it. Nothing here invents a piece: the pieces are the wardrobe's photographs.
 */
import { AlertTriangle, ChevronDown, Clock, Plus, Shirt, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StoryboardBox } from "@/lib/storyboard/boxes";
import type { Outfit, OutfitFlag, Scene } from "@/lib/wardrobe/outfits";
import { useStoryboard } from "./useStoryboardController";

const selectClass =
  "h-9 w-full rounded-md border border-border bg-background/60 px-2 text-xs text-foreground";
const chip =
  "inline-flex items-center gap-1 rounded-full border border-border/70 bg-white/[0.03] px-2 py-0.5 text-[10px] text-foreground/75";
const FLAG_CLASS: Record<OutfitFlag["level"], string> = {
  blocking: "text-red-200",
  warning: "text-amber-200/90",
  info: "text-foreground/50",
};

const seconds = (n: number) => `${Math.floor(n / 60)}:${(n % 60).toFixed(1).padStart(4, "0")}`;

/** One outfit: its words, its pieces (toggled from the wardrobe), its version. */
function OutfitCard({ outfit }: { outfit: Outfit }) {
  const sb = useStoryboard();
  const busy = sb.entityBusyOf(outfit.id);
  const [description, setDescription] = useState(outfit.description);
  const pieces = new Set(outfit.outfit.garmentFeatureIds);
  const labels = new Map(sb.wardrobe.map((w) => [w.id, w.label]));
  const gone = outfit.outfit.garmentFeatureIds.filter((id) => !labels.has(id));
  const worn = sb.scenes.filter((s) => s.outfitKey === outfit.key);
  const toggle = (id: string) => {
    const next = pieces.has(id)
      ? outfit.outfit.garmentFeatureIds.filter((g) => g !== id)
      : [...outfit.outfit.garmentFeatureIds, id];
    void sb.saveEntity(outfit, { outfit: { garmentFeatureIds: next } });
  };
  return (
    <div
      className="space-y-2 rounded-lg border border-border/60 bg-white/[0.02] p-2.5"
      data-testid="outfit-card"
      data-entity-key={outfit.key}
      data-version={outfit.outfit.version}
    >
      <div className="flex items-center gap-2">
        <Shirt className="h-3.5 w-3.5 text-foreground/50" />
        <span className="text-xs font-semibold">{outfit.name}</span>
        <span className="text-[10px] text-foreground/40" data-testid="outfit-version">
          v{outfit.outfit.version}
        </span>
        <span className="ml-auto text-[10px] text-foreground/45" data-testid="outfit-worn">
          {worn.length === 0
            ? "worn by no scene yet"
            : `worn in ${worn.map((s) => s.name).join(", ")}`}
        </span>
        <button
          type="button"
          className="text-foreground/40 hover:text-foreground"
          disabled={!!busy}
          aria-label="Archive outfit"
          onClick={() => void sb.saveEntity(outfit, { archived: true })}
          data-testid="outfit-archive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <label className="block space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-foreground/50">
          In words (goes with every shot that wears it)
        </span>
        <Input
          className="h-8 text-xs"
          value={description}
          placeholder="how it reads on him — cut, colour, what is open or closed…"
          disabled={!!busy}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() =>
            description !== outfit.description && void sb.saveEntity(outfit, { description })
          }
          data-testid="outfit-description"
        />
      </label>
      <div className="space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-foreground/50">
          Exact pieces (sent as pictures, in this order)
        </span>
        {sb.wardrobe.length === 0 && (
          <p className="text-[11px] text-foreground/45">
            The wardrobe has no garment pictures yet — add them under Wardrobe on the artist page
            first.
          </p>
        )}
        <div className="flex flex-wrap gap-1">
          {outfit.outfit.garmentFeatureIds.map((id, i) => (
            <span
              key={id}
              className={cn(
                chip,
                labels.has(id)
                  ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-100"
                  : "border-red-400/50 text-red-200",
              )}
              data-testid="outfit-piece"
            >
              {i + 1}. {labels.get(id) ?? "no longer in the wardrobe"}
              <button
                type="button"
                className="ml-0.5 opacity-60 hover:opacity-100"
                disabled={!!busy}
                aria-label="Take off"
                onClick={() => toggle(id)}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          {outfit.outfit.garmentFeatureIds.length === 0 && (
            <span className="text-[11px] text-foreground/45">none — words only</span>
          )}
        </div>
        {gone.length > 0 && (
          <p className="text-[11px] text-red-200" data-testid="outfit-piece-gone">
            {gone.length === 1 ? "A piece" : `${gone.length} pieces`} named here{" "}
            {gone.length === 1 ? "is" : "are"} no longer in the wardrobe: a shot wearing this outfit
            is blocked until it is chosen again or taken off.
          </p>
        )}
        {sb.wardrobe.length > 0 && (
          <details className="text-[11px]">
            <summary className="cursor-pointer text-foreground/55">
              Add a piece from the wardrobe
            </summary>
            <div className="mt-1 flex flex-wrap gap-1">
              {sb.wardrobe
                .filter((w) => !pieces.has(w.id))
                .map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={cn(chip, "cursor-pointer hover:border-foreground/40")}
                    disabled={!!busy}
                    onClick={() => toggle(w.id)}
                    data-testid="outfit-add-piece"
                  >
                    <Plus className="h-2.5 w-2.5" /> {w.label}
                  </button>
                ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function SceneRow({ scene }: { scene: Scene }) {
  const sb = useStoryboard();
  const [name, setName] = useState(scene.name);
  const [start, setStart] = useState(String(scene.start));
  const [end, setEnd] = useState(String(scene.end));
  const shots = sb.boxes.filter((b) => sb.outfitOf(b).scene?.id === scene.id);
  const outfit = scene.outfitKey ? sb.outfits.find((o) => o.key === scene.outfitKey) : null;
  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return (
    <div
      className="grid grid-cols-1 items-center gap-1.5 sm:grid-cols-[1.4fr_0.6fr_0.6fr_1.4fr_auto]"
      data-testid="scene-row"
      data-scene-id={scene.id}
    >
      <Input
        className="h-8 text-xs"
        value={name}
        disabled={sb.sceneBusy}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== scene.name && void sb.saveScene(scene, { name })}
        data-testid="scene-name"
      />
      <Input
        className="h-8 text-xs"
        value={start}
        disabled={sb.sceneBusy}
        onChange={(e) => setStart(e.target.value)}
        onBlur={() =>
          num(start) !== null &&
          num(start) !== scene.start &&
          void sb.saveScene(scene, { start: num(start)! })
        }
        data-testid="scene-start"
        aria-label="start seconds"
      />
      <Input
        className="h-8 text-xs"
        value={end}
        disabled={sb.sceneBusy}
        onChange={(e) => setEnd(e.target.value)}
        onBlur={() =>
          num(end) !== null &&
          num(end) !== scene.end &&
          void sb.saveScene(scene, { end: num(end)! })
        }
        data-testid="scene-end"
        aria-label="end seconds"
      />
      <select
        className={selectClass}
        value={scene.outfitKey ?? ""}
        disabled={sb.sceneBusy}
        onChange={(e) => void sb.saveScene(scene, { outfitKey: e.target.value || null })}
        data-testid="scene-outfit"
      >
        <option value="">no outfit decided</option>
        {sb.outfits.map((o) => (
          <option key={o.key} value={o.key}>
            {o.name}
          </option>
        ))}
        {scene.outfitKey && !outfit && (
          <option value={scene.outfitKey}>{scene.outfitKey} (not an outfit of this video)</option>
        )}
      </select>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-foreground/45" data-testid="scene-shots">
          {shots.length === 0
            ? "no shots"
            : `shots ${shots.map((b) => sb.numberOf(b.id)).join(", ")}`}
        </span>
        <button
          type="button"
          className="text-foreground/40 hover:text-foreground"
          disabled={sb.sceneBusy}
          aria-label="Remove scene"
          onClick={() => void sb.removeScene(scene)}
          data-testid="scene-remove"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** The board-level panel: this video's outfits and scenes. */
export function WardrobePanel() {
  const sb = useStoryboard();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPieces, setNewPieces] = useState<string[]>([]);
  const [newScene, setNewScene] = useState<{
    name: string;
    start: string;
    end: string;
    outfitKey: string;
  }>({ name: "", start: "", end: "", outfitKey: "" });
  const archived = sb.entities.filter((e) => e.kind === "outfit" && e.archived).length;
  const proposed = sb.proposedScenes.filter(
    (p) => !sb.scenes.some((s) => Math.abs(s.start - p.start) < 0.05),
  );
  const dressedShots = sb.boxes.filter(
    (b) => b.spec.shotType !== "performance" && b.spec.wardrobe.source === "treatment",
  );
  const undressed = dressedShots.filter(
    (b) => !sb.outfitOf(b).outfit && sb.outfitOf(b).mode !== "none",
  );

  const addOutfit = async () => {
    if (!newName.trim()) return;
    const made = await sb.createOutfit(newName, newPieces);
    if (made) {
      setNewName("");
      setNewPieces([]);
    }
  };
  const addScene = async () => {
    const start = Number(newScene.start);
    const end = Number(newScene.end);
    if (!newScene.name.trim() || !Number.isFinite(start) || !Number.isFinite(end)) return;
    await sb.createScene({
      name: newScene.name,
      start,
      end,
      outfitKey: newScene.outfitKey || null,
    });
    setNewScene({ name: "", start: "", end: "", outfitKey: "" });
  };

  return (
    <section
      className="rounded-xl border border-border"
      data-testid="wardrobe-panel"
      data-open={open}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="wardrobe-toggle"
      >
        <Shirt className="h-3.5 w-3.5 text-foreground/50" />
        <span className="text-xs font-semibold">Wardrobe</span>
        <span className="text-[11px] text-foreground/45" data-testid="wardrobe-summary">
          {sb.outfits.length === 0
            ? "what he wears, defined once and worn by a scene — no outfits yet"
            : `${sb.outfits.length} outfit${sb.outfits.length === 1 ? "" : "s"} · ${sb.scenes.length} scene${sb.scenes.length === 1 ? "" : "s"}`}
          {undressed.length > 0 && (
            <span className="text-amber-200/90">
              {" "}
              · {undressed.length} dressed shot{undressed.length === 1 ? "" : "s"} with no outfit
              assigned
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 text-foreground/40 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border/60 p-3">
          <p className="text-[11px] leading-snug text-foreground/50">
            Define an outfit once — its words and its exact pieces from the artist's wardrobe
            pictures — and give it to a scene, a stretch of the song. Every shot in the scene wears
            it: the pieces go as reference pictures, the words on his line. A shot can be an
            exception. Change the outfit and every shot made with the old one is marked outdated.
            The treatment's own wardrobe words on each shot are checked against this, never obeyed
            in silence.
          </p>

          <div className="space-y-2" data-testid="wardrobe-outfits">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/55">
              Outfits
            </p>
            {sb.outfits.map((o) => (
              <OutfitCard key={o.id} outfit={o} />
            ))}
            {archived > 0 && <p className="text-[10px] text-foreground/40">{archived} archived</p>}
            <div
              className="space-y-1.5 rounded-lg border border-dashed border-border/60 p-2.5"
              data-testid="wardrobe-new-outfit"
            >
              <div className="flex gap-1.5">
                <Input
                  className="h-8 text-xs"
                  placeholder="new outfit — name it as the treatment does (“YSL denim look”)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void addOutfit()}
                  data-testid="outfit-new-name"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={!newName.trim()}
                  onClick={() => void addOutfit()}
                  data-testid="outfit-new-add"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
              </div>
              {sb.wardrobe.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {sb.wardrobe.map((w) => {
                    const on = newPieces.includes(w.id);
                    return (
                      <button
                        key={w.id}
                        type="button"
                        className={cn(
                          chip,
                          "cursor-pointer",
                          on && "border-emerald-400/50 bg-emerald-400/10 text-emerald-100",
                        )}
                        onClick={() =>
                          setNewPieces((p) => (on ? p.filter((x) => x !== w.id) : [...p, w.id]))
                        }
                        data-testid="outfit-new-piece"
                        data-selected={on}
                      >
                        {on ? `${newPieces.indexOf(w.id) + 1}. ` : ""}
                        {w.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2" data-testid="wardrobe-scenes">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/55">
              Scenes — which stretch of the song wears which outfit
            </p>
            {sb.scenes.length === 0 && (
              <p className="text-[11px] text-foreground/45">
                No scenes yet: no shot inherits an outfit.
              </p>
            )}
            {sb.scenes.length > 0 && (
              <div className="hidden grid-cols-[1.4fr_0.6fr_0.6fr_1.4fr_auto] gap-1.5 text-[10px] uppercase tracking-wide text-foreground/45 sm:grid">
                <span>scene</span>
                <span>from (s)</span>
                <span>to (s)</span>
                <span>wears</span>
                <span />
              </div>
            )}
            {sb.scenes.map((s) => (
              <SceneRow key={s.id} scene={s} />
            ))}
            <div
              className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1.4fr_0.6fr_0.6fr_1.4fr_auto]"
              data-testid="wardrobe-new-scene"
            >
              <Input
                className="h-8 text-xs"
                placeholder="new scene (“The viewer”)"
                value={newScene.name}
                onChange={(e) => setNewScene({ ...newScene, name: e.target.value })}
                data-testid="scene-new-name"
              />
              <Input
                className="h-8 text-xs"
                placeholder="43.1"
                value={newScene.start}
                onChange={(e) => setNewScene({ ...newScene, start: e.target.value })}
                data-testid="scene-new-start"
              />
              <Input
                className="h-8 text-xs"
                placeholder="58.8"
                value={newScene.end}
                onChange={(e) => setNewScene({ ...newScene, end: e.target.value })}
                data-testid="scene-new-end"
              />
              <select
                className={selectClass}
                value={newScene.outfitKey}
                onChange={(e) => setNewScene({ ...newScene, outfitKey: e.target.value })}
                data-testid="scene-new-outfit"
              >
                <option value="">no outfit decided</option>
                {sb.outfits.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={
                  sb.sceneBusy ||
                  !newScene.name.trim() ||
                  !Number.isFinite(Number(newScene.start)) ||
                  !Number.isFinite(Number(newScene.end)) ||
                  Number(newScene.end) <= Number(newScene.start)
                }
                onClick={() => void addScene()}
                data-testid="scene-new-add"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Scene
              </Button>
            </div>
          </div>

          {proposed.length > 0 && (
            <div
              className="space-y-1.5 rounded-lg border border-sky-400/20 bg-sky-400/5 p-2.5"
              data-testid="wardrobe-proposed"
            >
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-sky-200/80">
                <Sparkles className="h-3 w-3" /> What the treatment's words say
              </p>
              <p className="text-[11px] text-foreground/55">
                The writer dressed these stretches of the board in the treatment's own words. Adopt
                them as scenes; a stretch whose words name none of the outfits above waits for one.
              </p>
              <ul className="space-y-0.5 text-[11px] text-foreground/75">
                {proposed.map((p) => (
                  <li
                    key={`${p.phrase}-${p.start}`}
                    className="flex items-center gap-2"
                    data-testid="proposed-scene"
                    data-resolution={p.resolution}
                  >
                    <Clock className="h-3 w-3 text-foreground/40" />
                    <span>
                      {seconds(p.start)}–{seconds(p.end)} · “{p.phrase}” · {p.shotKeys.length} shot
                      {p.shotKeys.length === 1 ? "" : "s"} ·{" "}
                      {p.resolution === "resolved" ? (
                        <span className="text-emerald-200">
                          wears {sb.outfits.find((o) => o.key === p.outfitKey)?.name}
                        </span>
                      ) : p.resolution === "ambiguous" ? (
                        <span className="text-amber-200">
                          several outfits match: {p.candidates.join(", ")}
                        </span>
                      ) : (
                        <span className="text-amber-200">no outfit of that name yet</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={sb.sceneBusy}
                onClick={() => void sb.adoptProposedScenes(proposed)}
                data-testid="wardrobe-adopt-scenes"
              >
                Adopt {proposed.length === 1 ? "this scene" : `these ${proposed.length} scenes`}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** One shot's outfit: what it wears and why, its pieces as generation will receive them, and what stands in the way. */
export function ShotOutfitEditor({ box }: { box: StoryboardBox }) {
  const sb = useStoryboard();
  const busy = !!sb.busyOf(box.id);
  const resolved = sb.outfitOf(box);
  const pieces = sb.piecesOf(box);
  const flags = sb.outfitFlagsOf(box);
  const outdated = sb.outfitOutdatedOf(box);
  if (box.spec.shotType === "performance") return null;
  const own = new Set(box.spec.wardrobe.garments);
  const phrase =
    box.spec.wardrobe.source === "treatment" ? box.spec.wardrobe.description.trim() : "";
  return (
    <div
      className="space-y-2 border-t border-border/50 pt-3"
      data-testid="shot-outfit"
      data-outfit-key={resolved.outfit?.key ?? ""}
      data-outfit-source={resolved.source}
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/55">
          Wardrobe — what he wears here
        </p>
        <p
          className="mt-0.5 text-[11px] leading-snug text-foreground/70"
          data-testid="shot-outfit-line"
        >
          {resolved.outfit ? (
            <>
              <span className="font-medium text-foreground/90">{resolved.outfit.name}</span> v
              {resolved.outfit.outfit.version} —{" "}
              {resolved.source === "scene"
                ? `inherited from the scene “${resolved.scene?.name}”`
                : "set on this shot"}
            </>
          ) : resolved.mode === "none" ? (
            "no outfit, on purpose"
          ) : resolved.scene ? (
            `the scene “${resolved.scene.name}” has no outfit decided`
          ) : (
            "no scene covers this shot"
          )}
          {phrase && <span className="text-foreground/45"> · the treatment says “{phrase}”</span>}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <select
          className={selectClass}
          value={box.spec.wardrobe.outfitMode}
          disabled={busy}
          onChange={(e) =>
            void sb.saveContinuity(box, {
              outfit: {
                mode: e.target.value,
                key:
                  e.target.value === "exception"
                    ? (box.spec.wardrobe.outfitKey ?? sb.outfits[0]?.key ?? null)
                    : null,
              },
            })
          }
          data-testid="shot-outfit-mode"
        >
          <option value="inherit">wears its scene's outfit</option>
          <option value="exception">exception — wears a chosen outfit</option>
          <option value="none">no outfit on purpose</option>
        </select>
        {box.spec.wardrobe.outfitMode === "exception" && (
          <select
            className={selectClass}
            value={box.spec.wardrobe.outfitKey ?? ""}
            disabled={busy}
            onChange={(e) =>
              void sb.saveContinuity(box, {
                outfit: { mode: "exception", key: e.target.value || null },
              })
            }
            data-testid="shot-outfit-key"
          >
            <option value="">choose an outfit…</option>
            {sb.outfits.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-foreground/50">
          Pieces generation receives (as pictures, in this order)
        </span>
        {pieces.length === 0 && (
          <p className="text-[11px] text-foreground/45">none — he is described in words only</p>
        )}
        <div className="flex flex-wrap gap-1">
          {pieces.map((p, i) => (
            <span
              key={p.id}
              className={cn(
                chip,
                p.label
                  ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-100"
                  : "border-red-400/50 text-red-200",
              )}
              data-testid="shot-outfit-piece"
              data-from={p.from}
            >
              {i + 1}. {p.label ?? "no longer in the wardrobe"}
            </span>
          ))}
        </div>
        {sb.wardrobe.length > 0 && (
          <details className="text-[11px]">
            <summary className="cursor-pointer text-foreground/55">
              {own.size > 0
                ? "This shot's own pieces (instead of the outfit's)"
                : "Give this shot its own pieces instead of the outfit's"}
            </summary>
            <div className="mt-1 flex flex-wrap gap-1">
              {sb.wardrobe.map((w) => {
                const on = own.has(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={busy}
                    className={cn(
                      chip,
                      "cursor-pointer",
                      on && "border-emerald-400/50 bg-emerald-400/10 text-emerald-100",
                    )}
                    onClick={() =>
                      void sb.saveContinuity(box, {
                        garments: on ? [...own].filter((g) => g !== w.id) : [...own, w.id],
                      })
                    }
                    data-testid="shot-garment"
                    data-selected={on}
                  >
                    {w.label}
                  </button>
                );
              })}
              {own.size > 0 && (
                <button
                  type="button"
                  className={cn(chip, "cursor-pointer")}
                  disabled={busy}
                  onClick={() => void sb.saveContinuity(box, { garments: [] })}
                  data-testid="shot-garments-clear"
                >
                  <X className="h-2.5 w-2.5" /> back to the outfit's pieces
                </button>
              )}
            </div>
          </details>
        )}
      </div>
      {outdated && (
        <p
          className="flex items-start gap-1 text-[11px] text-amber-200/90"
          data-testid="shot-outfit-outdated"
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> The image this shot shows is
          outdated: {outdated}. Generate it again to wear what the shot wears now.
        </p>
      )}
      {flags.length > 0 && (
        <ul className="space-y-0.5" data-testid="shot-outfit-flags">
          {flags.map((f, i) => (
            <li
              key={i}
              className={cn("text-[11px] leading-snug", FLAG_CLASS[f.level])}
              data-testid="shot-outfit-flag"
              data-level={f.level}
            >
              {f.text} <span className="text-foreground/45">— {f.fix}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
