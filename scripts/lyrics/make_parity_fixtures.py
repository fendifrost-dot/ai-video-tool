#!/usr/bin/env python3
"""
Parity fixtures for the app's lyric aligner (src/lib/lyrics/align.ts).

The app times lyrics with the SAME alignment as scripts/lyrics/align_lyrics.py: the transcription comes from a hosted
speech model instead of faster-whisper, everything after it (merge_windows → align → place → build_lines) is this
script's algorithm, re-stated in TypeScript because the app has nowhere to run Python. This file is what keeps the
two from drifting: it runs the Python on a set of cases and writes inputs + outputs; align.parity.test.ts runs the
TypeScript on the same inputs and demands the same numbers.

    python3 scripts/lyrics/make_parity_fixtures.py        # rewrites src/lib/lyrics/__fixtures__/align_parity.json

Re-run it whenever align_lyrics.py changes, then make the TypeScript agree. The lyrics here are invented.
"""
import json, os, random, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import align_lyrics as A  # noqa: E402

HOOK = """Lights down low, we don't need the sun
Glass on the table, night just begun
Say it once more, I'm the only one
Run it back slow till the morning come"""

VERSE_1 = """Woke up late with the city in my ear
Counting every reason that I'm still right here
Momma said patience, baby, give it one more year
Now the whole block singing what they couldn't hear
Cold hands, warm coat, pockets full of maybe
Phone keeps ringin' but they never really phased me
I been on the road and the road been crazy
Tell 'em slow down, I'm just bein' lazy"""

VERSE_2 = """Seven in the morning and the coffee going cold
Stories on the ceiling that I never told
Everybody's talking 'bout the silver and the gold
I'm just tryna figure what it's like to grow old
Heard 'em whisper, heard 'em laughin' through the wall
Couldn't hear a thing when I was ten feet tall"""

ADLIB = "Yeah, yeah"
SONG = "\n\n".join([ADLIB, HOOK, VERSE_1, HOOK, VERSE_2, HOOK, "Run it back\nRun it back"])
CURLY = "Don’t you worry ’bout the time\nI’m whippin through the evenin light\nCause em all know we dancin tonight"

MISHEAR = {"lights": "likes", "glass": "class", "morning": "mourning", "patience": "patients", "city": "sitting", "coffee": "copy", "silver": "sliver", "ceiling": "sealing", "whisper": "whisker", "pockets": "packets", "reason": "reasons", "table": "cable", "crazy": "lazy", "ringin'": "ringing", "laughin'": "laughing"}
NOISE = ["uh", "yeah", "ay", "woo", "okay", "what", "skrrt"]


def sing(text, rng, start=8.0, drop=0.06, mishear=0.12, adlib=0.08, garble=None, gap_after_block=4.0, skip_blocks=()):
    """A plausible transcript of `text` being sung: words in order with times, some dropped, misheard or interrupted."""
    words, t = [], start
    for bi, block in enumerate(text.split("\n\n")):
        if bi in skip_blocks:            # written but never sung (the aligner must bridge it and mark it suspect)
            t += gap_after_block; continue
        for line in block.splitlines():
            for w in line.split():
                d = round(0.16 + 0.05 * len(w.strip(",.'")) * rng.uniform(0.6, 1.2), 3)
                r = rng.random()
                k = w.lower().strip(",.")
                if garble and garble[0] <= t <= garble[1]:
                    if rng.random() < 0.7: words.append({"w": rng.choice(NOISE), "start": round(t, 3), "end": round(t + d, 3), "p": 0.3})
                elif r < drop: pass
                elif r < drop + mishear and k in MISHEAR: words.append({"w": MISHEAR[k], "start": round(t, 3), "end": round(t + d, 3), "p": 0.5})
                else: words.append({"w": w, "start": round(t, 3), "end": round(t + d, 3), "p": 0.9})
                t += d + rng.uniform(0.02, 0.09)
                if rng.random() < adlib:
                    n = rng.choice(NOISE); words.append({"w": n, "start": round(t, 3), "end": round(t + 0.2, 3), "p": 0.4}); t += 0.26
            t += rng.uniform(0.2, 0.7)
        t += gap_after_block
    return words


def windows(words, rng, window=30.0, hop=20.0):
    """The same transcript as overlapping windows would hear it: words in an overlap appear twice, a few of the
    doubles re-heard as a different word or a few hundredths apart; each carries its distance from its window's edge."""
    out, t0 = [], 0.0
    end = max(w["end"] for w in words) + 1
    while t0 < end:
        for w in words:
            if t0 <= w["start"] and w["end"] <= t0 + window:
                c = dict(w); j = rng.uniform(-0.04, 0.04) if rng.random() < 0.3 else 0.0
                c["start"] = round(c["start"] + j, 3); c["end"] = round(c["end"] + j, 3)
                if rng.random() < 0.05: c["w"] = rng.choice(NOISE)
                c["edge"] = round(min(c["start"] - t0, t0 + window - c["end"]), 3)
                out.append(c)
        t0 += hop
    rng.shuffle(out)
    return out


