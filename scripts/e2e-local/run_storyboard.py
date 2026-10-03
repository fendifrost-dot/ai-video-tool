"""
Drives the REAL app in Chromium against the stand-in backend, at desktop and phone size:
the board, the full-screen shot (the take's range playing in place), assigning footage, Review played against the
song (sampled every half second: which shot is on the stage, which file, and how far its playhead is from where the
song clock says it should be), swiping between shots on a phone, and the fill-the-screen mode a phone gets.

  bash scripts/e2e-local/make_media.sh && npx tsx scripts/e2e-local/mkfixtures.ts && bash scripts/e2e-local/start.sh
  python3 scripts/e2e-local/run_storyboard.py        # writes result.json + screenshots beside this file
  bash scripts/e2e-local/stop.sh                     # as its own command
"""
import asyncio, json, os, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get("CHROME_PATH")  # leave unset to use Playwright's own browser
from playwright.async_api import async_playwright
BASE = "http://127.0.0.1:5200"; P = "11111111-1111-4111-8111-111111111111"
SESSION = open("session.json").read()
INIT = "try { localStorage.setItem('sb-localhost-auth-token', %s); } catch (e) {}" % json.dumps(SESSION)
OFFSET = 0.8538
async def new_page(b, **kw):
    ctx = await b.new_context(**kw); await ctx.add_init_script(INIT)
    pg = await ctx.new_page(); pg.logs = []
    pg.on("console", lambda m: pg.logs.append(m.text[:300]) if m.type == "error" else None)
    pg.on("pageerror", lambda e: pg.logs.append("PAGEERROR " + str(e)[:300]))
    return pg
STAGE = """() => { const a=document.querySelector('[data-testid=sequence-audio]'); const p=document.querySelector('[data-testid=sequence-player]'); const st=document.querySelector('[data-testid=sequence-stage]');
  const v=[...st.querySelectorAll('video')].find(x=>x.className.includes('opacity-100'));
  return {t:+a.currentTime.toFixed(3), apaused:a.paused, active:p.dataset.activeShot, kind:st.dataset.mediaKind, file: v? v.currentSrc.split('?')[0].split('/').pop():null, vt: v? +v.currentTime.toFixed(3):null, vpaused: v? v.paused:null, img: !!st.querySelector('img'), slate: !!st.querySelector('[data-testid=sequence-slate]'), label: st.querySelector('[data-testid=sequence-shot-label]')?.innerText}; }"""
