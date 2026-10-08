import { useEffect, useState } from "react";
import { Check, ChevronDown, ImagePlus, Lightbulb, Loader2, MapPin, Maximize2, Package, Plus, Save, Shirt, X, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ENTITY_KINDS, KIND_LABEL, KIND_PLURAL, continuitySource, hasContinuity, type ContinuityEntity, type EntityKind } from "@/lib/continuity/entities";
import type { StoryboardBox } from "@/lib/storyboard/boxes";
import { imageForClip } from "@/lib/storyboard/media";
import { Overlay } from "./Overlay";
import { useStoryboard } from "./useStoryboardController";

const KIND_ICON: Record<EntityKind, typeof MapPin> = { location: MapPin, prop: Package, lighting: Lightbulb, character: Users };
const selectClass = "h-9 w-full rounded-md border border-border bg-background/60 px-2 text-xs text-foreground";
const shotList = (numbers: readonly number[]) => (numbers.length ? `shot${numbers.length === 1 ? "" : "s"} ${numbers.join(", ")}` : "no shot yet");

/**
 * What a shot points at, at a glance: its place, props, light and look as chips. Nothing is described here — the
 * description is the entity's, once. A reference the project no longer has is shown as broken, never hidden.
 */
export function ContinuityChips({ box, className }: { box: StoryboardBox; className?: string }) {
  const sb = useStoryboard();
  const c = sb.continuityOf(box);
  if (!hasContinuity(c) && c.missing.length === 0) return null;
  const chip = "inline-flex items-center gap-1 rounded-full border border-border/70 bg-white/[0.03] px-2 py-0.5 text-[10px] text-foreground/75";
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)} data-testid="box-continuity">
      {c.location && (
        <span className={chip} data-entity-kind="location" data-entity-key={c.location.key} title={c.location.description}>
          <MapPin className="h-2.5 w-2.5" /> {c.location.name}
        </span>
      )}
      {c.props.map((p) => (
        <span key={p.key} className={chip} data-entity-kind="prop" data-entity-key={p.key} title={p.description}>
          <Package className="h-2.5 w-2.5" /> {p.name}
        </span>
      ))}
      {c.lighting && (
        <span className={chip} data-entity-kind="lighting" data-entity-key={c.lighting.key} title={c.lighting.description}>
          <Lightbulb className="h-2.5 w-2.5" /> {c.lighting.name}
        </span>
      )}
      {c.look && (
        <span className={chip} data-entity-kind="look" data-entity-key={c.look.id}>
          <Shirt className="h-2.5 w-2.5" /> {c.look.name}
        </span>
      )}
      {c.missing.map((k) => (
        <span key={k} className={cn(chip, "border-amber-400/40 text-amber-200")} data-entity-kind="missing" data-entity-key={k}>
          {k} — not in this project
        </span>
      ))}
    </div>
  );
}

/**
 * The shot's continuity references, edited: which of the project's places it is set in, which props are in it, the
 * lighting state it opens in, and the wardrobe look (an existing Look). Each choice is saved at once onto the shot's
 * own record. Says what generating then takes from each entity — its words, and for a place its approved picture.
 */
