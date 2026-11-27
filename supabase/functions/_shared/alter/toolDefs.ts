export const ALTER_TOOLS = [
  {
    name: "avt_alter_presets",
    description:
      "List the ALTER presets: the 36 of the scenario-alter set (swap, motion transfer, restyle) and AVT's own `action` (something happens in his take while he keeps rapping). Read only. $0. Does not call a model.",
    inputSchema: { type: "object", properties: { mode: { type: "string" } } },
  },
  {
    name: "avt_alter_prompt",
    description:
      "Build an ALTER prompt for one preset. A performance keeps the mouth rule on. $0. Does not call a model.",
    inputSchema: {
      type: "object",
      properties: {
        preset: { type: "string" },
        who: { type: "string" },
        slots: { type: "object" },
        style: { type: "string" },
        performance: { type: "boolean" },
      },
      required: ["preset", "who"],
    },
  },
  {
    name: "avt_alter_plan",
    description:
      "Build the exact avt_call arguments for a 480p ALTER draft on the route Fendi passed (proxy-provider-call -> video-providers-higgsfield-model, seedance-2.5-edit). Nothing is sent and nothing is spent here: sending `draft` with avt_call is the paid step. Returns the poll call and the local steps for the file that comes back (it arrives about 7% fast and must be conformed before scoring). Pass draft_check (the report scripts/alter/run_draft.py wrote for the conformed draft) to get the full-resolution call for a draft that passed; with no identity number that also needs face_approval, Fendi's own words about that draft's face.",
    inputSchema: {
      type: "object",
      properties: {
        preset: { type: "string" },
        who: { type: "string" },
        slots: { type: "object" },
        style: { type: "string" },
        performance: { type: "boolean" },
        video_url: {
          type: "string",
          description:
            "A signed https link to the stretch of the take: at least 4 s, cut waist-up from the 4K original so his face is large.",
        },
        target_frame_url: { type: "string" },
        face_image_urls: {
          type: "array",
          items: { type: "string" },
          description: "Signed https links to two to four of his face photographs from the tool.",
        },
        project_id: { type: "string" },
        draft_check: { type: "object" },
        face_approval: { type: "string" },
        resolution: { type: "string", description: "720p or 1080p, for the full-resolution call." },
      },
      required: ["preset", "who"],
    },
  },
  {
    name: "avt_alter_check",
    description:
      "Judge a CONFORMED draft the caller already measured (scripts/alter/run_draft.py writes every number): changed area, structure, motion, the mouth score and an identity distance. Mode `action` is for a shot that adds movement (the motion gate is reported, not judged). Does not read video and does not call a model. $0. A rapping shot without a mouth score does not pass; without an identity number the face is Fendi's to judge.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string" },
        performance: { type: "boolean" },
        changed_area: { type: "number" },
        structure_median: { type: "number" },
        motion_correlation: { type: "number" },
        frame_delta: { type: "number" },
        mouth_source: { type: "array", items: { type: "number" } },
        mouth_output: { type: "array", items: { type: "number" } },
        identity_distance: { type: "number" },
        track_score: {
          type: "object",
          description:
            "The JSON that scripts/alter/track_mouth.py score writes for the take and the redraw (timing, mouth_shape_distance, coverage, lag_frames, pose_ok_for_putback, identity_distance). Judged with the same gates as a mouth series.",
        },
      },
      required: ["mode", "changed_area", "structure_median", "motion_correlation"],
    },
  },
] as const;

export const ALTER_TOOL_NAMES = ALTER_TOOLS.map((tool) => tool.name);
