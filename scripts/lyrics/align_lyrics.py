#!/usr/bin/env python3
"""
ALIGN LYRICS — put every lyric line and word on the song clock (deterministic, $0, CPU).

    python3 scripts/lyrics/align_lyrics.py --song audio/song.wav --lyrics lyrics.txt --out lyric_lines.json \\
        [--model small] [--project <uuid>] [--bpm 122] [--transcript transcript_words.json]

Why (plan B1, 2026-10-01): the pipeline had no lyric timing — `video_projects.lyrics` is one text blob, shots carry a
timeline but nothing says which words are sung inside it. Everything in the lyric-locked storyboard (lyrics per
box, regenerate-from-the-lyrics, the brief-fidelity gate axis) hangs off this file.

How: the song is transcribed once with word timestamps (faster-whisper, CTranslate2 on CPU; ≈ 2–4 min for a 3:20
song with the `small` model); the KNOWN lyrics are then aligned to the transcript words by sequence alignment on
normalised tokens (difflib, longest-matching-block first — robust to the transcriber mishearing a word, dropping
an ad-lib or inventing one). Every lyric word takes its matched transcript word's time; unmatched words are placed
by linear interpolation between their nearest matched neighbours (never left untimed); a line's window is its first
word's start to its last word's end. Repeated sections (a hook sung four times) align in order because the match is
monotonic. A manual LRC/SRT (`--lrc`) overrides line starts where the aligner struggles.

Output (one JSON, the shape of the `lyric_lines` table):
  {"project_id", "song", "bpm", "model", "lines": [{"line_index", "section", "text", "start", "end", "beat_start",
   "confidence", "words": [{"w", "start", "end", "matched"}]}], "coverage": <share of lyric words matched directly>}
Sections are inferred from blank-line blocks in the lyrics text ("block 0, 1, 2 …") plus a repeat detector that labels
identical blocks "hook"; everything else is "verse". Nothing here knows a project beyond its id.
"""
import argparse, difflib, json, os, re, sys, time

NORM_RE = re.compile(r"[^a-z0-9']+")
SPELL = {"em": "them", "im": "i'm", "bout": "about", "cause": "because", "whippin": "whipping", "dancin": "dancing", "evenin": "evening", "freezin": "freezing", "gotta": "gotta", "ya": "you"}


def norm(w):
    w = w.lower().replace("’", "'").replace("‘", "'")
    w = NORM_RE.sub("", w).strip("'")
    return SPELL.get(w, w)


def parse_lyrics(text):
    """Blocks separated by blank lines; returns [(block_index, line_text)] skipping empty lines."""
    lines, block = [], 0
    for raw in text.splitlines():
        t = raw.strip()
        if not t:
            if lines and lines[-1][0] == block: block += 1
            continue
        lines.append((block, t))
    return lines


def label_sections(lines):
    """A block whose text repeats elsewhere verbatim (normalised) is a hook; a long single block is a verse."""
    blocks = {}
    for b, t in lines: blocks.setdefault(b, []).append(" ".join(norm(w) for w in t.split()))
    keys = {b: "\n".join(v) for b, v in blocks.items()}
    counts = {}
    for k in keys.values(): counts[k] = counts.get(k, 0) + 1
    labels = {}
    for b, k in keys.items():
        if counts[k] > 1: labels[b] = "hook"
        elif len(blocks[b]) <= 2 and len(k) < 24: labels[b] = "adlib"
        else: labels[b] = "verse"
    return labels


