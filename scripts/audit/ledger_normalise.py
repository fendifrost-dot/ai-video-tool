#!/usr/bin/env python3
"""Normalise the hand-kept project ledgers into one machine-readable table.

Reads the markdown ledgers of YSL, the YSL environment phase, Hyenas and Partnership, and writes one CSV row per
ledger row with: project, row, date, amount (USD at the ledger's own figure), how the amount was derived, category,
and the provider/route text. Outcome and method are NOT guessed here: they come from the overrides file, which a
person or an agent fills in after reading the row (docs/audit/ledger_outcomes_2026-11.csv).

  python3 scripts/audit/ledger_normalise.py            # writes docs/audit/ledger_normalised_2026-11.csv, prints sums
  python3 scripts/audit/ledger_normalise.py --check    # also prints every row whose stated amount and the
                                                       # running-total step disagree by more than 1 cent

No network, no provider call, $0. The ledgers stay the source of truth; this file only reads them.
"""
import csv, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "docs", "audit", "ledger_normalised_2026-11.csv")
OUTCOMES = os.path.join(ROOT, "docs", "audit", "ledger_outcomes_2026-11.csv")

MONEY = re.compile(r"\$\s?([0-9]+(?:\.[0-9]+)?)")


def cells(line):
    return [c.strip() for c in re.split(r"(?<!\\)\|", line.strip().strip("|"))]


def first_money(text):
    """The row's own figure. A product '6 × $1.849 = $11.094' or '2 × $0.202 = $0.404' → the figure after '='."""
    if not text:
        return None
    eq = re.search(r"=\s*\$\s?([0-9]+(?:\.[0-9]+)?)", text)
    if eq:
        return float(eq.group(1))
    m = MONEY.search(text)
    return float(m.group(1)) if m else None


CATEGORY_RULES = [
    # order matters: first match wins
    ("writer", r"treatment-writer|lyric-visualizer|writer_runs|visualiser|visualizer"),
    ("review", r"\bAstra\b|astra-visual-review|OpenAI"),
    ("lipsync", r"lipsync|demucs"),
    ("relight", r"Beeble|switchx-background"),
    # Control Center's function is NAMED switchx-restyle but it also carries the veed matte: veed decides
    ("matte", r"video-background-removal|matte-video-proxy|remove_video_background|\bmatte\b|\bmattes\b"),
    ("relight", r"SwitchX"),
    ("clip", r"kling|seedance"),
    ("swap", r"genjutsu|object.swap|dress-clip|dress runs?|\bDress\b|/videos/edits|"
             r"grok-video-edit|Aleph|v4c-anchor|anchored re-roll|S0[0-9] (E1|repair)|jacket-inpaint|garment-proxy|"
             r"wardrobe edits|Omni Flash|lucy|vton"),
    ("clip", r"kling"),
    ("clip", r"seedance|montage-shot|kling|grok-broll|grok-imagine-video|B-roll test|i2v|reference-to-video|"
             r"image-to-video|GenerateVideo|Seedance animation"),
    ("still", r"world-still-proxy|grok-imagine-image|gemini|nano-banana|stills?\b|images/edits|image edit|"
              r"plate test"),
]


TOOL_RULES = [
    ("kling", r"kling"),
    ("genjutsu", r"genjutsu|object.swap|dress-clip|dress runs?"),
    ("seedance", r"seedance|montage-shot"),
    ("grok-video", r"grok-broll|grok-imagine-video|grok-video-edit|/videos/edits|Grok video|B-roll test"),
    ("veed-matte", r"video-background-removal|matte-video-proxy"),
    ("switchx", r"Beeble|switchx-background|SwitchX via"),
    ("gemini", r"gemini|nano-banana|Google"),
    ("grok-image", r"grok-imagine-image|grok-image|Grok image|images/edits|Grok keyframes"),
    ("grok-text", r"treatment-writer|lyric-visualizer|grok-4"),
    ("openai-astra", r"Astra|OpenAI"),
    ("runway", r"Runway|Aleph"),
    ("fal-other", r"\bfal\b|lipsync|demucs"),
    ("xai-other", r"xAI"),
]


def tool(route, what=""):
    for text in (route, what):
        for name, pat in TOOL_RULES:
            if re.search(pat, text, re.I):
                return name
    return "other"


def category(route, what=""):
    """The route (provider column) decides; the description is read only when the route names no tool."""
    for text in (route, what):
        for name, pat in CATEGORY_RULES:
            if re.search(pat, text, re.I):
                return name
    return "other"


