import { supabase } from "@/lib/supabase";

export type DirectorToolTrace = {
  toolsUsed: string[];
  gaps?: string[];
  options?: string[];
  summary?: string;
  shotPrompt?: string | null;
};

export type DirectorTurnResult = {
  transcript: string;
  replyText: string;
  toolTrace: DirectorToolTrace;
};

function fail(message: string): Error {
  return new Error(message);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function decodeBase64Audio(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function transcribeDirectorAudio(audio: Blob): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw fail("Not signed in.");

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    text?: string;
    errorMessage?: string;
  }>("grok-voice-director-proxy", {
    body: {
      action: "transcribe",
      mime: audio.type || "audio/webm",
      audioBase64: await blobToBase64(audio),
    },
  });

  if (error) throw fail(error.message || "Transcribe failed.");
  if (!data?.ok || !data.text?.trim()) {
    throw fail(data?.errorMessage || "Empty transcript.");
  }
  return data.text.trim();
}

export async function runDirectorTurn(
  projectId: string,
  transcript: string,
): Promise<DirectorTurnResult> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw fail("Not signed in.");

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    replyText?: string;
    toolTrace?: DirectorToolTrace;
    errorMessage?: string;
  }>("grok-voice-director-proxy", {
    body: { action: "direct", projectId, transcript },
  });

  if (error) throw fail(error.message || "Director turn failed.");
  if (!data?.ok || !data.replyText?.trim()) {
    throw fail(data?.errorMessage || "Empty director reply.");
  }
  return {
    transcript,
    replyText: data.replyText.trim(),
    toolTrace: data.toolTrace ?? { toolsUsed: [] },
  };
}

export async function speakDirectorReply(text: string): Promise<Blob> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw fail("Not signed in.");

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    audioBase64?: string;
    mime?: string;
    errorMessage?: string;
  }>("grok-voice-director-proxy", {
    body: { action: "speak", text },
  });

  if (error) throw fail(error.message || "Speak failed.");
  if (!data?.ok || !data.audioBase64) {
    throw fail(data?.errorMessage || "Empty speech audio.");
  }
  return decodeBase64Audio(data.audioBase64, data.mime || "audio/mpeg");
}
