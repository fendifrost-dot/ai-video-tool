/**
 * What a background has to be, for THIS take to sit in it — and what to do with the shot.
 *
 * footage.ts reads the take. This turns that reading into something a background instruction can be held against,
 * and into one recommendation with its reasons. It is advisory: nothing here regenerates a clip, replaces an asset,
 * edits a treatment or touches a timeline.
 *
 * ── THE RULE THAT DECIDES HARD FROM PREFERRED ────────────────────────────────────────────────────────────────────
 * A constraint is HARD only where the finding behind it was MEASURED. A finding that was ESTIMATED produces a
 * PREFERENCE, however confident it sounds. A finding that is UNKNOWN produces neither — it produces a named risk, so
 * that the thing nobody checked is visible instead of quietly becoming a requirement.
 *
 * This is not a stylistic choice. The restaging that failed in October failed on light and camera move, both of which
 * are estimates off this footage; promoting them to requirements would have put a number on the brief that the
 * footage cannot support, and the generator would have been held to a standard nobody measured. A preference that is
 * missed is a note; a hard constraint that is missed is a reject. Only measurements earn that.
 */
import type { FootageAnalysis, Finding } from "./footage";

export const COMPATIBILITY_VERSION = 1 as const;

export type ConstraintKind =
  "composition" | "camera" | "light" | "colour" | "focus" | "floor" | "reframe" | "separation";

export type Constraint = {
  kind: ConstraintKind;
  /** Written for whoever is asking for the background — a sentence, not a field. */
  text: string;
  /** The finding it came from, so a reader can go and look at it. */
  from: string;
};

export type RouteChoice = "keep" | "composite" | "restage" | "reshoot";

export type Route = {
  choice: RouteChoice;
  confidence: number;
  because: string[];
  risks: string[];
  /** The routes NOT chosen, and why — so the recommendation can be argued with. */
  rejected: { choice: RouteChoice; why: string }[];
};

/** What the approved treatment wants of this shot, where the caller knows it. All optional. */
export type TreatmentIntent = {
  /** e.g. "full_body" when the treatment calls for him head to foot. */
  wantsCoverage?: "head_only" | "chest_up" | "waist_up" | "thigh_up" | "knee_up" | "full_body";
  /** e.g. "push" / "orbit" / "static" — the engine words the coverage planner uses. */
  wantsCameraMove?: string;
  wantsKeyDirection?: "frame_left" | "frame_right" | "above" | "below" | "even";
  /** True when the treatment puts him somewhere with a visible floor he stands on. */
  wantsFloorContact?: boolean;
  note?: string;
};

export type Conflict = {
  /** What the treatment asks for, and what the take will support. */
  wants: string;
  footage: string;
  /** Whether an adjustment short of a reshoot resolves it. */
  resolvableBy: string | null;
};

export type Compatibility = {
  version: typeof COMPATIBILITY_VERSION;
  forAnalyzer: FootageAnalysis["version"];
  hard: Constraint[];
  preferences: Constraint[];
  route: Route;
  /** Said in the take's own terms, for the person holding the camera next time. */
  capture: string[];
  /** Where the approved treatment and the footage disagree. Neither is rewritten here. */
  conflicts: Conflict[];
  /** What AVT cannot do today that this recommendation would need. */
  gaps: string[];
};

const COVERAGE_ORDER = [
  "head_only",
  "chest_up",
  "waist_up",
  "thigh_up",
  "knee_up",
  "full_body",
] as const;

const isMeasured = (f: Finding<unknown>) => f.status === "measured";
const isEstimated = (f: Finding<unknown>) => f.status === "estimated";

/** Put a constraint on the hard list when its finding was measured, the preference list when it was estimated. */
function place(hard: Constraint[], prefs: Constraint[], f: Finding<unknown>, c: Constraint): void {
  if (isMeasured(f)) hard.push(c);
  else if (isEstimated(f)) prefs.push(c);
}

const pct = (n: number) => `${Math.round(n * 100)} %`;

