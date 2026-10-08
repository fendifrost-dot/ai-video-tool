// Pure helpers for the AVT MCP server: what a confirmation costs, whether the spend caps allow it,
// and which clicks the generic click tool must refuse. No browser here, so these are unit-tested.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/** The price on a confirm button, e.g. "Generate image · $0.14" → 0.14. Null when the label names no price. */
export function priceOf(label) {
  const m = /\$(\d+(?:\.\d+)?)/.exec(label ?? "");
  return m ? Number(m[1]) : null;
}

/** Caps from the environment. Every spend goes through all three; none of them can be lifted from a tool call. */
export function capsFromEnv(env = process.env) {
  const n = (v, d) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    perCall: n(env.AVT_MAX_USD_PER_CALL, 1),
    session: n(env.AVT_SESSION_CAP_USD, 2),
    daily: n(env.AVT_DAILY_CAP_USD, 5),
  };
}

const today = (now = new Date()) => now.toISOString().slice(0, 10);

/** Every paid press, one JSON line each. Read back to enforce the daily cap across server restarts. */
export function readLedger(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function appendLedger(path, entry) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}

/** List-price spend pressed today and in this server process. A press counts whether or not it succeeded:
 * a failed generation may still have been billed by the provider, so the cap never assumes it was free. */
export function spent(entries, sessionId, now = new Date()) {
  const day = today(now);
  const pressed = entries.filter((e) => e.event === "pressed");
  const sum = (xs) => Math.round(xs.reduce((a, e) => a + (e.usd ?? 0), 0) * 100) / 100;
  return {
    today: sum(pressed.filter((e) => (e.at ?? "").slice(0, 10) === day)),
    session: sum(pressed.filter((e) => e.session === sessionId)),
  };
}

/** Whether a press may go. Returns null when it may, or the reason it may not. */
export function spendRefusal({ price, maxUsd, caps, spentNow }) {
  if (price === null) return "the confirmation shows no price, so its cost is unknown — not pressed";
  if (!(maxUsd > 0)) return "max_usd must be a positive amount";
  if (price > maxUsd) return `the confirmation asks $${price.toFixed(2)}, more than max_usd $${maxUsd.toFixed(2)}`;
  if (price > caps.perCall) return `$${price.toFixed(2)} is over the per-call cap $${caps.perCall.toFixed(2)} (AVT_MAX_USD_PER_CALL)`;
  if (spentNow.session + price > caps.session + 1e-9)
    return `this server has pressed $${spentNow.session.toFixed(2)}; $${price.toFixed(2)} more would pass the session cap $${caps.session.toFixed(2)} (AVT_SESSION_CAP_USD)`;
  if (spentNow.today + price > caps.daily + 1e-9)
    return `$${spentNow.today.toFixed(2)} pressed today; $${price.toFixed(2)} more would pass the daily cap $${caps.daily.toFixed(2)} (AVT_DAILY_CAP_USD)`;
  return null;
}

/** The generic click tool is for free steps only: anything that confirms a spend goes through avt_generate. */
export function clickRefusal(testId, text) {
  if (/^confirm-/.test(testId) && testId !== "confirm-cancel") return `"${testId}" confirms an action — use avt_generate (paid) or the specific tool`;
  if (/\$\s?\d/.test(text ?? "")) return `that button names a price ("${text.trim()}") — use avt_generate so the caps apply`;
  if (/^(variation-(new|duplicate|rename|delete))$/.test(testId)) return `"${testId}" changes the project's variations — do that in the app`;
  return null;
}
