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
      "Build the exact avt_call arguments for a 480p ALTER draft on the route Fendi passed (proxy-provider-call -> video-providers-higgsfield-model, seedance-2.5-edit). Nothing is sent and nothing is spent here: sending `draft` with avt_call is the paid step. Returns the poll call and the local steps for the file that comes back (it arrives about 7% fast and must be conformed before scoring). `draft` is null until the request is ready (read `blocked`). Pass draft_check (report.json from scripts/alter/run_draft.py for the conformed draft) to get the full-resolution call: the report is judged again from its numbers, must be for this preset's check mode, and with no identity number also needs face_approval, Fendi's own words about that draft's face (not verifiable by this server). This is a checklist, not a spend control: the paid step is avt_call.",
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
      "Judge a CONFORMED draft from the report scripts/alter/run_draft.py wrote (report.json: frame measurements, the mouth score, the identity distance). Only the report's numbers are read; the verdict, flags and issues are rebuilt here with the gates in gates.ts. Does not read video and does not call a model. $0. `redrawCleared` means every gate passed, identity included (the mouth is judged only on a performance; the face on every clip). `faceNeedsHisEye` means everything measured passed and only the face has no number: Fendi judges the face sheet. Anything else is not cleared.",
    inputSchema: {
      type: "object",
      properties: {
        report: {
          type: "object",
          description: "The contents of report.json, unchanged.",
        },
      },
      required: ["report"],
    },
  },
] as const;

export const ALTER_TOOL_NAMES = ALTER_TOOLS.map((tool) => tool.name);