export function compatibilityOf(a: FootageAnalysis, intent: TreatmentIntent = {}): Compatibility {
  const hard: Constraint[] = [];
  const preferences: Constraint[] = [];
  const capture: string[] = [];
  const conflicts: Conflict[] = [];
  const gaps: string[] = [];
  const risks: string[] = [];

  // ── composition ─────────────────────────────────────────────────────────────────────────────────────────────────
  const pos = a.subject.position;
  if (pos.value) {
    place(hard, preferences, pos, {
      kind: "composition",
      text: `Leave the performer's place clear: his eye-line sits at ${pct(pos.value.x)} across and ${pct(pos.value.y)} down the frame. Put nothing of interest there, and nothing that has to be read behind his head and shoulders.`,
      from: "subject.position",
    });
  }
  const travel = a.subject.travel;
  if (travel.value) {
    const room = Math.max(travel.value.x, travel.value.y);
    place(hard, preferences, travel, {
      kind: "composition",
      text:
        room < 0.02
          ? "He holds his place: the background can carry detail close around him without his crossing it."
          : `He moves across ${pct(travel.value.x)} of the frame and ${pct(travel.value.y)} down it. Keep that band clear of anything the eye has to follow.`,
      from: "subject.travel",
    });
  }
  const cov = a.subject.coverage;
  if (cov.value) {
    preferences.push({
      kind: "composition",
      text: `The take frames him ${cov.value.replace(/_/g, " ")}. A background built for a fuller figure will not match: there is no footage of the rest of him.`,
      from: "subject.coverage",
    });
  }
  const edges = a.subject.faceNearEdge;
  if (edges.value && edges.value.length) {
    hard.push({
      kind: "composition",
      text: `He passes close to the ${edges.value.join(" and ")} edge. A background whose subject matter runs to that edge will collide with him.`,
      from: "subject.faceNearEdge",
    });
  }

  // ── camera ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const stability = a.camera.stability;
  const source = a.camera.motionSource;
  if (stability.value === "locked" && source.value === "still") {
    hard.push({
      kind: "camera",
      text: "The camera does not move. The background must be locked off too — any drift in it will read as the room sliding behind a man who is standing still.",
      from: "camera.stability + camera.motionSource",
    });
  } else if (stability.value && stability.value !== "locked") {
    preferences.push({
      kind: "camera",
      text: `The picture is not steady (${stability.value.replace(/_/g, " ")}). A background plate must carry the same movement or be stabilised to match; a locked plate behind an unsteady foreground reads as a cut-out.`,
      from: "camera.stability",
    });
    risks.push(
      "the take's own movement has to be reproduced in the background, and this analysis measures its size but not its path",
    );
  }
  if (source.value === "cannot_separate" || source.value === "mixed") {
    risks.push(
      "the picture moves, and this reading cannot say whether the camera or the man moved — a background built for the wrong one will slide",
    );
    capture.push(
      "Next time, hold the camera still or move it deliberately. A camera that drifts while he moves cannot be told apart afterwards, and nothing downstream can match it.",
    );
  }

  // ── light ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const key = a.light.keyDirection;
  if (key.value) {
    place(hard, preferences, key, {
      kind: "light",
      text:
        key.value === "even"
          ? "The light is even across the frame. A background with a strong, directional key will not sit with him."
          : `The brighter side of the picture is ${key.value.replace(/_/g, " ")}. Light the background from the same side; a background keyed from the opposite side is the single most visible mismatch in a composite.`,
      from: "light.keyDirection",
    });
  }
  const soft = a.light.softness;
  if (soft.value) {
    place(hard, preferences, soft, {
      kind: "light",
      text: `His light reads ${soft.value}. Match that: ${soft.value === "soft" ? "no hard-edged shadows in the background" : "a background lit flatter than he is will look pasted behind him"}.`,
      from: "light.softness",
    });
  }
  const exposure = a.light.exposure;
  if (exposure.value) {
    place(hard, preferences, exposure, {
      kind: "light",
      text: `Mean brightness is ${exposure.value.mean.toFixed(2)} of full scale. Build the background to that, not brighter: he cannot be relit.`,
      from: "light.exposure",
    });
  }
  const clip = a.light.clipping;
  if (clip.value && (clip.value.white > 0.02 || clip.value.black > 0.05)) {
    hard.push({
      kind: "light",
      text: `${pct(clip.value.white)} of the picture is blown out and ${pct(clip.value.black)} is crushed. Those areas carry no detail to match to, so keep the background away from them.`,
      from: "light.clipping",
    });
    capture.push(
      `Exposure is clipping (${pct(clip.value.white)} white, ${pct(clip.value.black)} black). Pull the key back or add fill so the highlights and shadows hold detail.`,
    );
  }
  const cast = a.light.colourCast;
  if (cast.value) {
    place(hard, preferences, cast, {
      kind: "colour",
      text:
        cast.value.strength > 0.08
          ? `The take carries a colour cast (r ${cast.value.r.toFixed(2)} g ${cast.value.g.toFixed(2)} b ${cast.value.b.toFixed(2)}). Grade the background to it rather than correcting him.`
          : "The take is close to neutral; a strongly tinted background will have to be graded back towards it.",
      from: "light.colourCast",
    });
  }
  const transfer = a.file.transfer;
  if (transfer.value) {
    hard.push({
      kind: "colour",
      text: `The file is tagged ${transfer.value}. A background generated in ordinary sRGB will not match it until one of the two is converted, and converting him is what loses his skin.`,
      from: "file.transfer",
    });
    gaps.push(
      `AVT has no colour-transfer step: nothing in the pipeline converts ${transfer.value} footage to the space a generated plate is produced in, or back`,
    );
  }

  // ── focus ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const dof = a.focus.depthOfField;
  const svb = a.focus.subjectVsBackground;
  if (dof.value && svb.value !== null) {
    preferences.push({
      kind: "focus",
      text:
        dof.value === "shallow"
          ? `He is about ${svb.value.toFixed(1)}× sharper than what is behind him: the background should be defocused to match.`
          : dof.value === "deep"
            ? "The background is about as sharp as he is: a defocused plate will read as a different lens."
            : "Subject and background sharpness are too close to call; match the plate to the take by eye rather than to a number from here.",
      from: "focus.depthOfField",
    });
  }
  const blurred = a.focus.blurredFrames;
  if (blurred.value !== null && blurred.value > 0.1) {
    hard.push({
      kind: "focus",
      text: `${pct(blurred.value)} of frames are soft with movement. On those frames his edge cannot be cut cleanly, whatever the background is.`,
      from: "focus.blurredFrames",
    });
    capture.push(
      `${pct(blurred.value)} of frames are lost to motion blur. A faster shutter — or more light so the shutter can be faster — is the fix; nothing downstream can sharpen them.`,
    );
    risks.push("motion-blurred frames will tear at the edge in any composite");
  }
  const res = a.file.resolution;
  if (res.value) {
    hard.push({
      kind: "focus",
      text: `The background must be delivered at ${res.value.width} × ${res.value.height} or larger. Anything smaller has to be scaled up into him.`,
      from: "file.resolution",
    });
  }

  // ── separation ──────────────────────────────────────────────────────────────────────────────────────────────────
  const sep = a.separation.difficulty;
  if (sep.value) {
    preferences.push({
      kind: "separation",
      text:
        sep.value === "hard"
          ? "Cutting him off this background looks hard. Prefer a background that can sit BEHIND the whole frame with him composited over a treated version of his own room, over one that needs a clean matte."
          : sep.value === "moderate"
            ? "A matte is workable but not free; keep the background away from his edges in brightness and detail."
            : "He separates from this background readily.",
      from: "separation.difficulty",
    });
  }

  // ── floor ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const feet = a.floor.feetVisible;
  const contact = a.floor.contactNeeded;
  if (contact.value === true) {
    preferences.push({
      kind: "floor",
      text: "His feet are likely in frame, so the background needs a floor at the right height and a contact shadow under him, or he will float.",
      from: "floor.contactNeeded",
    });
    gaps.push(
      "AVT has no contact-shadow step: a composite that shows his feet has nothing to ground them with",
    );
  } else if (contact.value === false) {
    preferences.push({
      kind: "floor",
      text: "The frame ends above his feet, so no floor contact and no contact shadow has to be matched — one fewer thing for the background to get wrong.",
      from: "floor.contactNeeded",
    });
  }
  if (feet.value === false) {
    hard.push({
      kind: "reframe",
      text: "Do not reframe wider or lower than the take. There is no footage of his legs or feet; a background that reveals them will reveal nothing.",
      from: "floor.feetVisible + subject.coverage",
    });
  }

  // ── the treatment, where it is known ────────────────────────────────────────────────────────────────────────────
  if (intent.wantsCoverage && cov.value) {
    const want = COVERAGE_ORDER.indexOf(intent.wantsCoverage);
    const have = COVERAGE_ORDER.indexOf(cov.value);
    if (want > have) {
      conflicts.push({
        wants: `the treatment frames him ${intent.wantsCoverage.replace(/_/g, " ")}`,
        footage: `the take only reaches ${cov.value.replace(/_/g, " ")}`,
        resolvableBy: null,
      });
    } else if (want < have) {
      conflicts.push({
        wants: `the treatment frames him ${intent.wantsCoverage.replace(/_/g, " ")}`,
        footage: `the take is wider than that (${cov.value.replace(/_/g, " ")})`,
        resolvableBy: `a crop — the take holds more of him than the treatment asks for, so this costs resolution, not a reshoot`,
      });
    }
  }
  if (
    intent.wantsCameraMove &&
    intent.wantsCameraMove !== "static" &&
    stability.value === "locked"
  ) {
    conflicts.push({
      wants: `the treatment asks for a ${intent.wantsCameraMove}`,
      footage: "the take is locked off",
      resolvableBy:
        "a 2D move on the take itself (scripts/edit/camera_engine.py), which buys a push or a truck but not a parallax change",
    });
  }
  if (intent.wantsKeyDirection && key.value && intent.wantsKeyDirection !== key.value) {
    conflicts.push({
      wants: `the treatment lights him from ${intent.wantsKeyDirection.replace(/_/g, " ")}`,
      footage: `the take's brighter side is ${key.value.replace(/_/g, " ")}`,
      resolvableBy:
        "grading the background to the take's side instead, or accepting the mismatch — he cannot be relit",
    });
  }
  if (intent.wantsFloorContact && feet.value === false) {
    conflicts.push({
      wants: "the treatment puts him on a visible floor",
      footage: "the take ends above his feet",
      resolvableBy:
        "staging the floor out of frame in the background, so the contact is never shown",
    });
  }

  // ── capture checklist ───────────────────────────────────────────────────────────────────────────────────────────
  if (edges.value && edges.value.length)
    capture.push(
      `He comes within a frame-edge band on the ${edges.value.join(" and ")}. Leave more room on that side; an arm that leaves frame cannot be put back.`,
    );
  if (cov.value && cov.value !== "full_body")
    capture.push(
      `The take frames him ${cov.value.replace(/_/g, " ")}. If a shot may ever want him fuller, film it fuller — a crop can take away, nothing can add.`,
    );
  if (a.audio.present.value === false)
    capture.push(
      "This take carries no sound. Record audio even when the music is added later: it is what sync is measured against.",
    );
  if (a.subject.faceCoverage.value !== null && a.subject.faceCoverage.value < 0.8)
    capture.push(
      `His face was readable in only ${pct(a.subject.faceCoverage.value)} of frames. Keep his face lit and towards the lens, or the checks downstream have nothing to measure.`,
    );

  // ── route ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const route = routeFor(a, { hardCount: hard.length, risks, conflicts });
  if (route.choice === "composite") {
    gaps.push(
      "AVT has no matte step for ordinary footage: scripts/edit/composite_environment.py composites against a plate with hand-set occluder bands, and nothing pulls a per-frame matte of him",
    );
  }
  if (route.choice === "restage") {
    gaps.push(
      "restaging is a provider call whose framing, timing and camera the storyboard measures only AFTER it comes back (storyboard/acceptance.ts); nothing here makes it more likely to land",
    );
  }

  return {
    version: COMPATIBILITY_VERSION,
    forAnalyzer: a.version,
    hard,
    preferences,
    route,
    capture,
    conflicts,
    gaps: [...new Set(gaps)],
  };
}