def transcribe(song, model_name, out_json, window=30.0, hop=20.0, log=None, vocabulary=None):
    """Windowed transcription. Whisper on a whole song over a beat drops stretches of repeated lines and smears the
    timestamps of what follows (measured 2026-10-02: 28 s and 59 s holes on a 3:20 rap song). Fixed windows with a
    known offset keep the clock honest: each window is decoded on its own, words are stamped with window_start +
    local time, and in the overlap the word farther from a window edge wins."""
    import subprocess, tempfile
    from faster_whisper import WhisperModel
    m = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=max(1, os.cpu_count() or 1))
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", song], capture_output=True, text=True).stdout.strip())
    # the known lyrics as the decoder's prompt: whisper's vocabulary for this song (its prompt window is ~220 tokens,
    # so the unique lines are passed, most frequent first)
    prompt = None
    if vocabulary:
        seen, uniq = set(), []
        for line in vocabulary:
            k = " ".join(norm(w) for w in line.split())
            if k and k not in seen: seen.add(k); uniq.append(line)
        prompt = "Lyrics: " + " / ".join(uniq)[:900]
    words = []
    t0 = 0.0
    with tempfile.TemporaryDirectory() as td:
        while t0 < dur:
            got = 0
            for attempt, (shift_s, vad) in enumerate([(0.0, False), (0.0, True), (-7.0, False)]):   # a silent window is retried with VAD, then re-cut
                ws = max(0.0, t0 + shift_s); wav = os.path.join(td, "w.wav")
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{ws:.3f}", "-t", f"{window:.3f}", "-i", song, "-ac", "1", "-ar", "16000", wav], check=True)
                segs, _ = m.transcribe(wav, word_timestamps=True, language="en", beam_size=5, vad_filter=vad, condition_on_previous_text=False, initial_prompt=prompt)
                new = []
                for sg in segs:
                    for w in (sg.words or []):
                        st, en = ws + float(w.start), ws + float(w.end)
                        if attempt and not (t0 <= st < t0 + hop): continue   # a retry only fills this window's own span
                        edge = min(st - ws, ws + window - en)          # distance from the window's edges
                        new.append({"w": w.word.strip(), "start": round(st, 3), "end": round(en, 3), "p": round(float(w.probability), 3), "edge": round(edge, 3)})
                got = len(new); words += new
                if got: break
            if log: print(f"window {t0:.0f}-{t0 + window:.0f}s: {got} words{' (retry ' + str(attempt) + ')' if attempt else ''}", file=log, flush=True)
            t0 += hop
    # de-duplicate overlaps: two words within 0.25 s with the same normalised text → keep the one deeper inside its window
    words.sort(key=lambda w: w["start"]); out = []
    for w in words:
        if out and abs(w["start"] - out[-1]["start"]) < 0.25 and norm(w["w"]) == norm(out[-1]["w"]):
            if w["edge"] > out[-1]["edge"]: out[-1] = w
            continue
        # a different word in the same slot from the other window: keep the deeper one too
        if out and abs(w["start"] - out[-1]["start"]) < 0.12:
            if w["edge"] > out[-1]["edge"]: out[-1] = w
            continue
        out.append(w)
    for w in out: w.pop("edge", None)
    json.dump(out, open(out_json, "w"), indent=0)
    return out


def _align_slice(a, b, b0):
    """difflib matching of lyric tokens `a` to transcript tokens `b` (a slice starting at absolute index b0)."""
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False); match = [None] * len(a)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size): match[blk.a + k] = b0 + blk.b + k
    i = 0
    while i < len(a):                                   # second pass inside the gaps: equal counts or near-matches
        if match[i] is not None: i += 1; continue
        j = i
        while j < len(a) and match[j] is None: j += 1
        lo = (match[i - 1] + 1 - b0) if i > 0 and match[i - 1] is not None else 0
        hi = (match[j] - b0) if j < len(a) else len(b)
        gap_l, gap_t = list(range(i, j)), list(range(max(0, lo), max(0, hi)))
        if gap_t and len(gap_l) == len(gap_t):
            for x, y in zip(gap_l, gap_t): match[x] = b0 + y
        elif gap_t:
            used = set()
            for x in gap_l:
                best = max(((difflib.SequenceMatcher(None, a[x], b[y]).ratio(), y) for y in gap_t if y not in used), default=(0, None))
                if best[0] >= 0.75 and best[1] is not None: match[x] = b0 + best[1]; used.add(best[1])
        i = j
    return match


