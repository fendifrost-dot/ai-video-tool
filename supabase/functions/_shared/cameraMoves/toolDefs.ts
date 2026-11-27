/** MCP tool schemas for the camera-move library. $0. No provider call. */

export const CAMERA_MOVE_TOOLS = [
  {
    name: "avt_camera_move_list",
    description:
      "List the camera-move library (names, categories, durations) ported from the MIT pill-clip set. Read only. $0. Does not render or call a model.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "avt_camera_move_get",
    description:
      "One camera move: description, camera numbers, duration, pill sha256, and whether it is a static study. Read only. $0.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "avt_camera_move_prompt",
    description:
      "Build the five-part Seedance prompt for a move. Default subject is an environment plate: no generated person. A performance plate stays background-only. A non-performance shot that includes him requires likeness face_check or put_back and a mouth at rest. $0. Does not call a model.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        place: { type: "string" },
        mode: { type: "string", enum: ["environment", "performance_plate", "non_performance"] },
        likeness: { type: "string", enum: ["face_check", "put_back"] },
      },
      required: ["id", "place"],
    },
  },
  {
    name: "avt_camera_move_match",
    description:
      "Rank library moves against a coarse motion signature (pan, tilt, zoom, shake, and the other axes). A 2D estimate cannot tell an orbit from a pan. $0. Does not read footage and does not call a model.",
    inputSchema: {
      type: "object",
      properties: {
        pan: { type: "number" },
        tilt: { type: "number" },
        dolly: { type: "number" },
        zoom: { type: "number" },
        rise: { type: "number" },
        orbit: { type: "number" },
        roll: { type: "number" },
        shake: { type: "number" },
        lateral: { type: "number" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "avt_camera_move_plan",
    description:
      "Build a fal Seedance reference-to-video body (video_urls, @Video1) for a camera move. Does not submit it. AVT holds no Fal key. Text-to-video and image-to-video are refused because they have no reference video. $0.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        place: { type: "string" },
        mode: { type: "string", enum: ["environment", "performance_plate", "non_performance"] },
        likeness: { type: "string", enum: ["face_check", "put_back"] },
        video_url: { type: "string" },
        face_image_url: { type: "string" },
        resolution: { type: "string" },
        aspect_ratio: { type: "string" },
        endpoint: { type: "string" },
      },
      required: ["id", "place"],
    },
  },
] as const;

export const CAMERA_MOVE_TOOL_NAMES = CAMERA_MOVE_TOOLS.map((tool) => tool.name);