def inherit(route, prev):
    """'same', 'same; job …', 'same, on c004' → the previous row's route."""
    return prev + " " + route if re.match(r"^\(?same\b", route.strip(), re.I) and prev else route


NEG = re.compile(r"REJECTED|rejected|\bkilled\b|NOT used|not used|[Uu]nusable|usable:false|\bMISS\b|"
                 r"failed the (hero )?gate|neither beat|event ignored|blocked by|not usable|was a no\b|"
                 r"wardrobe miss|marked rejected|Generation failed|timed out|not accurate|redrew his face|"
                 r"flicker below|patches at both hips|clearly not me|did not|didn't do")
POS_FENDI = re.compile(r"FINAL\b|APPROVED|approved by Fendi|PERFECT|Perfect|I like|Looks amazing|canonical|"
                       r"is fine|it'll do|passed by Fendi|Fendi: \"Yes\"|looks good")
POS_AGENT = re.compile(r"\bPASS(ED)?\b|KEEPER|\bkept\b|selected for|\bpick\b|usable\b|\bused\b")
TEST = re.compile(r"\btest\b|benchmark|smoke|experiment|[Vv]ariant|\breview\b|dial-in")


def outcome_auto(text, amount):
    """A documented keyword rule over the row's OWN text. It is a first sort, not a judgement:
    approved  = the row carries approving words from Fendi and nothing negative
    rejected  = the row says rejected / not used / unusable / miss / failed, and nothing positive
    mixed     = both (a batch row, or a rejection followed by a keeper): split by hand in the outcomes file
    kept      = passed or used on the agent's own judgement; no words from Fendi on the row
    test      = a test, benchmark or review call
    unstated  = the row does not say what became of the result
    """
    if not amount:
        return "none"
    neg, pf, pa = bool(NEG.search(text)), bool(POS_FENDI.search(text)), bool(POS_AGENT.search(text))
    if neg and (pf or pa):
        return "mixed"
    if neg:
        return "rejected"
    if pf:
        return "approved"
    if pa:
        return "kept"
    if TEST.search(text):
        return "test"
    return "unstated"


def ysl_like(path, project, total_col=-1):
    """YSL and environment ledgers: '| # | Date | Provider | purpose | billed | estimated | running total |'."""
    rows, prev_total, prev_route = [], 0.0, ""
    for lineno, line in enumerate(open(path, encoding="utf-8"), 1):
        if not line.startswith("|") or line.startswith("|---"):
            continue
        c = cells(line)
        if len(c) < 7 or c[0] in ("#",):
            continue
        num, date, provider, purpose = c[0], c[1], c[2], c[3]
        provider = inherit(provider, prev_route)
        prev_route = provider
        billed, est, total_txt = c[-3], c[-2], c[-1]
        total = first_money(total_txt)
        stated = first_money(est) if first_money(est) is not None else first_money(billed)
        # a billed cell that holds an asset id (later YSL rows moved the columns) is not money
        if total is not None and total < prev_total - 0.005:
            # a row filed out of order (YSL row 221 sits at the end of the file with an older total)
            amount, how = (stated or 0.0), "stated on the row; filed out of order"
        elif total is not None:
            amount, how = round(total - prev_total, 3), "running-total step"
            prev_total = total
        elif re.search(r"unchanged", total_txt):
            amount, how = 0.0, "running total unchanged"
        else:
            amount, how = (stated or 0.0), "stated on the row; NOT in the running total"
        rows.append(dict(project=project, row=num, line=lineno, date=date, amount=amount, how=how,
                         stated=stated, category=category(provider, purpose) if amount else "none",
                         tool=tool(provider, purpose) if amount else "none",
                         outcome_auto=outcome_auto(" ".join(c[3:]), amount),
                         route=provider[:160], what=re.sub(r"\s+", " ", purpose)[:400]))
    return rows


def simple(path, project, est_col, what_col, route_col, date_col=1):
    """Hyenas and Partnership: one estimate column per row, no running total."""
    rows, prev_route = [], ""
    for lineno, line in enumerate(open(path, encoding="utf-8"), 1):
        if not line.startswith("|") or line.startswith("|---"):
            continue
        c = cells(line)
        if c[0] == "#" or len(c) <= max(est_col, what_col, route_col):
            continue
        if not re.match(r"^[0-9]", c[0]):
            continue
        amount = first_money(c[est_col]) or 0.0
        route = inherit(c[route_col], prev_route)
        prev_route = route
        rows.append(dict(project=project, row=c[0], line=lineno, date=c[date_col], amount=round(amount, 3),
                         how="estimate column", stated=amount,
                         category=category(route, c[what_col]) if amount else "none",
                         tool=tool(route, c[what_col]) if amount else "none",
                         outcome_auto=outcome_auto(" ".join(c[what_col:]), amount),
                         route=route[:160], what=re.sub(r"\s+", " ", c[what_col])[:400]))
    return rows