def align(lyric_words, trans_words, owner_block=None):
    """Global monotonic alignment (Needleman–Wunsch) of lyric tokens to transcript tokens. Repeated blocks (a hook sung
    four times) are the case a longest-common-run matcher collapses; a global alignment with gap costs keeps the order:
    the second hook pairs with the second, garbled, run in the transcript rather than jumping to the clean fourth.
    Scores: exact token +3, near token (ratio ≥ 0.75) +1.5, mismatch −1, skipped transcript word −0.25 (ad-libs,
    noise words), skipped lyric word −0.6 (it is interpolated later). O(L×T) with L, T ≈ 500."""
    import numpy as np
    a = [norm(w) for w in lyric_words]; b = [norm(w["w"]) for w in trans_words]
    L, T = len(a), len(b)
    sim = np.full((L, T), -1.0, np.float32)
    bi = {}
    for j, w in enumerate(b): bi.setdefault(w, []).append(j)
    for i, w in enumerate(a):
        for j in bi.get(w, []): sim[i, j] = 3.0
    # near matches only where no exact exists on that row (cheap: compare against distinct tokens once)
    distinct = sorted(set(b))
    for i, w in enumerate(a):
        if w in bi or len(w) < 3: continue
        for v in distinct:
            if abs(len(v) - len(w)) <= 2 and v[:1] == w[:1] and difflib.SequenceMatcher(None, w, v).ratio() >= 0.75:
                for j in bi[v]: sim[i, j] = max(sim[i, j], 1.5)
    GT, GL = -0.25, -0.6
    H = np.zeros((L + 1, T + 1), np.float32); H[0, :] = np.arange(T + 1) * GT; H[:, 0] = np.arange(L + 1) * GL
    P = np.zeros((L + 1, T + 1), np.int8)   # 0 diag, 1 up (skip lyric), 2 left (skip transcript)
    for i in range(1, L + 1):
        row = H[i - 1]; d = row[:-1] + sim[i - 1]; u = row[1:] + GL
        best = np.maximum(d, u); choice = np.where(d >= u, 0, 1).astype(np.int8)
        hi = H[i]; pi = P[i]
        for j in range(1, T + 1):                     # left moves depend on the current row → sequential
            left = hi[j - 1] + GT
            if left > best[j - 1]: hi[j] = left; pi[j] = 2
            else: hi[j] = best[j - 1]; pi[j] = choice[j - 1]
    match = [None] * L; i, j = L, T
    while i > 0 and j > 0:
        m = P[i, j]
        if m == 0:
            if sim[i - 1, j - 1] > 0: match[i - 1] = j - 1
            i -= 1; j -= 1
        elif m == 1: i -= 1
        else: j -= 1
    return match


