import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

// =============================================================================
// Auth session lookup — timeout-guarded
// =============================================================================
// supabase-js getSession()/getUser() read through the auth LockManager lock.
// When that lock is contended — e.g. an immediately-preceding storage call
// (signing a URL) or a prior getSession() that never settled left it held —
// the call can hang INDEFINITELY: no resolve, no reject. The awaiting caller
// stalls *before any fetch*, so its try/catch never fires — the click silently
// does nothing, no proxy request goes out, no row is written, no toast shows,
// and any `busy` button stays disabled forever.
//
// Racing the lookup against a timeout converts that invisible hang into a real,
// retryable error. This is the same guard compose-look's callComposeLook()
// already uses inline; centralised here so every auth-gated network entry point
// (hero-frame lanes, uploads) shares it.

const DEFAULT_AUTH_TIMEOUT_MS = 8000;

function withAuthTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error("Auth session lookup timed out — please retry")),
        timeoutMs,
      ),
    ),
  ]);
}

/** Resolve the current session, or throw a retryable error if the auth lock hangs. */
export async function getSessionWithTimeout(
  timeoutMs = DEFAULT_AUTH_TIMEOUT_MS,
): Promise<Session> {
  const { data, error } = await withAuthTimeout(
    supabase.auth.getSession(),
    timeoutMs,
  );
  if (error) throw error;
  if (!data.session) throw new Error("Not signed in");
  return data.session;
}

/** Resolve the current access token, or throw a retryable error if the auth lock hangs. */
export async function getAccessTokenWithTimeout(
  timeoutMs = DEFAULT_AUTH_TIMEOUT_MS,
): Promise<string> {
  const session = await getSessionWithTimeout(timeoutMs);
  return session.access_token;
}
