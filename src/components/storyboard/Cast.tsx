/**
 * CAST — who is in the video, and who is in each shot.
 *
 * Two surfaces, both inside the Storyboard workflow beside Continuity rather than on a page of
 * their own: the variation's characters (described once), and one shot's direction for the people
 * in it (written per shot, because the same character stands differently in every shot).
 *
 * The thing this UI exists to make impossible: a shot that needed a particular person, had no
 * reference for them, and was generated anyway. Every problem `castProblems` finds is shown on the
 * shot, before the generate buttons, with what would clear it.
 *
 * Nothing here suggests an appearance, a demographic or a default person. An undescribed character
 * is shown as undescribed.
 */
import {
  AlertTriangle,
  ChevronDown,
  CircleHelp,
  ImagePlus,
  Link2,
  Plus,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  CAST_ROLES,
  IDENTITY_LABEL,
  IDENTITY_MODES,
  ROLE_LABEL,
  type CastIdentityMode,
  type CastProblem,
  type CastRole,
} from "@/lib/casting/cast";
import { entityPictureRefusal, type ContinuityEntity } from "@/lib/continuity/entities";
import type { CastRef } from "@/lib/treatment/shotSpec";
import type { StoryboardBox } from "@/lib/storyboard/boxes";
import { EntityPictures } from "./Continuity";
import { useStoryboard } from "./useStoryboardController";

const field =
  "h-9 w-full rounded-md border border-border bg-background/60 px-2 text-xs text-foreground";
const chip =
  "inline-flex items-center gap-1 rounded-full border border-border/70 bg-white/[0.03] px-2 py-0.5 text-[10px] text-foreground/75";

/** The people in a shot, at a glance, with anything unresolved shown rather than hidden. */
export function CastChips({ box, className }: { box: StoryboardBox; className?: string }) {
  const sb = useStoryboard();
  const cast = sb.castOf(box);
  if (!cast.members.length && !cast.missing.length && !cast.open && !cast.none) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)} data-testid="box-cast">
      {cast.none && <span className={chip}>No people</span>}
      {cast.open && <span className={chip}>Open casting</span>}
      {cast.members.map((m) => (
        <span
          key={m.entity.key}
          className={chip}
          data-cast-key={m.entity.key}
          data-identity-mode={m.mode}
          title={m.entity.description}
        >
          <UserRound className="h-2.5 w-2.5" /> {m.entity.name}
        </span>
      ))}
      {cast.missing.map((k) => (
        <span
          key={k}
          className={cn(chip, "border-amber-400/40 text-amber-200")}
          data-cast-missing={k}
        >
          {k} — not cast in this variation
        </span>
      ))}
    </div>
  );
}

/** The fix is written as a continuation; it starts a sentence when it is rendered after the text. */
const sentenceCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const LEVEL_STYLE: Record<CastProblem["level"], string> = {
  blocking: "border-red-400/40 bg-red-500/10 text-red-200",
  warning: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  unsaid: "border-border/70 bg-white/[0.02] text-foreground/70",
};
const LEVEL_ICON: Record<CastProblem["level"], typeof AlertTriangle> = {
  blocking: AlertTriangle,
  warning: AlertTriangle,
  unsaid: CircleHelp,
};

/**
 * What is wrong with this shot's casting, said before anything is generated.
 *
 * `unsaid` is deliberately quiet styling and deliberately still shown: nobody cast and no decision
 * recorded is not an error, but it is not nothing either, and it is the difference between open
 * casting on purpose and a shot nobody finished.
 */