export function ShotContinuityEditor({ box }: { box: StoryboardBox }) {
  const sb = useStoryboard();
  const c = sb.continuityOf(box);
  const busy = sb.busyOf(box.id);
  const live = (kind: EntityKind, current?: string | null) => sb.entities.filter((e) => e.kind === kind && (!e.archived || e.key === current));
  const locations = live("location", c.location?.key);
  const props = live("prop");
  const lights = live("lighting", c.lighting?.key);
  const isPerformance = box.spec.shotType === "performance";
  const source = continuitySource(c, { forPlate: isPerformance });
  const ownImage = imageForClip(sb.mediaOf(box.id).items);
  const propKeys = new Set(box.spec.continuity.props);

  if (sb.entities.length === 0 && sb.looks.length === 0) {
    return (
      <div className="space-y-1 border-t border-border/50 pt-3" data-testid="shot-continuity">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/55">Continuity</p>
        <p className="text-[11px] leading-snug text-foreground/45">
          This project has no places, props or lighting states yet. Add one under <span className="text-foreground/70">Continuity</span> at the top of the storyboard, and shots can point at it instead of describing it again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 border-t border-border/50 pt-3" data-testid="shot-continuity">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/55">Continuity — what this shot points at</p>
        <p className="mt-0.5 text-[11px] leading-snug text-foreground/45">Described once, under Continuity. Every shot that points at the same one is generated from the same words{isPerformance ? " — and restaged into the same picture of the place" : ""}.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-foreground/50">
            <MapPin className="h-3 w-3" /> Place
          </span>
          <select className={selectClass} value={box.spec.continuity.location ?? ""} disabled={!!busy} onChange={(e) => void sb.saveContinuity(box, { location: e.target.value })} data-testid="shot-continuity-location">
            <option value="">described by this shot</option>
            {locations.map((e) => (
              <option key={e.key} value={e.key}>
                {e.name}
                {e.approvedAssetId ? "" : " (no approved picture)"}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-foreground/50">
            <Lightbulb className="h-3 w-3" /> Light it opens in
          </span>
          <select className={selectClass} value={box.spec.continuity.lighting ?? ""} disabled={!!busy} onChange={(e) => void sb.saveContinuity(box, { lighting: e.target.value })} data-testid="shot-continuity-lighting">
            <option value="">described by this shot</option>
            {lights.map((e) => (
              <option key={e.key} value={e.key}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        {sb.looks.length > 0 && (
          <label className="space-y-1">
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-foreground/50">
              <Shirt className="h-3 w-3" /> Look
            </span>
            <select className={selectClass} value={box.spec.wardrobe.lookId ?? ""} disabled={!!busy} onChange={(e) => void sb.saveContinuity(box, { look: e.target.value })} data-testid="shot-continuity-look">
              <option value="">as written for this shot</option>
              {sb.looks.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {props.length > 0 && (
        <div className="space-y-1">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-foreground/50">
            <Package className="h-3 w-3" /> Props in the shot
          </span>
          <div className="flex flex-wrap gap-1.5">
            {props.map((e) => {
              const on = propKeys.has(e.key);
              return (
                <button
                  key={e.key}
                  type="button"
                  disabled={!!busy}
                  onClick={() => void sb.saveContinuity(box, { props: on ? [...propKeys].filter((k) => k !== e.key) : [...propKeys, e.key] })}
                  className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]", on ? "border-primary/60 bg-primary/15 text-foreground" : "border-border text-foreground/55 hover:text-foreground")}
                  aria-pressed={on}
                  data-testid="shot-continuity-prop"
                  data-entity-key={e.key}
                >
                  {on && <Check className="h-3 w-3" />}
                  {e.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(source.lines.length > 0 || source.notes.length > 0) && (
        <div className="space-y-1 rounded-lg border border-border/60 bg-white/[0.02] p-2.5 text-[11px] leading-snug text-foreground/60" data-testid="shot-continuity-source">
          {source.lines.length > 0 && <p>Generating this shot uses, word for word: {source.lines.map((l) => l.split(":")[0].split(" — ")[0]).join(" · ")}.</p>}
          {isPerformance && source.placeOf && <p className="text-emerald-200/80">Restaging puts him in the approved picture of {source.placeOf.name} — the same picture as every other shot set there.</p>}
          {source.notes.map((n) => (
            <p key={n} className="text-amber-200/80">
              {n}
            </p>
          ))}
        </div>
      )}

      {c.location && ownImage && ownImage.asset.id !== c.location.approvedAssetId && (
        <Button size="sm" variant="outline" className="h-8 text-[11px]" disabled={!!busy || !!sb.entityBusyOf(c.location.id)} onClick={() => void sb.useShotImageFor(box, c.location!)} data-testid="shot-continuity-approve-image">
          <ImagePlus className="mr-1 h-3.5 w-3.5" /> Make this shot's image the approved picture of {c.location.name}
        </Button>
      )}
    </div>
  );
}

/**
 * An entity's reference pictures, approved by looking at them large. Shared by the continuity cards and the cast:
 * a place, an object and an invented person are all held to the picture that is approved here.
 */
export function EntityPictures({ entity }: { entity: ContinuityEntity }) {
  const sb = useStoryboard();
  const busy = sb.entityBusyOf(entity.id);
  const pictures = sb.picturesOf(entity);
  // a picture is approved by looking at it: a thumbnail the height of a thumb says nothing about a place
  const [lookingAt, setLookingAt] = useState<string | null>(null);
  const looked = pictures.find((a) => a.id === lookingAt) ?? null;
  return (
    <>
      <div className="space-y-1.5">
        {pictures.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" data-testid="entity-pictures">
            {pictures.map((a) => {
              const approved = a.id === entity.approvedAssetId;
              const url = sb.urlFor(a);
              return (
                <div key={a.id} className="relative">
                  <button
                    type="button"
                    disabled={!!busy || approved}
                    onClick={() => void sb.saveEntity(entity, { approvedAssetId: a.id })}
                    className={cn("relative block h-28 overflow-hidden rounded-md border", approved ? "border-emerald-400" : "border-border hover:border-foreground/40")}
                    title={approved ? "The approved picture" : "Approve this picture"}
                    data-testid="entity-picture"
                    data-approved={approved}
                    data-asset-id={a.id}
                  >
                    {url ? <img src={url} alt="" className="h-full w-auto" /> : <span className="flex h-full w-14 items-center justify-center text-[9px] text-foreground/40">…</span>}
                    {approved && (
                      <span className="absolute left-1 top-1 inline-flex items-center rounded bg-emerald-500/90 p-0.5 text-black" aria-label="The approved picture">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                  {url && (
                    <button
                      type="button"
                      onClick={() => setLookingAt(a.id)}
                      className="absolute right-1 top-1 inline-flex items-center rounded bg-black/65 p-1 text-white/85 hover:bg-black/85"
                      aria-label="Look at this picture large"
                      title="Look at it large"
                      data-testid="entity-picture-look"
                      data-asset-id={a.id}
                    >
                      <Maximize2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-foreground/40" data-testid="entity-no-picture">
            No reference picture yet{entity.kind === "location" ? " — until one is approved, shots set here are held by the description alone." : entity.kind === "character" ? " — until one is approved, shots they are in are held by the description alone." : "."}
          </p>
        )}
      </div>

    {looked && sb.urlFor(looked) && (
      <Overlay>
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-black/90 p-4" onClick={() => setLookingAt(null)} data-testid="entity-picture-large" data-asset-id={looked.id}>
          <img src={sb.urlFor(looked)} alt={`${entity.name} — reference picture`} className="max-h-[82vh] max-w-full rounded-md object-contain" onClick={(e) => e.stopPropagation()} />
          <div className="flex flex-wrap items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs text-white/70">
              {entity.name} · {looked.id === entity.approvedAssetId ? "the approved picture" : "not approved"}
            </span>
            {looked.id !== entity.approvedAssetId && (
              <Button
                size="sm"
                className="h-8 text-[11px]"
                disabled={!!busy}
                onClick={() => {
                  void sb.saveEntity(entity, { approvedAssetId: looked.id });
                  setLookingAt(null);
                }}
                data-testid="entity-picture-approve"
              >
                <Check className="mr-1 h-3.5 w-3.5" /> Approve this picture
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => setLookingAt(null)} data-testid="entity-picture-close">
              <X className="mr-1 h-3.5 w-3.5" /> Close
            </Button>
          </div>
        </div>
      </Overlay>
    )}
    </>
  );
}

/** One entity: its name, the words every shot is generated from, what must hold, its pictures, and who uses it. */
function EntityCard({ entity }: { entity: ContinuityEntity }) {
  const sb = useStoryboard();
  const [name, setName] = useState(entity.name);
  const [description, setDescription] = useState(entity.description);
  const [constraints, setConstraints] = useState(entity.constraints);
  const busy = sb.entityBusyOf(entity.id);
  const dirty = name !== entity.name || description !== entity.description || constraints !== entity.constraints;
  const stamp = `${entity.id}:${entity.updatedAt}`;
  useEffect(() => {
    setName(entity.name);
    setDescription(entity.description);
    setConstraints(entity.constraints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);
  const used = sb.entityUsage.get(entity.key) ?? [];
  const Icon = KIND_ICON[entity.kind];

  return (
    <div className={cn("space-y-2 rounded-xl border border-border p-3", entity.archived && "opacity-60")} data-testid="entity-card" data-entity-key={entity.key} data-entity-kind={entity.kind}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-foreground/50" />
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 flex-1 text-xs" aria-label="Name" data-testid="entity-name" />
        <code className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-foreground/50" data-testid="entity-key">
          {entity.key}
        </code>
      </div>
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="text-xs"
        placeholder={
          entity.kind === "location"
            ? "The place itself, with nobody in it: what stands where, the surfaces, the light."
            : entity.kind === "prop"
              ? "The object: what it is, its colour, material and marks."
              : "The light: where it comes from, how hard, what colour, what stays dark."
        }
        aria-label="Canonical description"
        data-testid="entity-description"
      />
      <Input value={constraints} onChange={(e) => setConstraints(e.target.value)} className="h-8 text-xs" placeholder="What must always hold — e.g. never a second car; the centre line stays white" aria-label="Constraints" data-testid="entity-constraints" />

      {entity.kind !== "lighting" && <EntityPictures entity={entity} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-8 text-[11px]" disabled={!!busy || !dirty} onClick={() => void sb.saveEntity(entity, { name, description, constraints })} data-testid="entity-save">
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />} Save
        </Button>
        {entity.kind !== "lighting" && (
          <Button size="sm" variant="outline" className="h-8 text-[11px]" disabled={!!busy || dirty || !entity.description.trim()} onClick={() => sb.generateEntityPicture(entity)} data-testid="entity-generate-picture">
            <ImagePlus className="mr-1 h-3.5 w-3.5" /> Draw reference pictures
          </Button>
        )}
        <span className="text-[11px] text-foreground/45" data-testid="entity-usage">
          {busy ?? `Used by ${shotList(used)}`}
        </span>
        <button type="button" className="ml-auto text-[11px] text-foreground/40 hover:text-foreground/70" disabled={!!busy} onClick={() => void sb.saveEntity(entity, { archived: !entity.archived })} data-testid="entity-archive">
          {entity.archived ? "Bring back" : "Archive"}
        </button>
      </div>
    </div>
  );
}

/**
 * The project's continuity: its places, props and lighting states, each described once. Shots point at them. Closed
 * by default — it is reference, not the board.
 */
export function ContinuityPanel() {
  const sb = useStoryboard();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<EntityKind | null>(null);
  const [name, setName] = useState("");
  // Characters are entities too, but they are not edited here: a cast member needs a role and an
  // identity mode, which this panel has no fields for, and `createContinuityEntity` refuses a
  // character without them. The Cast panel owns them. See src/components/storyboard/Cast.tsx.
  const SET_KINDS = ENTITY_KINDS.filter((k) => k !== "character");
  const live = sb.entities.filter((e) => !e.archived && e.kind !== "character");
  const count = (kind: EntityKind) => live.filter((e) => e.kind === kind).length;

  const add = async () => {
    if (!adding || !name.trim()) return;
    const made = await sb.createEntity(adding, name);
    if (made) {
      setName("");
      setAdding(null);
    }
  };

  return (
    <section className="rounded-xl border border-border" data-testid="continuity-panel" data-open={open}>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="continuity-toggle">
        <MapPin className="h-3.5 w-3.5 text-foreground/50" />
        <span className="text-xs font-semibold">Continuity</span>
        <span className="text-[11px] text-foreground/45" data-testid="continuity-summary">
          {live.length === 0 ? "places, props and lighting states the shots share — none yet" : SET_KINDS.filter((k) => count(k) > 0).map((k) => `${count(k)} ${(count(k) === 1 ? KIND_LABEL[k] : KIND_PLURAL[k]).toLowerCase()}`).join(" · ")}
        </span>
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 text-foreground/40 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border/60 p-3">
          <p className="text-[11px] leading-snug text-foreground/50">
            Describe a place, a prop or a lighting state once, here. A shot then points at it instead of describing it again, and every shot that points at it is generated from these same words. A place's approved picture is the place every performance shot set
            there is restaged into. Wardrobe looks are the artist's Looks — a shot points at one the same way.
          </p>
          {SET_KINDS.map((kind) => {
            const list = sb.entities.filter((e) => e.kind === kind);
            return (
              <div key={kind} className="space-y-2" data-testid={`continuity-${kind}`}>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/55">{KIND_PLURAL[kind]}</p>
                  <button type="button" className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline" onClick={() => { setAdding(kind); setName(""); }} data-testid={`continuity-add-${kind}`}>
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
                {adding === kind && (
                  <div className="flex items-center gap-2">
                    <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} placeholder={`Name the ${KIND_LABEL[kind].toLowerCase()}`} className="h-8 flex-1 text-xs" data-testid="continuity-new-name" />
                    <Button size="sm" className="h-8 text-[11px]" disabled={!name.trim()} onClick={() => void add()} data-testid="continuity-new-save">
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={() => setAdding(null)}>
                      Cancel
                    </Button>
                  </div>
                )}
                {list.length === 0 && adding !== kind ? <p className="text-[11px] text-foreground/35">None.</p> : null}
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {list.map((e) => (
                    <EntityCard key={e.id} entity={e} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
