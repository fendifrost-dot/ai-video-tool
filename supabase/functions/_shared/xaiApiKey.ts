/**
 * xAI uses one API key for all endpoints (chat, image, video).
 * On AVT, set the same value as CC's Frost_Grok — typically as XAI_API_KEY.
 */
const XAI_KEY_ENV_NAMES = [
  "XAI_API_KEY",
  "FROST_GROK",
  "GROK_API_KEY",
] as const;

export function resolveXaiApiKey(): string {
  for (const name of XAI_KEY_ENV_NAMES) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return "";
}

export function xaiKeyMissingMessage(): string {
  return (
    "xAI API key not configured on AVT. Set Edge Function secret XAI_API_KEY " +
    "(same value as Control Center Frost_Grok) or FROST_GROK / GROK_API_KEY."
  );
}
