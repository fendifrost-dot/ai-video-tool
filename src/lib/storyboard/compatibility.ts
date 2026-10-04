/**
 * What a background has to be, for THIS take to sit in it — and what to do with the shot.
 *
 * footage.ts reads the take. This turns that reading into something a background instruction can be held against,
 * and into one recommendation with its reasons. It is advisory: nothing here regenerates a clip, replaces an asset,
 * edits a treatment or touches a timeline.
 *
 * ── AUTHORITY IS NOT EVIDENCE ────────────────────────────────────────────────────────────────────────────────────
 * An earlier version of this module said: a constraint is hard only where the finding behind it was MEASURED. That
 * was wrong, and wrong in a way that quietly lost requirements. It collapsed two different questions into one:
 *
 *   AUTHORITY      who says this must hold — and therefore what happens when it does not
 *   VERIFICATION   whether AVT can check that it held, and how well
 *
 * They are independent. A line in the approved treatment is MANDATORY whether or not anything here can measure it;
 * if AVT cannot measure it, what changes is that its verification reads `unverifiable` — the obligation does not
 * soften. Under the old rule "the lighting must come from frame left, because the treatment says so" would have been
 * demoted to a preference the moment it turned out that light direction is only ever estimated here. A tool that
 * downgrades the director's requirements to match its own instruments is not being careful; it is losing the brief.
 *
 * So:
 *   authority "approved"   the user or the approved treatment asked for it. Mandatory until explicitly revised.
 *                          Nothing in this file may weaken, reinterpret or drop one.
 *   authority "source"     a technical constraint read off the take, binding WITHIN THE SCOPE IT WAS MEASURED IN —
 *                          the raster, the frame rate, the colour transfer, where he actually is.
 *   authority "advisory"   read off the take but inferred. Guidance, carried with its confidence.
 *
 *   verification "measured"      checkable, and checked
 *   verification "estimated"     checkable only approximately; the confidence says how approximately
 *   verification "unverifiable"  AVT cannot check this at all. Named, with what it would take.
 *
 * Where an approved requirement and a source measurement disagree, that is a CONFLICT and both sides are reported as
 * they are. Neither is silently weakened to make the other fit.
 */
import type { FootageAnalysis, Finding } from "./footage";

export const COMPATIBILITY_VERSION = 2 as const;

export type ConstraintKind =
  "composition" | "camera" | "light" | "colour" | "focus" | "floor" | "reframe" | "separation";

/** Who says this must hold — and so what it means when it does not. */
export type Authority = "approved" | "source" | "advisory";

/** Whether AVT can check that it held. Independent of authority: a mandatory thing may be uncheckable. */
export type Verification = "measured" | "estimated" | "unverifiable";

export type Requirement = {
  authority: Authority;
  verification: Verification;
  kind: ConstraintKind;
  /** Written for whoever is asking for the background — a sentence, not a field. */
  text: string;
  /** Where the obligation comes from: a line of the treatment, or the finding it was read off. */
  from: string;
  /** The confidence of the finding behind it, when the verification is an estimate. */
  confidence: number | null;
  /** What AVT would need in order to check this, when it cannot. Present only on `unverifiable`. */
  needsToVerify?: string;
};

/** Mandatory: a miss is a reject, not a note. True for the treatment's own asks and for the take's hard facts. */
export function isMandatory(r: Requirement): boolean {
  return r.authority === "approved" || r.authority === "source";
}

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
  /** Everything the background has to satisfy or should, each carrying its authority and its verification. */
  requirements: Requirement[];
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

/**
 * A requirement read off the take. Its AUTHORITY follows from how well the footage establishes it — a measured fact
 * binds, an inference advises — and its VERIFICATION records which of those it was. This is the only place the two
 * are allowed to move together, because here they genuinely have the same cause.
 */
function fromFinding(
  f: Finding<unknown>,
  c: Omit<Requirement, "authority" | "verification" | "confidence">,
): Requirement | null {
  if (f.status === "measured")
    return { ...c, authority: "source", verification: "measured", confidence: null };
  if (f.status === "estimated")
    return { ...c, authority: "advisory", verification: "estimated", confidence: f.confidence };
  return null;
}

/**
 * A requirement the user or the approved treatment stated. MANDATORY, whatever AVT can see. `verification` says only
 * whether anything here can check it; `needsToVerify` says what it would take when it cannot.
 */
function fromTreatment(c: Omit<Requirement, "authority" | "confidence">): Requirement {
  return { ...c, authority: "approved", confidence: null };
}

const pct = (n: number) => `${Math.round(n * 100)} %`;

