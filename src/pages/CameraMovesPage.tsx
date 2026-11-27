import { useMemo, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { MovePreview } from "@/components/cameraMoves/MovePreview";
import { Button } from "@/components/ui/button";
import {
  CAMERA_MOVE_ATTRIBUTION,
  CAMERA_MOVE_COUNT,
  categoryLabel,
  estimateMotion,
  getMove,
  listCategories,
  listMoves,
  matchMoves,
  planCameraMove,
  type CameraMovePlan,
  type GrayFrame,
  type MoveMatch,
  type SubjectMode,
} from "@/lib/cameraMoves";

const MODES: { id: SubjectMode; label: string }[] = [
  { id: "environment", label: "Environment plate" },
  { id: "performance_plate", label: "Performance background" },
  { id: "non_performance", label: "Non-performance (him, mouth at rest)" },
];

async function framesFromVideo(file: File): Promise<GrayFrame[]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Could not read that video."));
    });
    const width = 64;
    const height = 36;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not sample frames.");
    const frames: GrayFrame[] = [];
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      video.currentTime = (video.duration || 1) * ((i + 0.5) / steps);
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });
      ctx.drawImage(video, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      const data = new Uint8Array(width * height);
      for (let p = 0; p < data.length; p++) data[p] = pixels[p * 4];
      frames.push({ width, height, data });
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function CameraMovesPage({ projectId }: { projectId: string }) {
  const categories = useMemo(() => listCategories(), []);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("CAM06-Orbit");
  const [place, setPlace] = useState("a night street, wet asphalt, sodium light, haze");
  const [mode, setMode] = useState<SubjectMode>("environment");
  const [likeness, setLikeness] = useState<"face_check" | "put_back">("face_check");
  const [videoUrl, setVideoUrl] = useState("");
  const [faceUrl, setFaceUrl] = useState("");
  const [plan, setPlan] = useState<CameraMovePlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [matches, setMatches] = useState<MoveMatch[] | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);

  const moves = useMemo(
    () => listMoves({ category: category || undefined, query }),
    [category, query],
  );
  const selected = getMove(selectedId) ?? moves[0] ?? null;

  function prepare() {
    if (!selected) return;
    const next = planCameraMove({
      move: selected,
      place,
      mode,
      likeness: mode === "non_performance" ? likeness : null,
      videoUrl: videoUrl.trim() || undefined,
      faceImageUrl: mode === "non_performance" ? faceUrl.trim() || undefined : undefined,
    });
    if ("ok" in next && next.ok === false) {
      setPlan(null);
      setPlanError(next.error);
      return;
    }
    setPlanError(null);
    setPlan(next as CameraMovePlan);
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8" data-testid="camera-moves-page">
      <PageHeader
        title="Camera moves"
        subtitle={`${CAMERA_MOVE_COUNT} moves. The default plate is the environment only. Preparing a request spends $0.`}
        variant="compact"
        context={projectId.slice(0, 8)}
      />

      <section className="rounded-xl border border-border bg-card/80 p-4 text-sm text-foreground/80">
        <p>
          Names, numbers, and poster stills are from {CAMERA_MOVE_ATTRIBUTION.author}&apos;s MIT
          library ({CAMERA_MOVE_ATTRIBUTION.copyright}). The pill clip is a camera reference, not a
          picture of him. On a performance, generate the background and composite his original face
          and mouth. This page does not call fal.
        </p>
        <p className="mt-2">
          Store each pill at{" "}
          <code className="text-foreground">
            project-references/…/camera-moves/&lt;id&gt;/pill.mp4
          </code>{" "}
          with{" "}
          <code className="text-foreground">
            node --experimental-strip-types scripts/camera-moves/render-references.ts --from
            &lt;clone&gt;/templates
          </code>
          .
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="orbit, crane, whip"
            className="rounded-md border border-border bg-background px-3 py-2"
            data-testid="camera-move-search"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2"
            data-testid="camera-move-category"
          >
            <option value="">All</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} ({item.count})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ul
          className="grid max-h-[40rem] grid-cols-2 gap-2 overflow-auto content-start sm:grid-cols-3"
          data-testid="camera-move-list"
        >
          {moves.map((move) => (
            <li key={move.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(move.id);
                  setPlan(null);
                }}
                className={`w-full overflow-hidden rounded-lg border text-left ${selected?.id === move.id ? "border-primary" : "border-border"}`}
                aria-pressed={selected?.id === move.id}
              >
                <img src={move.poster} alt="" className="aspect-video w-full object-cover" />
                <span className="block px-2 py-1 text-xs">
                  <span className="font-medium">{move.name}</span>
                  <span className="mt-0.5 block text-foreground/60">
                    {categoryLabel(move.category)} · {move.durationSec}s
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {selected && (
          <section className="flex flex-col gap-3" data-testid="camera-move-detail">
            <div>
              <h2 className="font-display text-lg font-semibold">{selected.name}</h2>
              <p className="text-sm text-foreground/70">
                {selected.id} · {categoryLabel(selected.category)} · {selected.durationSec}s
                {selected.studyOnly ? " · study, not a move to send" : ""}
              </p>
            </div>
            <MovePreview
              kind={selected.kind}
              hint={`${selected.name} ${selected.numbers} ${selected.says}`}
            />
            <p className="text-sm">{selected.says}</p>
            <p className="text-sm text-foreground/80">{selected.use}</p>
            <p className="text-sm text-foreground/70">{selected.numbers}</p>
            <p className="text-sm text-foreground/60">Avoid: {selected.avoid}</p>

            <label className="flex flex-col gap-1 text-sm">
              Place
              <textarea
                value={place}
                onChange={(event) => setPlace(event.target.value)}
                rows={3}
                className="rounded-md border border-border bg-background px-3 py-2"
                data-testid="camera-move-place"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              What gets generated
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as SubjectMode)}
                className="rounded-md border border-border bg-background px-3 py-2"
                data-testid="camera-move-mode"
              >
                {MODES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            {mode === "non_performance" && (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  Likeness
                  <select
                    value={likeness}
                    onChange={(event) =>
                      setLikeness(event.target.value as "face_check" | "put_back")
                    }
                    className="rounded-md border border-border bg-background px-3 py-2"
                  >
                    <option value="face_check">Face check against his photographs</option>
                    <option value="put_back">Put his original face pixels back</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Face photo URL (https)
                  <input
                    value={faceUrl}
                    onChange={(event) => setFaceUrl(event.target.value)}
                    className="rounded-md border border-border bg-background px-3 py-2"
                  />
                </label>
              </>
            )}
            <label className="flex flex-col gap-1 text-sm">
              Signed pill URL (https). Leave empty to prepare the prompt without a clip.
              <input
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                placeholder="https://…"
                className="rounded-md border border-border bg-background px-3 py-2"
                data-testid="camera-move-video-url"
              />
            </label>
            <Button type="button" onClick={prepare} data-testid="camera-move-prepare">
              Prepare Seedance request
            </Button>
            {planError && <p className="text-sm text-destructive">{planError}</p>}
            {plan && (
              <div className="flex flex-col gap-2 text-sm" data-testid="camera-move-plan">
                <p>{plan.report}</p>
                <p>
                  Submitted: {String(plan.submitted)}. Spend: ${plan.spendUsd}. Ready:{" "}
                  {String(plan.ready)}.
                </p>
                {plan.blocked.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                  {plan.prompt}
                </pre>
              </div>
            )}
          </section>
        )}
      </div>

      <section
        className="flex flex-col gap-3 rounded-xl border border-border p-4"
        data-testid="camera-move-match"
      >
        <h2 className="font-medium">Match a real camera</h2>
        <p className="text-sm text-foreground/70">
          Sample a performance clip and rank library moves by image motion. An orbit and a pan can
          score alike. Use the winner as the background plate so the generated room moves with his
          real camera.
        </p>
        <input
          type="file"
          accept="video/*"
          data-testid="camera-move-footage"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setMatchError(null);
            try {
              const frames = await framesFromVideo(file);
              setMatches(matchMoves(estimateMotion(frames), 5));
            } catch (err) {
              setMatches(null);
              setMatchError(err instanceof Error ? err.message : "Could not read that clip.");
            }
          }}
        />
        {matchError && <p className="text-sm text-destructive">{matchError}</p>}
        {matches && (
          <ol className="list-decimal pl-5 text-sm">
            {matches.map((match) => (
              <li key={match.id}>
                <button type="button" className="underline" onClick={() => setSelectedId(match.id)}>
                  {match.name}
                </button>{" "}
                ({match.kind}, {match.score.toFixed(2)})
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
