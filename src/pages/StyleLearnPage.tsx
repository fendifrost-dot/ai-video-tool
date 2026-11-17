import { useMemo, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  STYLE_APPROXIMATED,
  STYLE_MATCHED,
  composeStyle,
  parseStyleProfile,
  planStyleEdit,
  searchEffects,
  type StyleEffect,
  type StyleProfile,
  type StyleSubject,
} from "@/lib/style";

type ClipRow = { id: string; duration: string; subject: StyleSubject };

const SUBJECTS: StyleSubject[] = ["fendi_performance", "ai_broll", "no_fendi"];

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Style Learn. Paste the JSON from scripts/style/extract_style.py, then plan a cut.
 * Nothing on this page calls a provider or writes the database. The draft render is the local script.
 */
export default function StyleLearnPage({ projectId }: { projectId: string }) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [clips, setClips] = useState<ClipRow[]>([
    { id: "take", duration: "4", subject: "fendi_performance" },
    { id: "plate", duration: "4", subject: "no_fendi" },
  ]);
  const [beats, setBeats] = useState("0, 0.5, 1, 1.5, 2, 2.5, 3");
  const [query, setQuery] = useState("");
  const [extra, setExtra] = useState<StyleEffect[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  const effects = [...(profile?.effects ?? []), ...extra];
  const shown = searchEffects(effects, query);
  const rhythm = useMemo(() => {
    if (!profile) return null;
    const chosen = effects.filter((effect) => picked.includes(effect.id));
    return chosen.length ? composeStyle(profile, chosen) : profile;
  }, [profile, extra, picked]);

  const plan = useMemo(() => {
    if (!rhythm) return null;
    const times = beats
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map(Number);
    if (times.some((time) => !Number.isFinite(time)))
      return { ok: false as const, error: "Beats must be seconds." };
    return planStyleEdit({
      profile: rhythm,
      projectId,
      beats: times,
      clips: clips.map((clip) => ({
        id: clip.id || "clip",
        duration: Number(clip.duration),
        subject: clip.subject,
      })),
    });
  }, [rhythm, beats, clips, projectId]);

  function load(text: string) {
    setRaw(text);
    const parsed = parseStyleProfile(JSON.parse(text) as unknown);
    if (!parsed.ok) {
      setProfile(null);
      setError(parsed.error);
      return;
    }
    setProfile(parsed.value);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8" data-testid="style-learn-page">
      <PageHeader
        title="Style Learn"
        subtitle="Learn a reference cut, then draft the same rhythm on your footage. Local, $0, not a finished picture."
        variant="compact"
      />

      <section className="rounded-xl border border-border bg-card/80 p-4 text-sm text-foreground/80">
        <p>
          Run{" "}
          <code className="text-foreground">
            python3 scripts/style/extract_style.py reference.mp4 --out style.json
          </code>{" "}
          on the machine, then load that file here. Saving it onto the project is{" "}
          <code className="text-foreground">avt_style_profile_save</code>. The draft file is{" "}
          <code className="text-foreground">npx tsx scripts/style/apply_style.ts</code>.
        </p>
        <p className="mt-2">
          A performance take stays at full speed. RGB split, glitch, and heavy shake are left off
          his face. Check the shot rules before posting him.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <label className="text-sm font-medium" htmlFor="style-file">
          Style profile JSON
        </label>
        <input
          id="style-file"
          data-testid="style-file"
          type="file"
          accept="application/json,.json"
          className="text-sm"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              load(await file.text());
            } catch (err) {
              setError(err instanceof Error ? err.message : "That file is not JSON.");
            }
          }}
        />
        <textarea
          data-testid="style-json"
          value={raw}
          onChange={(event) => {
            setRaw(event.target.value);
            if (!event.target.value.trim()) {
              setProfile(null);
              setError(null);
            }
          }}
          onBlur={() => {
            if (!raw.trim()) return;
            try {
              load(raw);
            } catch (err) {
              setError(err instanceof Error ? err.message : "That text is not JSON.");
            }
          }}
          rows={6}
          placeholder='{"format":"avt.style_profile", ...}'
          className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
        />
        {error && (
          <p className="text-sm text-amber-200" data-testid="style-error">
            {error}
          </p>
        )}
      </section>

      {profile && (
        <>
          <section className="rounded-xl border border-border p-4" data-testid="style-summary">
            <h2 className="font-medium">Summary</h2>
            <p className="mt-2 text-sm text-foreground/80">{profile.summary}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-xs uppercase tracking-wide text-foreground/50">Matched</h3>
                <ul className="mt-2 list-disc pl-4 text-sm">
                  {STYLE_MATCHED.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-wide text-foreground/50">Approximated</h3>
                <ul className="mt-2 list-disc pl-4 text-sm">
                  {STYLE_APPROXIMATED.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3" data-testid="style-effects">
            <h2 className="font-medium">Effects</h2>
            <p className="text-sm text-foreground/70">
              {profile.resolution.counts.code} rebuilt in code,{" "}
              {profile.resolution.counts.local_model} need a free local model,{" "}
              {profile.resolution.counts.generative} would invent something new and map to an AVT
              tool that already exists. Nothing here calls that tool.
            </p>
            <input
              data-testid="style-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="the screen flashes white, or the thing at 0:42"
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
            <input
              type="file"
              accept="application/json,.json"
              className="text-sm"
              aria-label="Effects from another style"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  const parsed = parseStyleProfile(JSON.parse(await file.text()) as unknown);
                  if (!parsed.ok) {
                    setError(parsed.error);
                    return;
                  }
                  setExtra(
                    parsed.value.effects.map((effect) => ({ ...effect, id: `b-${effect.id}` })),
                  );
                  setError(null);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "That file is not JSON.");
                }
              }}
            />
            {shown.map((effect) => (
              <label
                key={effect.id}
                className="flex gap-3 rounded-lg border border-border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={picked.includes(effect.id)}
                  onChange={(event) =>
                    setPicked(
                      event.target.checked
                        ? [...picked, effect.id]
                        : picked.filter((id) => id !== effect.id),
                    )
                  }
                />
                {effect.preview.thumbnail_jpeg_base64 ? (
                  <img
                    alt=""
                    className="h-12 w-16 rounded object-cover"
                    src={`data:image/jpeg;base64,${effect.preview.thumbnail_jpeg_base64}`}
                  />
                ) : null}
                <span>
                  <span className="font-medium">{effect.plain}</span>
                  <span className="mt-1 block text-foreground/60">
                    {effect.names.join(", ")} · {effect.start.toFixed(2)}s–{effect.end.toFixed(2)}s
                    · {effect.recipe.tier}
                    {effect.recipe.avt_function ? ` · ${effect.recipe.avt_function}` : ""}
                  </span>
                </span>
              </label>
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-medium">Clips and beats</h2>
            {clips.map((clip, index) => (
              <div key={index} className="flex flex-wrap gap-2">
                <input
                  aria-label={`Clip ${index + 1} id`}
                  value={clip.id}
                  onChange={(event) =>
                    setClips(
                      clips.map((row, i) =>
                        i === index ? { ...row, id: event.target.value } : row,
                      ),
                    )
                  }
                  className="w-32 rounded-md border border-input bg-background px-2 py-1 text-sm"
                />
                <input
                  aria-label={`Clip ${index + 1} duration`}
                  value={clip.duration}
                  onChange={(event) =>
                    setClips(
                      clips.map((row, i) =>
                        i === index ? { ...row, duration: event.target.value } : row,
                      ),
                    )
                  }
                  className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm"
                />
                <select
                  aria-label={`Clip ${index + 1} subject`}
                  value={clip.subject}
                  onChange={(event) =>
                    setClips(
                      clips.map((row, i) =>
                        i === index ? { ...row, subject: event.target.value as StyleSubject } : row,
                      ),
                    )
                  }
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {SUBJECTS.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <label className="text-sm" htmlFor="style-beats">
              Beat times in seconds
            </label>
            <input
              id="style-beats"
              data-testid="style-beats"
              value={beats}
              onChange={(event) => setBeats(event.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
          </section>

          {plan && !plan.ok && (
            <p className="text-sm text-amber-200" data-testid="style-plan-error">
              {plan.error}
            </p>
          )}
          {plan && plan.ok && (
            <section className="flex flex-col gap-3" data-testid="style-plan">
              <h2 className="font-medium">Edit decision list</h2>
              <p className="text-sm text-foreground/70">
                {plan.value.edl.clips.length} cuts, {plan.value.edl.width}×{plan.value.edl.height}.
                Cost $0. This page does not render.
                {plan.value.withheld.length
                  ? ` Withheld on performance takes: ${plan.value.withheld.join(", ")}.`
                  : ""}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-foreground/50">
                    <tr>
                      <th className="py-1 pr-3">Clip</th>
                      <th className="py-1 pr-3">Timeline</th>
                      <th className="py-1 pr-3">Speed</th>
                      <th className="py-1 pr-3">Transition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.value.edl.clips.map((clip) => (
                      <tr key={clip.id} className="border-t border-border/70">
                        <td className="py-1 pr-3">{clip.name}</td>
                        <td className="py-1 pr-3">
                          {clip.timelineIn.toFixed(2)}–{clip.timelineOut.toFixed(2)}
                        </td>
                        <td className="py-1 pr-3">{clip.speed}</td>
                        <td className="py-1 pr-3">{clip.transition}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    download(
                      "edl.json",
                      JSON.stringify(plan.value.edl, null, 2),
                      "application/json",
                    )
                  }
                >
                  Download EDL
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => download("grade.cube", plan.value.lut, "text/plain")}
                >
                  Download LUT
                </Button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
