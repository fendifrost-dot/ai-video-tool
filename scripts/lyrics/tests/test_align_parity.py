"""
The Python side of the lyric-alignment parity lock.

src/lib/lyrics/__fixtures__/align_parity.json holds inputs and the outputs align_lyrics.py produced for them; the
app's TypeScript aligner is held to those numbers by align.parity.test.ts. This test holds the SCRIPT to them too:
if align_lyrics.py is changed and the fixture is not regenerated (scripts/lyrics/make_parity_fixtures.py), this
fails here rather than the two quietly drifting apart.

    python3 -m pytest scripts/lyrics/tests
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import align_lyrics as A  # noqa: E402

FIXTURE = json.load(open(os.path.join(HERE, "..", "..", "..", "src", "lib", "lyrics", "__fixtures__", "align_parity.json"), encoding="utf-8"))


def test_fixture_has_cases():
    assert len(FIXTURE["cases"]) >= 15 and len(FIXTURE["merges"]) >= 2


def test_build_lines_matches_the_fixture():
    for case in FIXTURE["cases"]:
        got = A.build_lines(case["text"], [dict(w) for w in case["words"]], **case["options"])
        # through JSON, as the fixture went: tuples become lists, floats print the same
        assert json.loads(json.dumps(got)) == case["expected"], case["name"]


def test_merge_windows_matches_the_fixture():
    for merge in FIXTURE["merges"]:
        got = A.merge_windows([dict(w) for w in merge["words"]])
        assert json.loads(json.dumps(got)) == merge["expected"], merge["name"]


def test_norm_matches_the_fixture():
    for n in FIXTURE["norms"]:
        assert A.norm(n["in"]) == n["out"], n["in"]
