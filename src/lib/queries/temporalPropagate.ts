import { getAccessTokenWithTimeout } from "@/lib/authSession";
import { buildHeroFrameTemporalPropagateBody } from "@/lib/heroFrame/temporalDispatch";
import type { TemporalPropagateWireBody } from "@/lib/temporal";

export async function callTemporalPropagate(
  input: Omit<TemporalPropagateWireBody, "explicitArm">,
): Promise<Record<string, unknown>> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL");

  const body = buildHeroFrameTemporalPropagateBody(input);
  const token = await getAccessTokenWithTimeout();
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/functions/v1/temporal-propagate-proxy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    const err = typeof json.error === "string" ? json.error : `http_${resp.status}`;
    const detail = typeof json.message === "string" ? `: ${json.message}` : "";
    throw new Error(`${err}${detail}`);
  }
  return json;
}