/**
 * One recommendation, with its reasons and the routes it turned down.
 *
 * The order of preference is deliberate and conservative: keep what was filmed; then put it over a background; then
 * let a model restage it; and only then ask for the shot to be filmed again. A reshoot is recommended only where the
 * footage itself is unusable — never because a background would be easier to make, and never where a crop or a
 * simpler setup would do.
 */
export function routeFor(
  a: FootageAnalysis,
  ctx: { hardCount: number; risks: string[]; conflicts: Conflict[] },
): Route {
  const because: string[] = [];
  const rejected: Route["rejected"] = [];
  const blurred = a.focus.blurredFrames.value ?? 0;
  const faceSeen = a.subject.faceCoverage.value ?? 0;
  const sep = a.separation.difficulty.value;
  const locked = a.camera.stability.value === "locked";
  const moved = a.camera.motionSource.value;
  const unresolvedConflicts = ctx.conflicts.filter((c) => c.resolvableBy === null);

  // unusable footage first — the only thing that earns a reshoot
  if (faceSeen < 0.25) {
    return {
      choice: "reshoot",
      confidence: 0.6,
      because: [
        `his face is readable in only ${pct(faceSeen)} of frames, so nothing downstream can measure or match him`,
      ],
      risks: [
        "a reshoot is the most expensive answer; check the take was analyzed over the right stretch before acting on it",
      ],
      rejected: [
        { choice: "composite", why: "a matte needs a subject that can be found on most frames" },
        {
          choice: "restage",
          why: "a restaging is judged against his face, and there is not enough of it here",
        },
      ],
    };
  }
  if (blurred > 0.4) {
    return {
      choice: "reshoot",
      confidence: 0.5,
      because: [`${pct(blurred)} of frames are lost to motion blur, which no later step recovers`],
      risks: [
        "if the blur is only in his hands and the shot does not turn on them, a crop or a shorter sub-clip may still be usable — look at the frames before booking a day",
      ],
      rejected: [{ choice: "composite", why: "a blurred edge tears in a matte" }],
    };
  }

  if (unresolvedConflicts.length) {
    because.push(
      `the treatment asks for something the take does not hold: ${unresolvedConflicts[0].wants}, but ${unresolvedConflicts[0].footage}`,
    );
  }

  // composite is the preferred way to change what is behind him: his performance survives it exactly
  if (locked && moved === "still" && (sep === "easy" || sep === "moderate")) {
    because.push(
      "the camera is locked and he separates from the background well enough that a plate can go behind him",
    );
    because.push(
      "his performance, timing and lip movement survive a composite exactly, which is the thing a restaging kept failing",
    );
    rejected.push({
      choice: "restage",
      why: "a generative restage re-renders his performance; this take does not need that risk",
    });
    rejected.push({ choice: "reshoot", why: "nothing in the footage is unusable" });
    return {
      choice: "composite",
      confidence: 0.6,
      because,
      risks: [...ctx.risks, "AVT cannot pull the matte this needs today — see gaps"],
      rejected,
    };
  }

  if (sep === "hard" || moved === "cannot_separate" || moved === "mixed") {
    because.push(
      sep === "hard"
        ? "he does not separate cleanly from this background, so a plate behind him would need a matte that is not reliable here"
        : "the picture moves in a way this reading cannot attribute, so a plate cannot be matched to it with confidence",
    );
    rejected.push({
      choice: "composite",
      why:
        sep === "hard"
          ? "the matte is the weak point and it is weak here"
          : "a plate has to follow the camera, and the camera's movement is not established",
    });
    rejected.push({
      choice: "reshoot",
      why: "the footage is usable; it is the background change that is hard",
    });
    return {
      choice: "keep",
      confidence: 0.45,
      because: [...because, "keeping the take as filmed costs nothing and loses nothing"],
      risks: [
        ...ctx.risks,
        "if the treatment needs a different place, this becomes a restage with the risks named above, or a reshoot",
      ],
      rejected,
    };
  }

  because.push(
    "the take is sound but the background change it needs is beyond a straight composite",
  );
  rejected.push({ choice: "reshoot", why: "nothing in the footage is unusable" });
  return {
    choice: "restage",
    confidence: 0.35,
    because,
    risks: [
      ...ctx.risks,
      "restaging re-renders his performance: timing, lip movement and framing all have to be checked afterwards, and in October they failed",
    ],
    rejected,
  };
}