export function CastReadiness({ box }: { box: StoryboardBox }) {
  const sb = useStoryboard();
  const problems = sb.castProblemsOf(box);
  if (!problems.length) return null;
  return (
    <div className="space-y-1" data-testid="cast-readiness">
      {problems.map((p, i) => {
        const Icon = LEVEL_ICON[p.level];
        return (
          <div
            key={`${p.key ?? "shot"}-${i}`}
            className={cn(
              "flex items-start gap-1.5 rounded-md border px-2 py-1 text-[11px]",
              LEVEL_STYLE[p.level],
            )}
            data-problem-level={p.level}
            data-problem-key={p.key ?? ""}
          >
            <Icon className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {p.text}. <span className="opacity-70">{sentenceCase(p.fix)}.</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * This shot's cast: which of the variation's characters are in it, and what each does here.
 *
 * Action, placement and framing are stored on the SHOT, not on the character — the same person
 * stands differently in every shot, and a description that moved to the character would follow them
 * through the whole video.
 */
export function ShotCastEditor({ box }: { box: StoryboardBox }) {
  const sb = useStoryboard();
  const cast = sb.castOf(box);
  const busy = sb.busyOf(box.id);
  const characters = sb.entities.filter(
    (e) =>
      e.kind === "character" && (!e.archived || cast.members.some((m) => m.entity.key === e.key)),
  );
  const uncast = characters.filter((e) => !cast.members.some((m) => m.entity.key === e.key));

  const members: CastRef[] = cast.members.map((m) => m.ref);
  const write = (next: CastRef[]) => void sb.saveCast(box, { members: next });

  return (
    <div className="space-y-2" data-testid="shot-cast-editor">
      <div className="flex items-center gap-3 text-[11px] text-foreground/70">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={cast.none}
            disabled={!!busy}
            onChange={(e) =>
              void sb.saveCast(box, {
                none: e.target.checked,
                ...(e.target.checked ? { open: false } : {}),
              })
            }
            data-testid="cast-none"
          />
          No people in this shot
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={cast.open}
            disabled={!!busy || cast.none}
            onChange={(e) => void sb.saveCast(box, { open: e.target.checked })}
            data-testid="cast-open"
          />
          Open casting (on purpose)
        </label>
      </div>

      {!cast.none && (
        <>
          {cast.members.map((m, i) => (
            <div
              key={m.entity.key}
              className="space-y-1 rounded-md border border-border/60 p-2"
              data-cast-row={m.entity.key}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-xs text-foreground">
                  <UserRound className="h-3 w-3" /> {m.entity.name}
                  <span className="text-[10px] text-foreground/50">
                    {ROLE_LABEL[m.entity.cast.role]}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-foreground/50 hover:text-foreground"
                  disabled={!!busy}
                  onClick={() => write(members.filter((_, j) => j !== i))}
                  aria-label={`Take ${m.entity.name} out of this shot`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(["action", "placement", "framing"] as const).map((k) => (
                  <input
                    key={k}
                    className={field}
                    placeholder={k}
                    defaultValue={m.ref[k]}
                    disabled={!!busy}
                    onBlur={(e) => {
                      if (e.target.value === m.ref[k]) return;
                      write(members.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));
                    }}
                    data-cast-field={`${m.entity.key}.${k}`}
                  />
                ))}
              </div>
              <select
                className={field}
                value={m.ref.identityMode ?? ""}
                disabled={!!busy}
                onChange={(e) =>
                  write(
                    members.map((r, j) =>
                      j === i
                        ? {
                            ...r,
                            identityMode: (e.target.value || null) as CastIdentityMode | null,
                          }
                        : r,
                    ),
                  )
                }
                data-cast-field={`${m.entity.key}.identityMode`}
              >
                <option value="">
                  Identity: as set on the character ({IDENTITY_LABEL[m.entity.cast.identityMode]})
                </option>
                {IDENTITY_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    Identity, this shot only: {IDENTITY_LABEL[mode]}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {uncast.length > 0 && (
            <select
              className={field}
              value=""
              disabled={!!busy}
              onChange={(e) => {
                if (!e.target.value) return;
                write([
                  ...members,
                  {
                    key: e.target.value,
                    action: "",
                    placement: "",
                    framing: "",
                    identityMode: null,
                  },
                ]);
              }}
              data-testid="cast-add"
            >
              <option value="">Put someone in this shot…</option>
              {uncast.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name} — {ROLE_LABEL[e.cast!.role]}
                </option>
              ))}
            </select>
          )}
        </>
      )}

      <CastReadiness box={box} />
    </div>
  );
}

/**
 * The variation's characters, described once each.
 *
 * Role and identity mode are the two choices that change what generation does; everything else is
 * the director's own words. Nothing is pre-filled.
 */
export function CastList() {
  const sb = useStoryboard();
  const characters = sb.entities.filter((e) => e.kind === "character");
  const [name, setName] = useState("");
  const [role, setRole] = useState<CastRole>("fictional");

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    // A new character is invented until someone says otherwise: the mode that matches nobody is the
    // only safe default, because the others promise a likeness there may be no reference for.
    const created = await sb.createEntity("character", n, {
      role,
      identityMode: role === "primary_artist" ? "preserve" : "invent",
      artistId: null,
    });
    if (created) setName("");
  };

  return (
    <div className="space-y-2" data-testid="cast-list">
      {characters.length === 0 && (
        <p className="text-[11px] text-foreground/60">
          Nobody is cast in this variation yet. Shots with no cast are generated with whoever the
          model chooses.
        </p>
      )}

      {characters.map((e) => (
        <CastMemberRow key={e.id} entity={e} />
      ))}

      <div className="flex items-center gap-1">
        <input
          className={field}
          placeholder="New character's name"
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          onKeyDown={(ev) => ev.key === "Enter" && void add()}
          data-testid="cast-new-name"
        />
        <select
          className={cn(field, "w-40")}
          value={role}
          onChange={(ev) => setRole(ev.target.value as CastRole)}
          data-testid="cast-new-role"
        >
          {CAST_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1.5 text-xs"
          onClick={() => void add()}
          data-testid="cast-new-add"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function CastMemberRow({ entity }: { entity: ContinuityEntity }) {
  const sb = useStoryboard();
  const facts = entity.cast;
  const busy = sb.entityBusyOf(entity.id);
  const used = sb.entityUsage.get(entity.key) ?? [];
  if (!facts) return null;

  const hasReference = !!entity.approvedAssetId || entity.referenceAssetIds.length > 0;
  const needsReference =
    (facts.identityMode === "preserve" || facts.identityMode === "recurring") &&
    !hasReference &&
    !facts.artistId;

  return (
    <div className="space-y-1 rounded-md border border-border/60 p-2" data-cast-member={entity.key}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs text-foreground">
          <UserRound className="h-3 w-3" /> {entity.name}
          {facts.artistId && (
            <span
              className="flex items-center gap-0.5 text-[10px] text-foreground/50"
              title="Linked to the artist record — their likeness lives there"
            >
              <Link2 className="h-2.5 w-2.5" /> artist
            </span>
          )}
        </span>
        <span className="text-[10px] text-foreground/50">
          {used.length
            ? `shot${used.length === 1 ? "" : "s"} ${used.join(", ")}`
            : "in no shot yet"}
        </span>
      </div>

      <textarea
        className="min-h-[48px] w-full rounded-md border border-border bg-background/60 px-2 py-1 text-xs text-foreground"
        placeholder="How they look and carry themselves — your words, used in every shot they are in"
        defaultValue={entity.description}
        disabled={!!busy}
        onBlur={(e) =>
          e.target.value !== entity.description &&
          void sb.saveEntity(entity, { description: e.target.value })
        }
        data-cast-field={`${entity.key}.description`}
      />

      <div className="grid grid-cols-2 gap-1">
        <select
          className={field}
          value={facts.role}
          disabled={!!busy}
          onChange={(e) =>
            void sb.saveEntity(entity, { cast: { role: e.target.value as CastRole } })
          }
          data-cast-field={`${entity.key}.role`}
        >
          {CAST_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <select
          className={field}
          value={facts.identityMode}
          disabled={!!busy}
          onChange={(e) =>
            void sb.saveEntity(entity, {
              cast: { identityMode: e.target.value as CastIdentityMode },
            })
          }
          data-cast-field={`${entity.key}.identityMode`}
        >
          {IDENTITY_MODES.map((m) => (
            <option key={m} value={m}>
              {IDENTITY_LABEL[m]}
            </option>
          ))}
        </select>
      </div>

      {needsReference && (
        <p
          className="flex items-start gap-1 text-[11px] text-amber-200"
          data-cast-needs-reference={entity.key}
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {entity.name} must match a person, but has no approved picture. Approve one, or set them
          to invent.
        </p>
      )}

      {/* An invented likeness is drawn and approved here; a real person's comes from their photographs. */}
      {!entityPictureRefusal(entity) && (
        <>
          <EntityPictures entity={entity} />
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground/80 hover:text-foreground disabled:opacity-50"
            disabled={!!busy || !entity.description.trim()}
            title={
              entity.description.trim()
                ? undefined
                : "Describe them first — the picture is drawn from these words"
            }
            onClick={() => sb.generateEntityPicture(entity)}
            data-testid="entity-generate-picture"
          >
            <ImagePlus className="h-3 w-3" /> Draw reference pictures
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The cast of this video variation, collapsed beside Continuity.
 *
 * Deliberately a sibling of the Continuity panel and not a page: casting is part of writing the
 * board, and a separate surface would let a shot be generated without anyone having looked at it.
 */
export function CastPanel() {
  const sb = useStoryboard();
  const [open, setOpen] = useState(false);
  const characters = sb.entities.filter((e) => e.kind === "character" && !e.archived);

  return (
    <section className="rounded-xl border border-border" data-testid="cast-panel" data-open={open}>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="cast-toggle"
      >
        <UserRound className="h-3.5 w-3.5 text-foreground/50" />
        <span className="text-xs font-semibold">Cast</span>
        <span className="text-[11px] text-foreground/45" data-testid="cast-summary">
          {characters.length === 0
            ? "who is in this video — nobody yet"
            : `${characters.length} character${characters.length === 1 ? "" : "s"}`}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 text-foreground/40 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/60 p-3">
          <p className="text-[11px] leading-snug text-foreground/50">
            Describe each person once, here; a shot then says who is in it and what they do. This
            cast belongs to this video variation — another variation of the same song can be cast
            completely differently. The artist&apos;s own likeness stays on their artist record;
            linking a character to it points at that, it does not copy it.
          </p>
          <CastList />
        </div>
      )}
    </section>
  );
}
