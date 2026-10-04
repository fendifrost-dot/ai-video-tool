/**
 * Which money a provider job is paid from, and when a job may move from one source to another.
 *
 * Two sources exist for Higgsfield (their own rule, help centre "How do I connect Higgsfield to an AI agent"):
 *   • "api"          — the developer API's dollar balance. This is how every job has run so far, through Control Center.
 *   • "subscription" — the plan's credits, spent through Higgsfield's own CLI/MCP by a signed-in runner. Unlimited
 *                      and free generations do NOT apply there: every job costs credits.
 *
 * The rules, all of them pure so a test can hold them:
 *   1. Every job records its route and source on its own row (`settings.billing`) before the money moves.
 *   2. A job moves from "api" to "subscription" only when the API REFUSED it for lack of funds — said in the
 *      provider's own words — or a preflight said the balance cannot cover it. Any other error is just an error.
 *   3. A job the API accepted is never moved: it stays on the API route until it ends.
 *   4. Nothing is substituted. An operation the subscription route has not been verified for is refused there, with
 *      the reason; it is not sent as a different model, without its references, or at another size.
 *   5. Off unless switched on. `SUBSCRIPTION_ROUTING.enabled` is false until one live job has been verified end to
 *      end (generation, retrieval, the right shot, the billing source, the page closed).
 *
 * The subscription route needs a runner: a computer signed in to the Higgsfield CLI and to AVT
 * (scripts/runner/higgsfield_subscription_runner.py). The server does not do that work, and says so on the job.
 */

export type BillingRoute = "api" | "subscription";

export type BillingSource =
  | "higgsfield_api_balance"
  | "higgsfield_plan_credits"
  | "runway_api_credits"
  | "xai_api_balance";

export type BillingRecord = {
  route: BillingRoute;
  source: BillingSource;
  /** The list estimate in dollars for the API route (what the row's estimateUsd already says), null on the subscription route. */
  estimateUsd?: number | null;
  /** Subscription route: what the provider quoted and what it took, in credits. Written by the runner. */
  quoteCredits?: number | null;
  actualCredits?: number | null;
  /** API route: what the provider reported charging, when it reports one. */
  actualUsd?: number | null;
  /** Set when the job was moved: where from, the provider's own sentence, and when. */
  switchedFrom?: BillingRoute;
  switchReason?: string;
  switchedAt?: string;
  /** Subscription route: what the runner has done, in order. A job with `submitStartedAt` and no job id is never resubmitted. */
  runner?: { id?: string; claimedAt?: string; submitStartedAt?: string; note?: string };
};

/** The operations the subscription route may carry, by AVT route name. Empty until each is verified on the live plan. */
export type SubscriptionRouting = { enabled: boolean; verifiedRoutes: readonly string[] };

export const SUBSCRIPTION_ROUTING: SubscriptionRouting = { enabled: false, verifiedRoutes: [] };

export function apiSourceOf(provider: "higgsfield" | "runway" | "grok" | "xai"): BillingSource {
  if (provider === "runway") return "runway_api_credits";
  if (provider === "grok" || provider === "xai") return "xai_api_balance";
  return "higgsfield_api_balance";
}

export function apiBilling(provider: "higgsfield" | "runway" | "grok" | "xai", estimateUsd: number | null): BillingRecord {
  return { route: "api", source: apiSourceOf(provider), estimateUsd };
}

/**
 * Did the provider refuse for lack of funds? Only its own explicit words count: Higgsfield's API answers
 * `403 not_enough_credits`. "balance" or "quota" alone are not enough — a rate limit, a timeout, a 5xx or a content
 * refusal must never move a job to another wallet.
 */
const HIGGSFIELD_NO_FUNDS = [/not[_ ]enough[_ ]credits/i, /insufficient[_ ](credits|balance|funds)/i];

export function isConfirmedInsufficientFunds(provider: string, errorText: string): boolean {
  if (provider !== "higgsfield") return false;
  return HIGGSFIELD_NO_FUNDS.some((re) => re.test(errorText));
}

export type RouteDecision =
  | { action: "stay_failed"; why: string }
  | { action: "move_to_subscription"; billing: BillingRecord };

/**
 * What to do with a submit the API route did not take. `accepted` is whether the provider gave a job id: an accepted
 * job is never moved, whatever was said afterwards.
 */
export function decideAfterApiRefusal(input: {
  provider: string;
  route: string;
  errorText: string;
  accepted: boolean;
  routing?: SubscriptionRouting;
  now: string;
}): RouteDecision {
  const routing = input.routing ?? SUBSCRIPTION_ROUTING;
  if (input.accepted) return { action: "stay_failed", why: "the provider accepted this job on the API route — it stays there" };
  if (!isConfirmedInsufficientFunds(input.provider, input.errorText)) return { action: "stay_failed", why: "not a confirmed lack of funds" };
  if (!routing.enabled) return { action: "stay_failed", why: "the API balance is empty and subscription routing is switched off" };
  if (!routing.verifiedRoutes.includes(input.route)) {
    return { action: "stay_failed", why: `the API balance is empty and the subscription route has not been verified for ${input.route} — nothing was substituted` };
  }
  return {
    action: "move_to_subscription",
    billing: { route: "subscription", source: "higgsfield_plan_credits", estimateUsd: null, switchedFrom: "api", switchReason: input.errorText.slice(0, 300), switchedAt: input.now },
  };
}

/** The billing record on a job row, or null on rows written before routes were recorded (all of those ran on the API). */
export function billingOf(job: { request_payload_json: unknown }): BillingRecord | null {
  const b = (job.request_payload_json as { settings?: { billing?: BillingRecord } } | null)?.settings?.billing;
  return b && (b.route === "api" || b.route === "subscription") ? b : null;
}

/** One line a person can read: which wallet, and what it took. */
export function describeBilling(b: BillingRecord | null): string {
  if (!b) return "API balance (recorded before routes were kept)";
  if (b.route === "subscription") {
    const took = b.actualCredits != null ? `${b.actualCredits} credits` : b.quoteCredits != null ? `quoted ${b.quoteCredits} credits` : "credits not yet known";
    return `plan credits — ${took}${b.switchedFrom ? " (moved from the API: balance empty)" : ""}`;
  }
  const usd = b.actualUsd ?? b.estimateUsd;
  return `API balance${usd != null ? ` — ${b.actualUsd != null ? "" : "about "}$${usd.toFixed(2)}` : ""}`;
}
