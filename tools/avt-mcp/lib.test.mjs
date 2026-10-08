import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendLedger, capsFromEnv, clickRefusal, priceOf, readLedger, spendRefusal, spent } from "./lib.mjs";

describe("priceOf", () => {
  it("reads the price off a confirm label", () => {
    expect(priceOf("Generate image · $0.14")).toBe(0.14);
    expect(priceOf("Restage take · $2.22")).toBe(2.22);
    expect(priceOf("Write the shots")).toBeNull();
    expect(priceOf(undefined)).toBeNull();
  });
});

describe("capsFromEnv", () => {
  it("defaults and overrides", () => {
    expect(capsFromEnv({})).toEqual({ perCall: 1, session: 2, daily: 5 });
    expect(capsFromEnv({ AVT_SESSION_CAP_USD: "0.5", AVT_DAILY_CAP_USD: "x" })).toEqual({ perCall: 1, session: 0.5, daily: 5 });
  });
});

describe("spendRefusal", () => {
  const caps = { perCall: 1, session: 2, daily: 5 };
  const ok = { price: 0.14, maxUsd: 0.2, caps, spentNow: { session: 0, today: 0 } };
  it("lets a priced press under every cap go", () => expect(spendRefusal(ok)).toBeNull());
  it("refuses an unpriced confirmation", () => expect(spendRefusal({ ...ok, price: null })).toMatch(/no price/));
  it("refuses over max_usd", () => expect(spendRefusal({ ...ok, maxUsd: 0.1 })).toMatch(/more than max_usd/));
  it("refuses over the per-call cap", () => expect(spendRefusal({ ...ok, price: 2.22, maxUsd: 3 })).toMatch(/per-call/));
  it("refuses past the session cap", () => expect(spendRefusal({ ...ok, spentNow: { session: 1.9, today: 1.9 } })).toMatch(/session cap/));
  it("allows landing exactly on the cap", () => expect(spendRefusal({ ...ok, spentNow: { session: 1.86, today: 1.86 } })).toBeNull());
  it("refuses past the daily cap", () => expect(spendRefusal({ ...ok, spentNow: { session: 0, today: 4.9 } })).toMatch(/daily cap/));
});

describe("ledger", () => {
  it("counts presses by day and by session, failed ones included", () => {
    const path = join(mkdtempSync(join(tmpdir(), "avt-mcp-")), "ledger.jsonl");
    const now = new Date("2026-10-08T12:00:00Z");
    appendLedger(path, { event: "pressed", usd: 0.14, session: "a", at: "2026-10-08T01:00:00Z" });
    appendLedger(path, { event: "outcome", ok: false, session: "a", at: "2026-10-08T01:01:00Z" });
    appendLedger(path, { event: "pressed", usd: 0.14, session: "b", at: "2026-10-08T02:00:00Z" });
    appendLedger(path, { event: "pressed", usd: 0.7, session: "c", at: "2026-10-07T23:00:00Z" });
    const entries = readLedger(path);
    expect(spent(entries, "a", now)).toEqual({ today: 0.28, session: 0.14 });
    expect(readLedger(join(path, "..", "missing.jsonl"))).toEqual([]);
  });
});

describe("clickRefusal", () => {
  it("keeps spend out of the generic click", () => {
    expect(clickRefusal("confirm-generate-image", "Generate image · $0.14")).toMatch(/avt_generate/);
    expect(clickRefusal("confirm-cancel", "Cancel")).toBeNull();
    expect(clickRefusal("box-open", "")).toBeNull();
    expect(clickRefusal("some-button", "Draw pictures · $0.14")).toMatch(/names a price/);
    expect(clickRefusal("variation-new", "New variation")).toMatch(/variations/);
  });
});