def place(lyric_words, trans_words, match):
    """Times for every lyric word: matched → transcript time; unmatched → interpolated between neighbours."""
    n = len(lyric_words); times = [None] * n
    for i, m in enumerate(match):
        if m is not None: times[i] = (trans_words[m]["start"], trans_words[m]["end"], True)
    idx = [i for i, t in enumerate(times) if t]
    if not idx: raise SystemExit("align: nothing matched — is this the right song / lyrics?")
    for i in range(n):
        if times[i]: continue
        prev = max([k for k in idx if k < i], default=None); nxt = min([k for k in idx if k > i], default=None)
        if prev is None: t1 = times[nxt][0]; st = max(0.0, t1 - 0.35 * (nxt - i)); times[i] = (round(st, 3), round(min(t1, st + 0.35), 3), False); continue
        if nxt is None: t0 = times[prev][1]; times[i] = (round(t0 + 0.35 * (i - prev - 1), 3), round(t0 + 0.35 * (i - prev), 3), False); continue
        t0, t1 = times[prev][1], times[nxt][0]; span = max(0.0, t1 - t0); k = nxt - prev - 1; pos = i - prev - 1
        s = t0 + span * pos / k; e = t0 + span * (pos + 1) / k
        times[i] = (round(s, 3), round(max(e, s + 0.05), 3), False)
    return times


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--song", required=True); ap.add_argument("--lyrics", required=True, help="text file, blank lines between sections"); ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="small"); ap.add_argument("--transcript", default=None, help="reuse a transcript_words.json"); ap.add_argument("--project", default=None); ap.add_argument("--bpm", type=float, default=None)
    ap.add_argument("--lrc", default=None, help="optional LRC file: [mm:ss.xx] line — overrides line starts")
    ap.add_argument("--sql", default=None, help="also write an upsert for public.lyric_lines (needs --project and --user)"); ap.add_argument("--user", default=None)
    ap.add_argument("--window", type=float, default=30.0); ap.add_argument("--hop", type=float, default=20.0); ap.add_argument("--max-line-seconds", type=float, default=10.0)
    a = ap.parse_args()
    text = open(a.lyrics).read(); lines = parse_lyrics(text); labels = label_sections(lines)
    tw = json.load(open(a.transcript)) if a.transcript and os.path.exists(a.transcript) else transcribe(a.song, a.model, os.path.splitext(a.out)[0] + ".transcript_words.json", a.window, a.hop, log=sys.stderr, vocabulary=[t for _, t in lines])
    tw = [w for w in tw if norm(w["w"])]
    lyric_words, owner = [], []
    for li, (b, t) in enumerate(lines):
        for w in t.split():
            if norm(w): lyric_words.append(w); owner.append(li)
    match = align(lyric_words, tw, [lines[o][0] for o in owner]); times = place(lyric_words, tw, match)
    coverage = sum(1 for m in match if m is not None) / max(1, len(match))
    lrc = {}
    if a.lrc:
        for raw in open(a.lrc):
            m = re.match(r"\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)", raw.strip())
            if m: lrc[" ".join(norm(w) for w in m.group(3).split())] = int(m.group(1)) * 60 + float(m.group(2))
    out_lines = []
    for li, (b, t) in enumerate(lines):
        ws = [{"w": lyric_words[i], "start": times[i][0], "end": times[i][1], "matched": times[i][2]} for i in range(len(lyric_words)) if owner[i] == li]
        if not ws: continue
        start, end = ws[0]["start"], ws[-1]["end"]
        key = " ".join(norm(w) for w in t.split())
        if key in lrc:
            shift = lrc[key] - start; start += shift; end += shift
            for w in ws: w["start"] = round(w["start"] + shift, 3); w["end"] = round(w["end"] + shift, 3)
        conf = sum(1 for w in ws if w["matched"]) / len(ws)
        rec = {"line_index": li, "section": labels[b], "block": b, "text": t, "start": round(start, 3), "end": round(end, 3), "confidence": round(conf, 2), "words": ws}
        if a.bpm: rec["beat_start"] = round(start * a.bpm / 60.0, 2); rec["beat_end"] = round(end * a.bpm / 60.0, 2)
        out_lines.append(rec)
    # monotonic sanity: a line may not start before the previous one ends by more than a beat
    fixed = 0
    for p, q in zip(out_lines, out_lines[1:]):
        if q["start"] < p["start"]: q["start"], q["end"] = p["end"], max(p["end"] + 0.5, q["end"]); q["confidence"] = 0.0; fixed += 1
    # a line stretched over more than --max-line-seconds is the aligner bridging a gap (a written repeat that is not
    # sung, an instrumental): it is kept for the record but marked suspect and its confidence zeroed, so a storyboard
    # fades it and nothing downstream treats the stretch as sung
    for l in out_lines:
        l["suspect"] = (l["end"] - l["start"]) > a.max_line_seconds or (l["confidence"] == 0 and len(l["words"]) >= 3)
        if l["suspect"]: l["confidence"] = 0.0
    rep = {"project_id": a.project, "song": os.path.basename(a.song), "bpm": a.bpm, "model": a.model, "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "coverage": round(coverage, 3), "lines_reordered": fixed, "lines": out_lines}
    json.dump(rep, open(a.out, "w"), indent=1)
    if a.sql:
        if not (a.project and a.user): raise SystemExit("--sql needs --project and --user")
        q = lambda v: str(v).replace("'", "''")
        rows = [f"('{a.user}','{a.project}',{l['line_index']},'{q(l['section'])}',{l['block']},'{q(l['text'])}',{l['start']},{l['end']},{l['confidence']},'{q(json.dumps([{k: w[k] for k in ('w', 'start', 'end', 'matched')} for w in l['words']], ensure_ascii=False))}'::jsonb,'align_lyrics')" for l in out_lines]
        with open(a.sql, "w") as f:
            f.write("insert into public.lyric_lines (user_id, project_id, line_index, section, block, text, start_seconds, end_seconds, confidence, words_json, source) values\n" + ",\n".join(rows) +
                    "\non conflict (project_id, line_index) do update set section=excluded.section, block=excluded.block, text=excluded.text, start_seconds=excluded.start_seconds, end_seconds=excluded.end_seconds, confidence=excluded.confidence, words_json=excluded.words_json, source=excluded.source, updated_at=now();\n")
    low = [l for l in out_lines if l["confidence"] < 0.5]
    print(f"{len(out_lines)} lines, word coverage {coverage:.0%}, {len(low)} low-confidence line(s){', reordered ' + str(fixed) if fixed else ''}")
    for l in out_lines: print(f"{l['start']:7.2f}–{l['end']:7.2f}  {l['section']:<5} {l['confidence']:.2f}  {l['text']}{'   ?suspect' if l['suspect'] else ''}")


if __name__ == "__main__":
    main()