export function compatibilityOf(a: FootageAnalysis, intent: TreatmentIntent = {}): Compatibility {
  const requirements: Requirement[] = [];
  const add = (r: Requirement | null) => {
    if (r) requirements.push(r);
  };
  const capture: string[] = [];
  const conflicts: Conflict[] = [];
  const gaps: string[] = [];
  const risks: string[] = [];

  // ── composition ─────────────────────────────────────────────────────────────────────────────────────────────────
  const pos = a.subject.position;
  if (pos.value) {
    add(
      fromFinding(pos, {
        kind: "composition",
        text: `Leave the performer's place clear: his eye-line sits at ${pct(pos.value.x)} across and ${pct(pos.value.y)} down the frame. Put nothing of interest there, and nothing that has to be read behind his head and shoulders.`,
        from: "subject.position",
      }),
    );
  }
  const travel = a.subject.travel;
  if (travel.value) {
    const room = Math.max(travel.value.x, travel.value.y);
    add(
      fromFinding(travel, {
        kind: "composition",
        text:
          room < 0.02
            ? "He holds his place: the background can carry detail close around him without his crossing it."
            : `He moves across ${pct(travel.value.x)} of the frame and ${pct(travel.value.y)} down it. Keep that band clear of anything the eye has to follow.`,
        from: "subject.travel",
      }),
    );
  }
  const cov = a.subject.coverage;
  if (cov.value) {
    requirements.push({
      authority: "advisory",
      verification: "estimated",
      confidence: null,
      kind: "composition",
      text: `The take frames him ${cov.value.replace(/_/g, " ")}. A background built for a fuller figure will not match: there is no footage of the rest of him.`,
      from: "subject.coverage",
    });
  }
  const edges = a.subject.faceNearEdge;
  if (edges.value && edges.value.length) {
    requirements.push({
      authority: "source",
      verification: "measured",
      confidence: null,
      kind: "composition",
      text: `He passes close to the ${edges.value.join(" and ")} edge. A background whose subject matter runs to that edge will collide with him.`,
      from: "subject.faceNearEdge",
    });
  }

  // ── camera ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const stability = a.camera.stability;
  const source = a.camera.motionSource;
  if (stability.value === "locked" && source.value === "still") {
    requirements.push({
      authority: "source",
      verification: "measured",
      confidence: null,
      kind: "camera",
      text: "The camera does not move. The background must be locked off too — any drift in it will read as the room sliding behind a man who is standing still.",
      from: "camera.stability + camera.motionSource",
    });
  } else if (stability.value && stability.value !== "locked") {
    requirements.push({
      authority: "advisory",
      verification: "estimated",
      confidence: null,
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
    add(
      fromFinding(key, {
        kind: "light",
        text:
          key.value === "even"
            ? "The light is even across the frame. A background with a strong, directional key will not sit with him."
            : `The brighter side of the picture is ${key.value.replace(/_/g, " ")}. Light the background from the same side; a background keyed from the opposite side is the single most visible mismatch in a composite.`,
        from: "light.keyDirection",
      }),
    );
  }
  const soft = a.light.softness;
  if (soft.value) {
    add(
      fromFinding(soft, {
        kind: "light",
        text: `His light reads ${soft.value}. Match that: ${soft.value === "soft" ? "no hard-edged shadows in the background" : "a background lit flatter than he is will look pasted behind him"}.`,
        from: "light.softness",
      }),
    );
  }
  const exposure = a.light.exposure;
  if (exposure.value) {
    add(
      fromFinding(exposure, {
        kind: "light",
        text: `Mean brightness is ${exposure.value.mean.toFixed(2)} of full scale. Build the background to that, not brighter: he cannot be relit.`,
        from: "light.exposure",
      }),
    );
  }
  const clip = a.light.clipping;
  if (clip.value && (clip.value.white > 0.02 || clip.value.black > 0.05)) {
    requirements.push({
      authority: "source",
      verification: "measured",
      confidence: null,
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
    add(
      fromFinding(cast, {
        kind: "colour",
        text:
          cast.value.strength > 0.08
            ? `The take carries a colour cast (r ${cast.value.r.toFixed(2)} g ${cast.value.g.toFixed(2)} b ${cast.value.b.toFixed(2)}). Grade the background to it rather than correcting him.`
            : "The take is close to neutral; a strongly tinted background will have to be graded back towards it.",
        from: "light.colourCast",
      }),
    );
  }
  const transfer = a.file.transfer;
  if (transfer.value) {
    requirements.push({
      authority: "source",
      verification: "measured",
      confidence: null,
      kind: "colour",
      text: `The file is tagged ${transfer.value}. A background generated in ordinary sRGB will not match it until one of the two is converted, and converting him is what loses his skin.`,
      from: "file.transfer",
    });
    gaps.push(
      `nothing in the APP converts ${transfer.value} footage to the space a generated plate is produced in, or back; the harness does it with one explicit zscale/tonemap pass and tags the result bt709`,
    );
  }

  // ── focus ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const dof = a.focus.depthOfField;
  const svb = a.focus.subjectVsBackground;
  if (dof.value && svb.value !== null) {
    requirements.push({
      authority: "advisory",
      verification: "estimated",
      confidence: null,
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
    requirements.push({
      authority: "source",
      verification: "measured",
      confidence: null,
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
    requirements.push({
      authority: "source",
      verification: "measured",
      confidence: null,
      kind: "focus",
      text: `The background must be delivered at ${res.value.width} × ${res.value.height} or larger. Anything smaller has to be scaled up into him.`,
      from: "file.resolution",
    });
  }

  // ── separation ──────────────────────────────────────────────────────────────────────────────────────────────────
  const sep = a.separation.difficulty;
  if (sep.value) {
    requirements.push({
      authority: "advisory",
      verification: "estimated",
      confidence: null,
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
    requirements.push({
      authority: "advisory",
      verification: "estimated",
      confidence: null,
      kind: "floor",
      text: "His feet are likely in frame, so the background needs a floor at the right height and a contact shadow under him, or he will float.",
      from: "floor.contactNeeded",
    });
    gaps.push(
      "AVT has no contact-shadow step: a composite that shows his feet has nothing to ground them with",
    );
  } else if (contact.value === false) {
    requirements.push({
      authority: "advisory",
      verification: "estimated",
      confidence: null,
      kind: "floor",
      text: "The frame ends above his feet, so no floor contact and no contact shadow has to be matched — one fewer thing for the background to get wrong.",
      from: "floor.contactNeeded",
    });
  }
  if (feet.value === false) {
    requirements.push({
      authority: "source",
      verification: "measured",
      confidence: null,
      kind: "reframe",
      text: "Do not reframe wider or lower than the take. There is no footage of his legs or feet; a background that reveals them will reveal nothing.",
      from: "floor.feetVisible + subject.coverage",
    });
  }

  // ── what the treatment asked for ────────────────────────────────────────────────────────────────────────────────
  // These are MANDATORY. They are carried whether or not anything here can check them; where it cannot, the
  // requirement still stands and its verification says so. The conflict pass below reports where one of them and the
  // footage disagree — it never drops one to make the take fit.
  if (intent.wantsCoverage) {
    requirements.push(
      fromTreatment({
        kind: "composition",
        text: `The treatment frames him ${intent.wantsCoverage.replace(/_/g, " ")}. The background must be built for that framing.`,
        from: "treatment.wantsCoverage",
        verification: cov.value ? "estimated" : "unverifiable",
        ...(cov.value
          ? {}
          : {
              needsToVerify:
                "his face was not readable, so there is no reach to read a framing off",
            }),
      }),
    );
  }
  if (intent.wantsCameraMove) {
    requirements.push(
      fromTreatment({
        kind: "camera",
        text: `The treatment asks for a ${intent.wantsCameraMove}. The background has to carry that move.`,
        from: "treatment.wantsCameraMove",
        verification: "estimated",
        needsToVerify:
          "camera movement here is read from whole-cell frame matching, which sees that the picture moved but not the path it took; whether a delivered move is the one asked for is not checked",
      }),
    );
  }
  if (intent.wantsKeyDirection) {
    requirements.push(
      fromTreatment({
        kind: "light",
        text: `The treatment lights him from ${intent.wantsKeyDirection.replace(/_/g, " ")}. Light the background to agree with it.`,
        from: "treatment.wantsKeyDirection",
        verification: "estimated",
        needsToVerify:
          "key direction is inferred from where the picture is brighter, not from where a lamp stands",
      }),
    );
  }
  if (intent.wantsFloorContact) {
    requirements.push(
      fromTreatment({
        kind: "floor",
        text: "The treatment puts him on a visible floor: the background needs a floor at the right height and a contact shadow under him.",
        from: "treatment.wantsFloorContact",
        verification: "unverifiable",
        needsToVerify:
          "nothing here sees a foot or a floor; feet are inferred from where his eyes are and where the frame ends",
      }),
    );
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
  const route = routeFor(a, {
    hardCount: requirements.filter(isMandatory).length,
    risks,
    conflicts,
  });
  if (route.choice === "composite") {
    // CORRECTED 4 October. This previously read "AVT has no matte step for ordinary footage", which was wrong:
    // scripts/edit/composite_environment.py pulls a per-frame matte with RobustVideoMatting and has done for
    // months. The real gap is narrower and was measured by running it on S06 — see
    // docs/research/results/2026-10-04-composite/.
    gaps.push(
      "matting exists but only as a local script: scripts/edit/composite_environment.py (RobustVideoMatting) runs on a build box, and nothing in the app, an edge function or a job queue can call it",
    );
    gaps.push(
      "measured on S06, 2.5 s: a detached piece of the room travelled with him on 12 of 75 frames (worst 36k px), and motion-blurred limb edges keep a light fringe from the old background — a matte is not a solved step here, it is a step with known failure modes",
    );
    gaps.push(
      "AVT has no colour-transfer step of its own: the HLG → BT.709 conversion these takes need was done by the harness (scripts/qa/composite_take.py), not by anything the app runs",
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
    requirements,
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
