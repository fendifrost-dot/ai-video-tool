export const ALTER_TOOLS = [
  {
    name: "avt_alter_presets",
    description:
      "List the 36 ALTER presets (swap, motion transfer, restyle). Read only. $0. Does not call a model.",
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
      "Build an unsent fal Seedance 480p draft for an ALTER preset. generate_audio is false. Original audio is muxed back by an ffmpeg argv that is not run. $0.",
    inputSchema: {
      type: "object",
      properties: {
        preset: { type: "string" },
        who: { type: "string" },
        slots: { type: "object" },
        style: { type: "string" },
        performance: { type: "boolean" },
        put_face_back: { type: "boolean" },
        video_url: { type: "string" },
        target_frame_url: { type: "string" },
        source_seconds: { type: "number" },
      },
      required: ["preset", "who"],
    },
  },
  {
    name: "avt_alter_check",
    description:
      "Score a draft the caller already measured: changed area, structure, motion, plus optional mouth openness series and an identity distance. Does not read video and does not call a model. $0. A rapping shot without a mouth series does not pass.",
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
