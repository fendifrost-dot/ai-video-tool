/**
 * A Fal queue link a caller hands back to be polled with CC's key — only ever one of Fal's own. The poll proxies used
 * to forward whatever URL they were given, and Control Center then sent `Authorization: Key <FAL_API_KEY>` to it: a
 * signed-in caller could have pointed it at a server of theirs and read the key off the request. Here the link must
 * be https, on queue.fal.run, and shaped like a request's status or response path. Pure; mirrored in CC.
 */

export const FAL_QUEUE_HOST = "queue.fal.run";

/** `/<model-id>/requests/<request-id>` optionally `/status`, with Fal's own id and model characters. */
const FAL_QUEUE_PATH =
  /^\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\/requests\/[A-Za-z0-9._-]+(?:\/status)?\/?$/;

export function isFalQueueUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (
    u.protocol !== "https:" ||
    u.hostname !== FAL_QUEUE_HOST ||
    u.port !== "" ||
    u.username ||
    u.password
  )
    return false;
  return FAL_QUEUE_PATH.test(u.pathname);
}