def load_outcomes():
    out = {}
    if os.path.exists(OUTCOMES):
        for r in csv.DictReader(open(OUTCOMES, encoding="utf-8")):
            out[(r["project"], r["row"])] = r
    return out


def main():
    d = os.path.join(ROOT, "docs")
    rows = []
    rows += ysl_like(os.path.join(d, "LEDGER_YSL_TESTING_BUDGET.md"), "ysl")
    rows += ysl_like(os.path.join(d, "LEDGER_ENVIRONMENT_BROLL_BUDGET.md"), "ysl_environment")
    rows += simple(os.path.join(d, "LEDGER_HYENAS_2026-11-13.md"), "hyenas", est_col=4, what_col=2, route_col=3)
    rows += simple(os.path.join(d, "LEDGER_PARTNERSHIP_CEASE_DESIST_2026-11-11.md"), "partnership",
                   est_col=4, what_col=2, route_col=3)
    outcomes = load_outcomes()
    for r in rows:
        o = outcomes.get((r["project"], r["row"]), {})
        if o.get("category"):
            r["category"] = o["category"]
        r["method"] = o.get("method", "")
        r["outcome"] = o.get("outcome") or r["outcome_auto"]
        r["outcome_source"] = "read by hand" if o.get("outcome") else "keyword rule"
        # money on this row that bought something later thrown away; a hand figure wins over the rule
        if o.get("rework_usd") not in (None, ""):
            r["rework_usd"] = float(o["rework_usd"])
        else:
            r["rework_usd"] = r["amount"] if r["outcome"] == "rejected" else 0.0
        r["covered_by_note"] = o.get("covered_by_note", "")
        r["fendi_words"] = o.get("fendi_words", "")
        r["note"] = o.get("note", "")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    cols = ["project", "row", "line", "date", "amount", "how", "category", "tool", "method", "outcome",
            "outcome_source", "rework_usd", "covered_by_note", "fendi_words", "note", "route", "what"]
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    def table(key):
        agg = {}
        for r in rows:
            k = (r["project"], r[key] or "(unset)")
            a = agg.setdefault(k, [0.0, 0])
            a[0] += r["amount"]
            a[1] += 1 if r["amount"] else 0
        return agg

    for key in ("category", "tool", "outcome"):
        print(f"\n== by project and {key} (USD at the ledger's figure; paid rows) ==")
        agg = table(key)
        for (p, k) in sorted(agg):
            print(f"{p:16s} {k:14s} {agg[(p, k)][0]:9.2f}  {agg[(p, k)][1]:4d} rows")
    print("\n== rework (USD on rows or parts of rows whose result was thrown away) ==")
    for p in ("ysl", "ysl_environment", "hyenas", "partnership"):
        pr = [r for r in rows if r["project"] == p]
        by_cat = {}
        for r in pr:
            by_cat[r["category"]] = by_cat.get(r["category"], 0.0) + r["rework_usd"]
        hand = sum(r["rework_usd"] for r in pr if r["outcome_source"] == "read by hand")
        rule = sum(r["rework_usd"] for r in pr if r["outcome_source"] != "read by hand")
        covered = sum(r["rework_usd"] for r in pr if r["covered_by_note"])
        print(f"{p:16s} total {hand + rule:8.2f} (read by hand {hand:.2f}, keyword rule {rule:.2f}); "
              f"of which a note already covered it: {covered:.2f}")
        print("   " + ", ".join(f"{k} {v:.2f}" for k, v in sorted(by_cat.items()) if v))
    print("\n== totals ==")
    for p in ("ysl", "ysl_environment", "hyenas", "partnership"):
        inside = sum(r["amount"] for r in rows if r["project"] == p and "NOT in" not in r["how"])
        outside = sum(r["amount"] for r in rows if r["project"] == p and "NOT in" in r["how"])
        print(f"{p:16s} {inside:9.2f}  (+ {outside:.2f} on rows outside the running total)")
    if "--check" in sys.argv:
        print("\n== rows whose stated amount and running-total step disagree by > $0.01 ==")
        for r in rows:
            if r["how"] == "running-total step" and r["stated"] is not None and abs(r["stated"] - r["amount"]) > 0.011:
                print(f"{r['project']} row {r['row']} (line {r['line']}): stated {r['stated']}, step {r['amount']}")


if __name__ == "__main__":
    main()