async def desktop(b, out):
    pg = await new_page(b, viewport={"width": 1400, "height": 900})
    await pg.goto(f"{BASE}/projects/{P}/storyboard"); await pg.wait_for_selector("[data-testid=box-card]", timeout=60000); await pg.wait_for_timeout(2500)
    out["board"] = await pg.evaluate("() => ({cards: document.querySelectorAll('[data-testid=box-card]').length, header: document.querySelector('[data-testid=storyboard-page]').innerText.slice(0,120), c006: document.querySelector('[data-box-key=c006] [data-testid=box-media]')?.dataset.mediaRole, c009: document.querySelector('[data-box-key=c009] [data-testid=box-media]')?.dataset.mediaRole, c002: [document.querySelector('[data-box-key=c002] [data-testid=box-media]')?.dataset.mediaRole, document.querySelector('[data-box-key=c002] [data-testid=box-media]')?.dataset.mediaBase]})")
    await pg.screenshot(path="shot_board_desktop.png")
    # focus view on a performance box: the take's range plays in place
    await pg.click("[data-box-key=c005] [data-testid=box-open]"); await pg.wait_for_selector("[data-testid=focus-view]"); await pg.wait_for_timeout(2500)
    f = []
    for i in range(6):
        await pg.wait_for_timeout(500)
        f.append(await pg.evaluate("() => { const v=document.querySelector('[data-testid=focus-stage] video'); return v? {ct:+v.currentTime.toFixed(2), paused:v.paused, rs:v.readyState}:null; }"))
    out["focus_c005_take"] = {"pos": await pg.inner_text("[data-testid=focus-position]"), "expected_range": [round(15.69-OFFSET,2), round(19.61-OFFSET,2)], "samples": f}
    await pg.screenshot(path="shot_focus_desktop.png")
    await pg.click("[data-testid=focus-next]"); await pg.wait_for_timeout(2500)
    out["focus_next"] = {"pos": await pg.inner_text("[data-testid=focus-position]"), "media": await pg.evaluate("() => { const m=document.querySelector('[data-testid=focus-stage] [data-testid=box-media]'); const v=m.querySelector('video'); return {role:m.dataset.mediaRole, file:v&&v.currentSrc.split('?')[0].split('/').pop(), ct:v&&+v.currentTime.toFixed(2), paused:v&&v.paused}; }")}
    # full screen
    await pg.click("[data-testid=focus-fullscreen]"); await pg.wait_for_timeout(500)
    out["fullscreen"] = await pg.evaluate("() => !!document.fullscreenElement")
    await pg.evaluate("() => document.exitFullscreen && document.fullscreenElement && document.exitFullscreen()")
    await pg.click("[data-testid=focus-close]"); await pg.wait_for_timeout(500)
    out["back_to_board"] = await pg.evaluate("() => ({focus: !!document.querySelector('[data-testid=focus-view]'), cards: document.querySelectorAll('[data-testid=box-card]').length})")
    # assign the b-roll to a box from the picker, on the board
    await pg.click("[data-box-key=c008] [data-testid=box-add-media]"); await pg.wait_for_selector("[data-testid=media-picker]")
    await pg.click("[data-testid=media-tab-b_roll]"); await pg.wait_for_timeout(300)
    await pg.click("[data-testid=media-row] [data-testid=media-row-assign]"); await pg.wait_for_timeout(1200)
    await pg.click("[data-testid=media-picker-close]")
    out["assign_broll_c008"] = await pg.evaluate("() => document.querySelector('[data-box-key=c008] [data-testid=box-media]')?.dataset.mediaRole")
    out["desktop_logs"] = pg.logs[:6]
    # ---- Review
    await pg.goto(f"{BASE}/projects/{P}/review"); await pg.wait_for_selector("[data-testid=sequence-audio]", state="attached", timeout=60000); await pg.wait_for_timeout(3000)
    out["review_checks"] = await pg.evaluate("() => [...document.querySelectorAll('[data-testid=review-check]')].map(e => e.innerText.replace(/\\n/g,' '))")
    # start at the top and play through the first cuts
    await pg.click("[data-testid=sequence-play]")
    s = []
    for i in range(18):
        await pg.wait_for_timeout(500); s.append(await pg.evaluate(STAGE))
    out["play_from_top"] = s
    # jump by clicking the shot rows, while playing: shot 5 (take), then let it run into 6 (AI clip), jump to 8 (b-roll), 9 (image)
    async def run_from(n, secs):
        await pg.click(f"[data-testid=review-shot] >> nth={n-1}"); r = []
        for i in range(int(secs*2)):
            await pg.wait_for_timeout(500); r.append(await pg.evaluate(STAGE))
        return r
    out["from_shot_5"] = await run_from(5, 9)
    out["from_shot_8"] = await run_from(8, 9)
    out["from_shot_42"] = await run_from(42, 8)
    await pg.screenshot(path="shot_review_desktop.png")
    await pg.click("[data-testid=sequence-play]"); await pg.wait_for_timeout(300)
    out["paused"] = await pg.evaluate(STAGE)
    out["review_logs"] = pg.logs[:6]