def case(name, text, words, **kw):
    built = A.build_lines(text, words, **kw)
    return {"name": name, "text": text, "words": words, "options": {k: v for k, v in kw.items()}, "expected": built}


def main():
    cases, merges = [], []
    for seed in (0, 2, 5, 7):
        rng = random.Random(1000 + seed)
        cases.append(case(f"song_seed_{seed}", SONG, sing(SONG, rng, drop=0.03 + 0.02 * seed, mishear=0.05 * seed, adlib=0.03 * seed)))
    rng = random.Random(7)
    cases.append(case("clean", SONG, sing(SONG, rng, drop=0, mishear=0, adlib=0)))
    cases.append(case("garbled_second_hook", SONG, sing(SONG, random.Random(11), garble=(60.0, 80.0))))
    cases.append(case("block_written_not_sung", SONG, sing(SONG, random.Random(12), skip_blocks=(3,), gap_after_block=9.0)))
    cases.append(case("late_start_head_unmatched", VERSE_1, sing(VERSE_1, random.Random(13), start=14.68)[6:]))
    cases.append(case("tail_unmatched", VERSE_2, sing(VERSE_2, random.Random(14))[:-9]))
    cases.append(case("curly_quotes_and_spellings", CURLY, sing(CURLY.replace("’", "'"), random.Random(15), drop=0, mishear=0, adlib=0.2)))
    cases.append(case("with_bpm", HOOK + "\n\n" + VERSE_2, sing(HOOK + "\n\n" + VERSE_2, random.Random(16)), bpm=122.0))
    cases.append(case("short_max_line", VERSE_1, sing(VERSE_1, random.Random(17), drop=0.3), max_line_seconds=2.5))
    w18 = sing(HOOK, random.Random(18), drop=0, mishear=0, adlib=0)
    cases.append(case("lrc_override", HOOK, w18, lrc={" ".join(A.norm(x) for x in "Say it once more, I'm the only one".split()): 40.0}))
    # a transcript that runs backwards for a stretch: the monotonic guard has to re-seat a line
    w19 = sing(VERSE_2, random.Random(19), drop=0, mishear=0, adlib=0)
    half = len(w19) // 2
    for w in w19[half:half + 8]: w["start"] = round(w["start"] - 9.0, 3); w["end"] = round(w["end"] - 9.0, 3)
    cases.append(case("transcript_out_of_order", VERSE_2, w19))
    for seed in range(2):
        rng = random.Random(2000 + seed)
        base = sing(SONG, rng)
        raw = windows(base, rng)
        merged = A.merge_windows([dict(w) for w in raw])
        merges.append({"name": f"merge_seed_{seed}", "words": raw, "expected": merged})
        if seed == 0: cases.append(case("after_merge", SONG, merged))
    # the near-match ratio, on its own
    pairs = [("lights", "likes"), ("morning", "mourning"), ("patience", "patients"), ("whisper", "whisker"), ("ringin", "ringing"), ("abc", "abd"), ("table", "cable"), ("designer", "designers"), ("a", "b"), ("", ""), ("freezin", "freezing"), ("abcabc", "bcabca")]
    ratios = [{"a": a, "b": b, "ratio": __import__("difflib").SequenceMatcher(None, a, b).ratio()} for a, b in pairs]
    norms = [{"in": w, "out": A.norm(w)} for w in ["Don’t", "'em", "Em", "WHIPPIN'", "evenin,", "(yeah)", "ya", "I'm", "Im", "—", "rock'n'roll", "21", "cause", "'Bout"]]
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "lib", "lyrics", "__fixtures__", "align_parity.json")
    json.dump({"generated_by": "scripts/lyrics/make_parity_fixtures.py", "numpy": __import__("numpy").__version__, "cases": cases, "merges": merges, "ratios": ratios, "norms": norms}, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(cases)} cases, {len(merges)} merges → {os.path.normpath(out)} ({os.path.getsize(out) // 1024} KB)")
    for c in cases: print(f"  {c['name']:<32} lines {len(c['expected']['lines']):>3}  coverage {c['expected']['coverage']:.3f}  reordered {c['expected']['lines_reordered']}  suspect {sum(1 for l in c['expected']['lines'] if l['suspect'])}")


if __name__ == "__main__":
    main()
