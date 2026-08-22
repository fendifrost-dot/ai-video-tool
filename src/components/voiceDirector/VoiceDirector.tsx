import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  runDirectorTurn,
  speakDirectorReply,
  transcribeDirectorAudio,
  type DirectorToolTrace,
} from "@/lib/voiceDirector/api";

type Phase = "idle" | "recording" | "working" | "speaking" | "error";

export function VoiceDirector({ projectId }: { projectId: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [trace, setTrace] = useState<DirectorToolTrace | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      audioRef.current?.pause();
    };
  }, []);

  async function startRecording() {
    setError(null);
    setTranscript("");
    setReply("");
    setTrace(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorderRef.current = recorder;
      recorder.start();
      setPhase("recording");
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Microphone blocked");
    }
  }

  async function finishRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.stop();
    });
    recorderRef.current = null;

    if (blob.size < 800) {
      setPhase("idle");
      setError("Hold a bit longer — I did not catch any speech.");
      return;
    }

    setPhase("working");
    try {
      const heard = await transcribeDirectorAudio(blob);
      setTranscript(heard);
      const turn = await runDirectorTurn(projectId, heard);
      setReply(turn.replyText);
      setTrace(turn.toolTrace);
      const speech = await speakDirectorReply(turn.replyText);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(speech);
      objectUrlRef.current = url;
      const player = new Audio(url);
      audioRef.current = player;
      setPhase("speaking");
      player.onended = () => {
        setPhase("idle");
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
      };
      await player.play();
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Director turn failed");
    }
  }

  const holding = phase === "recording";

  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-background/90 p-3 shadow-xl backdrop-blur">
      <p className="text-[10px] uppercase tracking-[0.2em] text-foreground/50">Director · Phase 1</p>
      <p className="mt-1 text-xs text-foreground/70">
        Hold to talk. Read-only — I will not add shots or draft treatments.
      </p>
      <Button
        type="button"
        className="mt-3 w-full"
        variant={holding ? "destructive" : "default"}
        onPointerDown={(e) => {
          e.preventDefault();
          void startRecording();
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          void finishRecording();
        }}
        onPointerLeave={() => {
          if (phase === "recording") void finishRecording();
        }}
        disabled={phase === "working" || phase === "speaking"}
      >
        {holding ? <Square className="size-4" /> : <Mic className="size-4" />}
        {phase === "idle" && "Hold to talk"}
        {phase === "recording" && "Listening…"}
        {phase === "working" && "Thinking…"}
        {phase === "speaking" && "Speaking…"}
        {phase === "error" && "Hold to retry"}
      </Button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {transcript && (
        <p className="mt-2 text-xs text-foreground/60">
          <span className="text-foreground/40">Heard: </span>
          {transcript}
        </p>
      )}
      {reply && <p className="mt-2 text-sm leading-relaxed text-foreground">{reply}</p>}
      {trace?.toolsUsed?.length ? (
        <p className="mt-2 text-[10px] uppercase tracking-wide text-foreground/40">
          {trace.toolsUsed.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