async def mobile(b, out):
    pg = await new_page(b, viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
    # like an iPhone: no full screen for anything but a video
    await pg.context.add_init_script("try { delete Element.prototype.requestFullscreen; Element.prototype.requestFullscreen = undefined; } catch (e) {}")
    await pg.goto(f"{BASE}/projects/{P}/storyboard"); await pg.wait_for_selector("[data-testid=box-card]", timeout=60000); await pg.wait_for_timeout(2500)
    out["m_board"] = await pg.evaluate("() => ({w: innerWidth, scrollW: document.documentElement.scrollWidth, cards: document.querySelectorAll('[data-testid=box-card]').length, cardW: Math.round(document.querySelector('[data-testid=box-card]').getBoundingClientRect().width)})")
    await pg.screenshot(path="shot_board_mobile.png")
    await pg.evaluate("() => document.querySelector('[data-box-key=c006]').scrollIntoView({block:'start'})"); await pg.wait_for_timeout(600)
    await pg.screenshot(path="shot_board_mobile_c006.png")
    await pg.tap("[data-box-key=c006] [data-testid=box-open]"); await pg.wait_for_selector("[data-testid=focus-view]"); await pg.wait_for_timeout(2000)
    out["m_focus"] = await pg.evaluate("() => ({pos: document.querySelector('[data-testid=focus-position]').innerText, scrollW: document.documentElement.scrollWidth, stageW: Math.round(document.querySelector('[data-testid=focus-stage]').getBoundingClientRect().width), role: document.querySelector('[data-testid=focus-stage] [data-testid=box-media]')?.dataset.mediaRole})")
    cdp = await pg.context.new_cdp_session(pg)
    async def swipe(x0, x1, y=160):
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y}]})
        steps = 8
        for i in range(1, steps + 1):
            await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0 + (x1 - x0) * i / steps, "y": y}]}); await pg.wait_for_timeout(16)
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); await pg.wait_for_timeout(900)
    pos = "() => document.querySelector('[data-testid=focus-position]')?.innerText ?? ('GONE url=' + location.pathname)"
    await swipe(320, 60); p1 = await pg.evaluate(pos)
    await swipe(320, 60); p2 = await pg.evaluate(pos)
    await swipe(60, 320); p3 = await pg.evaluate(pos)
    out["m_swipe"] = {"after_left": p1, "after_left_again": p2, "after_right": p3}
    hdr = await pg.evaluate("() => { const b=document.querySelector('[data-testid=focus-close]').getBoundingClientRect(); const el=document.elementFromPoint(b.left+b.width/2, b.top+b.height/2); return {closeOnTop: !!(el && el.closest('[data-testid=focus-close]')), top: Math.round(b.top)}; }")
    out["m_header_reachable"] = hdr
    await pg.screenshot(path="shot_focus_mobile.png")
    await pg.tap("[data-testid=focus-fullscreen]"); await pg.wait_for_timeout(700)
    fs = await pg.evaluate("() => { const st=document.querySelector('[data-testid=focus-stage]'); const r=st.getBoundingClientRect(); return {fill: st.dataset.fill, native: !!document.fullscreenElement, w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight}; }")
    await pg.screenshot(path="shot_fill_mobile.png")
    out["m_fullscreen"] = fs
    if fs.get("fill") == "true":
        fp = "() => document.querySelector('[data-testid=focus-fill-position]')?.innerText"
        a = await pg.evaluate(fp); await swipe(320, 60, 420); b2 = await pg.evaluate(fp)
        await pg.screenshot(path="shot_fill_mobile.png")
        await pg.tap("[data-testid=focus-fullscreen]"); await pg.wait_for_timeout(300)
        out["m_fill_swipe"] = {"before": a, "after": b2, "left_fill": await pg.evaluate("() => document.querySelector('[data-testid=focus-stage]').dataset.fill")}
    await pg.tap("[data-testid=focus-close]"); await pg.wait_for_timeout(500)
    out["m_back"] = await pg.evaluate("() => ({focus: !!document.querySelector('[data-testid=focus-view]'), cards: document.querySelectorAll('[data-testid=box-card]').length})")
    await pg.goto(f"{BASE}/projects/{P}/review"); await pg.wait_for_selector("[data-testid=sequence-audio]", state="attached", timeout=60000); await pg.wait_for_timeout(2500)
    await pg.tap("[data-testid=sequence-play]"); await pg.wait_for_timeout(3000)
    out["m_review"] = await pg.evaluate(STAGE)
    out["m_review_layout"] = await pg.evaluate("() => ({w: innerWidth, scrollW: document.documentElement.scrollWidth})")
    await pg.screenshot(path="shot_review_mobile.png")
    out["mobile_logs"] = pg.logs[:6]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**({"executable_path": CHROME} if CHROME else {}))
        out = {}
        for fn in (desktop, mobile):
            try: await fn(b, out)
            except Exception as e: out[fn.__name__ + "_error"] = str(e)[:600]
        json.dump(out, open("result.json", "w"), indent=1); await b.close()
        report(out)

def report(r):
    bad = 0
    for k, v in r.items():
        if k in ("play_from_top", "from_shot_5", "from_shot_8", "from_shot_42"):
            print(k)
            for s in v:
                exp = round(s["t"] - OFFSET, 3) if s["file"] == "take.webm" else None
                d = None if exp is None or s["vt"] is None else round(s["vt"] - max(0, exp), 3)
                # a take that has run out holds its last frame: not a sync error
                held = s["vpaused"] and s["file"] == "take.webm" and s["t"] - OFFSET > 190.3
                if d is not None and abs(d) > 0.1 and not held and s["t"] > OFFSET + 0.1: bad += 1
                print("  ", s["t"], s["active"], s["kind"], s["file"], s["vt"], "drift", d, "held" if held else "")
        else:
            print(k, json.dumps(v)[:300])
    errs = [k for k in r if k.endswith("_error")]
    print("\nRESULT:", "FAIL" if (bad or errs) else "PASS", "· samples off the song clock by > 0.1 s:", bad, "· errors:", errs)
    sys.exit(1 if (bad or errs) else 0)
asyncio.run(main())
