"""
Drives the REAL app in Chromium against the stand-in backend, at desktop and phone size:
the board, the full-screen shot (the take's range playing in place), assigning footage, Review played against the
song (sampled every half second: which shot is on the stage, which file, and how far its playhead is from where the
song clock says it should be), Review's "Check this cut", the project frame (9:16, then 16:9), timing lyrics to the
song in Setup (a project that has timed lines, and one that has none), swiping between shots on a phone, the
fill-the-screen mode a phone gets, and the Voice Director collapsed to a button on a phone.

  bash scripts/e2e-local/make_media.sh && npx tsx scripts/e2e-local/mkfixtures.ts && bash scripts/e2e-local/start.sh
  python3 scripts/e2e-local/run_storyboard.py        # writes result.json + screenshots beside this file
  bash scripts/e2e-local/stop.sh                     # as its own command
"""
import asyncio, json, os, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get("CHROME_PATH")  # leave unset to use Playwright's own browser
from playwright.async_api import async_playwright
BASE = "http://127.0.0.1:5200"; P = "11111111-1111-4111-8111-111111111111"; P2 = "44444444-4444-4444-8444-444444444444"
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
    # ---- post-production-test hardening: timed beats inside a shot, continuity entities, jobs moved by the server
    out["beats_card"] = await pg.evaluate("() => { const c=document.querySelector('[data-box-key=c007]'); const s=c.querySelector('[data-testid=beats-strip]'); return {beats: s?.dataset.beats, lines: [...c.querySelectorAll('[data-testid=beats-line]')].map(l => ({offset:+l.dataset.offset, by:l.dataset.placedBy, text:l.innerText.replace(/\\s+/g,' ')})), marks: c.querySelectorAll('[data-testid=beats-mark]').length, other: document.querySelectorAll('[data-box-key=c005] [data-testid=beats-strip]').length}; }")
    out["continuity_card"] = await pg.evaluate("() => [...document.querySelectorAll('[data-box-key=c007] [data-testid=box-continuity] [data-entity-kind]')].map(e => [e.dataset.entityKind, e.dataset.entityKey])")
    out["job_c012"] = await pg.evaluate("() => document.querySelector('[data-box-key=c012] [data-testid=box-status]')?.innerText ?? null")
    await pg.click("[data-testid=continuity-toggle]"); await pg.wait_for_selector("[data-testid=entity-card]"); await pg.wait_for_timeout(800)
    out["continuity_panel"] = await pg.evaluate("() => ({summary: document.querySelector('[data-testid=continuity-summary]').innerText, cards: [...document.querySelectorAll('[data-testid=entity-card]')].map(c => ({key:c.dataset.entityKey, kind:c.dataset.entityKind, usage:c.querySelector('[data-testid=entity-usage]').innerText, pictures:[...c.querySelectorAll('[data-testid=entity-picture]')].map(p => p.dataset.approved), loaded:[...c.querySelectorAll('[data-testid=entity-picture] img')].every(i => i.complete && i.naturalWidth > 0)}))})")
    await pg.click("[data-testid=continuity-toggle]")
    await pg.click("[data-box-key=c007] [data-testid=box-open]"); await pg.wait_for_selector("[data-testid=focus-view]"); await pg.wait_for_selector("[data-testid=beats-editor]", timeout=15000); await pg.wait_for_timeout(600)
    out["beats_focus"] = await pg.evaluate("() => ({strip: document.querySelector('[data-testid=focus-view] [data-testid=beats-strip]')?.dataset.beats, state: document.querySelector('[data-testid=focus-view] [data-testid=beats-state]')?.innerText ?? null, rows: document.querySelectorAll('[data-testid=beat-row]').length, plan: document.querySelector('[data-testid=beats-plan]')?.dataset.plan ?? null, planText: document.querySelector('[data-testid=beats-plan]')?.innerText ?? '', stateSelect: [...document.querySelectorAll('[data-testid=beat-lighting-state]')].map(e => e.value), lightInput: [...document.querySelectorAll('[data-testid=beat-lighting]')].map(e => e.value), source: document.querySelector('[data-testid=shot-continuity-source]')?.innerText ?? '', place: document.querySelector('[data-testid=shot-continuity-location]')?.value, notes: [...document.querySelectorAll('[data-testid=beats-note]')].map(e => e.innerText)})")
    await pg.click("[data-testid=focus-close]"); await pg.wait_for_timeout(400)
    # the clip of a shot that changes: the confirm says the beats go as a timed script, and whose picture the place is
    await pg.click("[data-box-key=c007] [data-testid=box-generate-clip]"); await pg.wait_for_selector("[data-testid=confirm-dialog]", timeout=10000)
    out["beats_confirm"] = (await pg.inner_text("[data-testid=confirm-dialog]")).replace("\n", " ")[:1200]
    await pg.click("[data-testid=confirm-cancel]"); await pg.wait_for_timeout(400)
    # focus view on a performance box: the take's range plays in place
    await pg.click("[data-box-key=c005] [data-testid=box-open]"); await pg.wait_for_selector("[data-testid=focus-view]"); await pg.wait_for_timeout(2500)
    f = []
    for i in range(6):
        await pg.wait_for_timeout(500)
        f.append(await pg.evaluate("() => { const v=document.querySelector('[data-testid=focus-stage] video'); return v? {ct:+v.currentTime.toFixed(2), paused:v.paused, rs:v.readyState}:null; }"))
    out["focus_c005_take"] = {"pos": await pg.inner_text("[data-testid=focus-position]"), "expected_range": [round(15.69-OFFSET,2), round(19.61-OFFSET,2)], "samples": f}
    await pg.screenshot(path="shot_focus_desktop.png")
    # the shot's footage as frames: five across the range it plays, and a poster under the player
    await pg.click("[data-testid=focus-tab-media]")
    try: await pg.wait_for_function("() => { const f=[...document.querySelectorAll('[data-testid=focus-media-frame]')]; return f.length >= 5 && f.every(e => e.dataset.state !== 'loading'); }", timeout=60000)
    except Exception: pass
    out["focus_frames"] = await pg.evaluate("() => { const f=[...document.querySelectorAll('[data-testid=focus-media-frame]')]; return {n: f.length, ready: f.filter(e=>e.dataset.state==='ready').length, times: f.map(e=>+(+e.dataset.time).toFixed(2)), poster: document.querySelector('[data-testid=range-video-poster]')?.dataset.state}; }")
    await pg.screenshot(path="shot_focus_frames.png")
    await pg.click("[data-testid=focus-tab-details]")
    await pg.click("[data-testid=focus-next]"); await pg.wait_for_timeout(2500)
    out["focus_next"] = {"pos": await pg.inner_text("[data-testid=focus-position]"), "media": await pg.evaluate("() => { const m=document.querySelector('[data-testid=focus-stage] [data-testid=box-media]'); const v=m.querySelector('video'); return {role:m.dataset.mediaRole, file:v&&v.currentSrc.split('?')[0].split('/').pop(), ct:v&&+v.currentTime.toFixed(2), paused:v&&v.paused}; }")}
    # full screen
    await pg.click("[data-testid=focus-fullscreen]"); await pg.wait_for_timeout(500)
    out["fullscreen"] = await pg.evaluate("() => !!document.fullscreenElement")
    await pg.evaluate("() => document.exitFullscreen && document.fullscreenElement && document.exitFullscreen()")
    await pg.click("[data-testid=focus-close]"); await pg.wait_for_timeout(500)
    out["back_to_board"] = await pg.evaluate("() => ({focus: !!document.querySelector('[data-testid=focus-view]'), cards: document.querySelectorAll('[data-testid=box-card]').length})")
    # an image on a shot is seen in the shot's media list (a place drawn for a take is never what the shot shows)
    await pg.click("[data-box-key=c009] [data-testid=box-open]"); await pg.wait_for_selector("[data-testid=focus-view]"); await pg.click("[data-testid=focus-tab-media]"); await pg.wait_for_timeout(1500)
    out["media_image"] = await pg.evaluate("() => { const i=document.querySelector('[data-testid=focus-media-image]'); return {n: document.querySelectorAll('[data-testid=focus-media-image]').length, loaded: !!i && i.complete && i.naturalWidth > 0}; }")
    await pg.click("[data-testid=focus-close]"); await pg.wait_for_timeout(400)
    # a performance shot's clip is the take restaged: the button says so, with the price, and the confirm says what goes
    out["restage"] = {"clip": (await pg.inner_text("[data-box-key=c005] [data-testid=box-generate-clip]")).strip(), "image": (await pg.inner_text("[data-box-key=c005] [data-testid=box-generate-image]")).strip(),
        "broll_clip": (await pg.inner_text("[data-box-key=c006] [data-testid=box-generate-clip]")).strip(),
        "c010": await pg.evaluate("() => { const m=document.querySelector('[data-box-key=c010] [data-testid=box-media]'); return {role: m?.dataset.mediaRole, base: m?.dataset.mediaBase, text: document.querySelector('[data-box-key=c010]').innerText.includes('restaged')}; }"),
        "c011_base": await pg.evaluate("() => { const m=document.querySelector('[data-box-key=c011] [data-testid=box-media]'); return m ? [m.dataset.mediaRole, m.dataset.mediaBase] : null; }")}
    await pg.click("[data-box-key=c005] [data-testid=box-generate-clip]"); await pg.wait_for_selector("[data-testid=confirm-generate-clip]", timeout=10000)
    out["restage"]["confirm"] = (await pg.inner_text("[data-testid=confirm-dialog]")).replace("\n", " ")[:520]
    await pg.click("[data-testid=confirm-cancel]"); await pg.wait_for_timeout(400)
    # ---- does the clip do what it was asked: shot 10's restaged clip, held against its request — measured, and judged by eye
    await pg.click("[data-box-key=c010] [data-testid=box-open]"); await pg.wait_for_selector("[data-testid=focus-view]"); await pg.click("[data-testid=focus-tab-media]")
    await pg.wait_for_selector("[data-testid=acceptance]", timeout=20000)
    try: await pg.wait_for_function("() => { const b=document.querySelector('[data-testid=beat-check]'); return b && !['measuring','unmeasured'].includes(b.dataset.verdict); }", timeout=90000)
    except Exception: pass
    ACC = "() => { const a=document.querySelector('[data-testid=acceptance]'); return {verdict: a.dataset.verdict, line: a.querySelector('[data-testid=acceptance-line]').innerText, lines: [...a.querySelectorAll('[data-testid=acceptance-requirement]')].map(e => [e.dataset.requirement, e.dataset.finding, e.dataset.source, e.dataset.measured]), chip: document.querySelector('[data-testid=focus-media-item] [data-testid=acceptance-chip]')?.dataset.verdict, watch: a.querySelector('[data-testid=acceptance-watch]')?.innerText ?? null, beat: document.querySelector('[data-testid=beat-check]')?.dataset.verdict}; }"
    acc = {"before": await pg.evaluate(ACC)}
    await pg.click("[data-testid=acceptance-requirement][data-requirement=camera] [data-testid=acceptance-fails]")
    await pg.fill("[data-testid=acceptance-note]", "no push toward him"); await pg.click("[data-testid=acceptance-keep]")
    try: await pg.wait_for_selector("[data-testid=acceptance-requirement][data-requirement=camera][data-source=by_eye]", timeout=15000)
    except Exception: pass
    acc["judged"] = await pg.evaluate(ACC)
    acc["camera_text"] = await pg.evaluate("() => document.querySelector('[data-testid=acceptance-requirement][data-requirement=camera]')?.innerText.replace(/\\n/g,' ') ?? null")
    out["acceptance"] = acc
    await pg.click("[data-testid=focus-close]"); await pg.wait_for_timeout(400)
    # assign the b-roll to a box from the picker, on the board
    await pg.click("[data-box-key=c008] [data-testid=box-add-media]"); await pg.wait_for_selector("[data-testid=media-picker]")
    await pg.click("[data-testid=media-tab-b_roll]"); await pg.wait_for_timeout(300)
    await pg.click("[data-testid=media-row] [data-testid=media-row-assign]"); await pg.wait_for_timeout(1200)
    await pg.click("[data-testid=media-picker-close]")
    out["assign_broll_c008"] = await pg.evaluate("() => document.querySelector('[data-box-key=c008] [data-testid=box-media]')?.dataset.mediaRole")
    out["desktop_logs"] = pg.logs[:6]
    # ---- Treatment: an edit keeps what it replaced, and an earlier version can be restored
    await pg.goto(f"{BASE}/projects/{P}/treatment"); await pg.wait_for_selector("[data-testid=treatment-saved-text]", timeout=60000); await pg.wait_for_timeout(800)
    tv = {"before": await pg.inner_text("[data-testid=treatment-saved-text]")}
    await pg.click("[data-testid=treatment-view-versions]"); await pg.wait_for_timeout(500)
    tv["versions_before"] = await pg.locator("[data-testid=treatment-version]").count()
    await pg.click("[data-testid=treatment-view-current]"); await pg.click("[data-testid=treatment-edit]")
    await pg.fill("[data-testid=treatment-text]", "A new idea entirely: everything happens under water."); await pg.click("[data-testid=treatment-save]")
    await pg.wait_for_function("() => document.querySelector('[data-testid=treatment-saved-text]')?.innerText.includes('under water')", timeout=15000)
    await pg.click("[data-testid=treatment-view-versions]"); await pg.wait_for_selector("[data-testid=treatment-version]", timeout=15000)
    tv["versions_after_edit"] = await pg.locator("[data-testid=treatment-version]").count()
    tv["kept"] = await pg.evaluate("() => { const v=document.querySelector('[data-testid=treatment-version]'); return {by: v.dataset.replacedBy, text: v.innerText.replace(/\\s+/g,' ').slice(0,200)}; }")
    await pg.click("[data-testid=treatment-version-open]"); await pg.click("[data-testid=treatment-version-restore]"); await pg.click("[data-testid=confirm-restore-treatment]")
    await pg.click("[data-testid=treatment-view-current]")
    await pg.wait_for_function("() => document.querySelector('[data-testid=treatment-saved-text]')?.innerText.includes('single hard light')", timeout=15000)
    tv["after_restore"] = await pg.inner_text("[data-testid=treatment-saved-text]")
    # the restore ends by showing the current treatment again (after its refresh): opening Versions before it has
    # finished is undone by it. Wait for the restore to say it is done, then open the list.
    await pg.wait_for_function("() => document.body.innerText.includes('Version restored')", timeout=15000)
    await pg.click("[data-testid=treatment-view-versions]")
    await pg.wait_for_function("() => document.querySelectorAll('[data-testid=treatment-version]').length >= 2", timeout=15000)
    tv["versions_after_restore"] = await pg.evaluate("() => [...document.querySelectorAll('[data-testid=treatment-version]')].map(v => v.dataset.replacedBy)")
    out["treatment_versions"] = tv
    # ---- Video variations: a new one starts empty and leaves the first untouched; a duplicate carries the shots; the chip names it
    vr = {"active_before": await pg.inner_text("[data-testid=variation-active-name]"), "chip_before": await pg.inner_text("[data-testid=page-context]")}
    await pg.click("[data-testid=variation-switcher-trigger]"); await pg.click("[data-testid=variation-new]"); await pg.wait_for_selector("[data-testid=variation-dialog]")
    await pg.fill("[data-testid=variation-name]", "Interrupted Broadcast"); await pg.fill("[data-testid=variation-treatment]", "A broadcast truck idles in the snow. The signal cuts in and out.")
    await pg.click("[data-testid=variation-submit]")
    await pg.wait_for_function("() => document.querySelector('[data-testid=variation-active-name]')?.innerText.includes('Interrupted Broadcast')", timeout=15000); await pg.wait_for_timeout(800)
    await pg.click("[data-testid=treatment-view-current]"); await pg.wait_for_selector("[data-testid=treatment-saved-text]", timeout=15000)
    vr["new_treatment"] = await pg.inner_text("[data-testid=treatment-saved-text]")
    vr["chip_new"] = await pg.inner_text("[data-testid=page-context]")
    await pg.goto(f"{BASE}/projects/{P}/storyboard"); await pg.wait_for_selector("[data-testid=variation-active-name]", timeout=60000); await pg.wait_for_timeout(2500)
    vr["new_cards"] = await pg.locator("[data-box-key]").count()
    vr["new_entities"] = await pg.evaluate("() => (document.querySelector('[data-testid=continuity-summary]')?.innerText ?? '')")
    # back to the first: everything is as it was
    await pg.click("[data-testid=variation-switcher-trigger]"); await pg.click("[data-testid=variation-option][data-active=false]")
    await pg.wait_for_function("() => document.querySelector('[data-testid=variation-active-name]')?.innerText.includes('Original')", timeout=15000)
    await pg.wait_for_selector("[data-box-key=c042]", timeout=30000); await pg.wait_for_timeout(800)
    vr["first_cards"] = await pg.locator("[data-box-key]").count()
    vr["first_c008"] = await pg.evaluate("() => document.querySelector('[data-box-key=c008] [data-testid=box-media]')?.dataset.mediaRole")
    await pg.goto(f"{BASE}/projects/{P}/treatment"); await pg.wait_for_selector("[data-testid=treatment-view-current]", timeout=60000); await pg.click("[data-testid=treatment-view-current]"); await pg.wait_for_selector("[data-testid=treatment-saved-text]", timeout=15000)
    vr["first_treatment"] = await pg.inner_text("[data-testid=treatment-saved-text]")
    # a duplicate carries the shots and the footage on them
    await pg.click("[data-testid=variation-switcher-trigger]"); await pg.click("[data-testid=variation-duplicate]"); await pg.wait_for_selector("[data-testid=variation-dialog]")
    await pg.fill("[data-testid=variation-name]", "Runway alt"); await pg.click("[data-testid=variation-submit]")
    await pg.wait_for_function("() => document.querySelector('[data-testid=variation-active-name]')?.innerText.includes('Runway alt')", timeout=15000)
    await pg.goto(f"{BASE}/projects/{P}/storyboard"); await pg.wait_for_selector("[data-box-key=c042]", timeout=60000); await pg.wait_for_timeout(800)
    vr["dup_cards"] = await pg.locator("[data-box-key]").count()
    vr["dup_c008"] = await pg.evaluate("() => document.querySelector('[data-box-key=c008] [data-testid=box-media]')?.dataset.mediaRole")
    vr["dup_shot_ids_differ"] = await pg.evaluate("() => { const a=[...document.querySelectorAll('[data-box-key]')].map(e=>e.dataset.boxId).filter(Boolean); return a.length > 0 && !a.some(x => x.startsWith('aaaaaaaa-')); }")
    # leave the project in the first variation for the rest of the run
    await pg.click("[data-testid=variation-switcher-trigger]"); await pg.click("[data-testid=variation-option]:has-text('Original')")
    await pg.wait_for_function("() => document.querySelector('[data-testid=variation-active-name]')?.innerText.includes('Original')", timeout=15000); await pg.wait_for_timeout(500)
    out["variations"] = vr
    # ---- Export: the render contract, as it is — and no claim to render
    await pg.goto(f"{BASE}/projects/{P}/export"); await pg.wait_for_selector("[data-testid=render-contract]", timeout=60000); await pg.wait_for_timeout(800)
    out["render_contract"] = await pg.evaluate("() => ({ready: document.querySelector('[data-testid=render-contract]').dataset.ready, summary: document.querySelector('[data-testid=render-contract-summary]').innerText, notes: document.querySelector('[data-testid=render-contract-notes]')?.innerText ?? '', blockers: document.querySelector('[data-testid=render-contract-blockers]')?.innerText ?? '', boundary: document.querySelector('[data-testid=render-contract-boundary]').innerText})")
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
    # shot 7 changes while it plays: the edit's blackout lands on the sung line, on the song clock, and holds to the cut
    await pg.click("[data-testid=review-shot] >> nth=6"); fx = []
    for i in range(9):
        await pg.wait_for_timeout(500)
        fx.append(await pg.evaluate("() => { const a=document.querySelector('[data-testid=sequence-audio]'); const p=document.querySelector('[data-testid=sequence-player]'); const l=document.querySelector('[data-testid=sequence-picture]'); return {t:+a.currentTime.toFixed(2), active:p.dataset.activeShot, filter: l.style.filter || 'none'}; }"))
    out["effect_shot_7"] = fx
    # shot 10 shows its take RESTAGED: a clip made from the take, played by the song clock like the take itself; shot 11 is not it
    out["from_shot_10"] = await run_from(10, 5)
    out["from_shot_42"] = await run_from(42, 8)
    await pg.screenshot(path="shot_review_desktop.png")
    await pg.click("[data-testid=sequence-play]"); await pg.wait_for_timeout(300)
    out["paused"] = await pg.evaluate(STAGE)
    # ---- Check this cut: the files opened and decoded, the cut run against the song clock, the player read back
    await pg.click("[data-testid=review-verify]"); await pg.wait_for_selector("[data-testid=review-verify-result]", timeout=180000)
    out["check_cut"] = await pg.evaluate("""() => { const r=document.querySelector('[data-testid=review-verify-result]');
      return {ok: r.dataset.ok, window: r.dataset.window, summary: document.querySelector('[data-testid=review-verify-summary]').innerText,
        checks: [...document.querySelectorAll('[data-testid=review-verify-check]')].map(e => [e.dataset.id, e.dataset.ok, e.innerText.replace(/\\n/g,' ').slice(0,200)]),
        files: [...document.querySelectorAll('[data-testid=review-verify-file]')].map(e => [e.dataset.use, e.dataset.ok, e.textContent.slice(0,160)]),
        cuts: document.querySelectorAll('[data-testid=review-verify-cut]').length,
        notChecked: document.querySelector('[data-testid=review-verify-not-checked]').innerText}; }""")
    # ---- and beside it, apart: whether the cut's generated clips do what they were asked
    out["review_acceptance"] = await pg.evaluate("""() => { const c=document.querySelector('[data-testid=review-acceptance]');
      return {card: c ? {verdict: c.dataset.verdict, fails: c.dataset.fails, clips: [...c.querySelectorAll('[data-testid=review-acceptance-clip]')].map(e => [e.dataset.boxKey, e.dataset.verdict, e.innerText.replace(/\\n/g,' ').slice(0,160)])} : null,
        said: document.querySelector('[data-testid=review-verify-accepted]')?.innerText ?? null, chips: [...document.querySelectorAll('[data-testid=review-shot] [data-testid=acceptance-chip]')].map(e => e.dataset.verdict),
        check: [...document.querySelectorAll('[data-testid=review-check]')].map(e => [e.dataset.ok, e.innerText.replace(/\\n/g,' ')]).filter(c => c[1].includes('Generated clips'))}; }""")
    # ---- the cut at a glance: one frame per shot, decoded from the files without a player
    await pg.click("[data-testid=contact-sheet-toggle]")
    try: await pg.wait_for_function("() => { const f=[...document.querySelectorAll('[data-testid=contact-sheet-frame]')]; return f.length > 30 && f.every(e => e.dataset.state !== 'loading'); }", timeout=120000)
    except Exception: pass
    out["contact_sheet"] = await pg.evaluate("""() => { const shots=[...document.querySelectorAll('[data-testid=contact-sheet-shot]')]; const f=[...document.querySelectorAll('[data-testid=contact-sheet-frame]')];
      const lit = (c) => { try { const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let s=0; for (let i=0;i<d.length;i+=97) s+=d[i]; return s>0; } catch (e) { return false; } };
      return {shots: shots.length, frames: f.length, ready: f.filter(e=>e.dataset.state==='ready').length, failed: f.filter(e=>e.dataset.state==='failed').map(e=>e.dataset.note), drawn: f.filter(e=>e.dataset.state==='ready' && lit(e)).length,
        images: document.querySelectorAll('[data-testid=contact-sheet-image]').length, c001: f[0] && +f[0].dataset.time, c002: f[1] && +f[1].dataset.time}; }""")
    await pg.locator("[data-testid=contact-sheet-card]").screenshot(path="shot_contact_sheet.png")
    await pg.click("[data-testid=contact-sheet-toggle]")
    # ---- a section of the cut: the player, the list and the frames show shots 5-10 only; the link carries it
    await pg.select_option("[data-testid=review-section-from]", "5"); await pg.select_option("[data-testid=review-section-to]", "10"); await pg.wait_for_timeout(1200)
    sec = {"attr": await pg.get_attribute("[data-testid=review-section]", "data-section"), "summary": await pg.inner_text("[data-testid=review-section-summary]"), "rows": await pg.locator("[data-testid=review-shot]").count(),
        "url": pg.url.split("?")[-1], "stage": await pg.evaluate(STAGE), "scrub_min": await pg.get_attribute("[data-testid=sequence-scrub]", "min")}
    await pg.click("[data-testid=contact-sheet-toggle]")
    try: await pg.wait_for_function("() => { const f=[...document.querySelectorAll('[data-testid=contact-sheet-frame]')]; return f.length >= 15 && f.every(e => e.dataset.state !== 'loading'); }", timeout=120000)
    except Exception: pass
    sec["sheet"] = await pg.evaluate("() => ({close: document.querySelector('[data-testid=contact-sheet]')?.dataset.close, shots: document.querySelectorAll('[data-testid=contact-sheet-shot]').length, frames: document.querySelectorAll('[data-testid=contact-sheet-frame]').length, ready: [...document.querySelectorAll('[data-testid=contact-sheet-frame]')].filter(e=>e.dataset.state==='ready').length, c010: [...document.querySelectorAll('[data-box-key=c010] [data-testid=contact-sheet-frame]')].map(e=>+(+e.dataset.time).toFixed(2))})")
    await pg.click("[data-testid=sequence-play]"); await pg.wait_for_timeout(1500); sec["playing"] = await pg.evaluate(STAGE)
    await pg.click("[data-testid=sequence-play]"); await pg.wait_for_timeout(300)
    await pg.click("[data-testid=contact-sheet-toggle]")
    await pg.click("[data-testid=review-section-clear]"); await pg.wait_for_timeout(800)
    sec["cleared"] = {"attr": await pg.get_attribute("[data-testid=review-section]", "data-section"), "rows": await pg.locator("[data-testid=review-shot]").count(), "url_has_from": "from=" in pg.url}
    out["section"] = sec
    # ---- the project frame: 9:16 by default; changed in Setup, Review and the full-screen shot follow
    FRAME = "() => { const st=document.querySelector('[data-testid=sequence-stage]'); const r=st.getBoundingClientRect(); return {aspect: st.dataset.aspect, ratio: +(r.width/r.height).toFixed(3)}; }"
    out["frame_default"] = await pg.evaluate(FRAME)
    await pg.goto(f"{BASE}/projects/{P}/setup"); await pg.wait_for_selector("[data-testid=setup-aspect]", timeout=60000); await pg.wait_for_timeout(1500)
    out["setup_frame_default"] = await pg.input_value("[data-testid=setup-aspect]")
    await pg.select_option("[data-testid=setup-aspect]", "16:9"); await pg.wait_for_timeout(1500)
    await pg.goto(f"{BASE}/projects/{P}/review"); await pg.wait_for_selector("[data-testid=sequence-audio]", state="attached", timeout=60000); await pg.wait_for_timeout(2000)
    out["frame_16_9"] = await pg.evaluate(FRAME)
    await pg.goto(f"{BASE}/projects/{P}/storyboard"); await pg.wait_for_selector("[data-testid=box-card]", timeout=60000); await pg.wait_for_timeout(1500)
    await pg.click("[data-box-key=c005] [data-testid=box-open]"); await pg.wait_for_selector("[data-testid=focus-view]"); await pg.wait_for_timeout(1200)
    out["focus_frame_16_9"] = await pg.evaluate("() => { const st=document.querySelector('[data-testid=focus-stage]'); const r=st.getBoundingClientRect(); return {aspect: st.dataset.aspect, ratio: +(r.width/r.height).toFixed(3)}; }")
    await pg.click("[data-testid=focus-close]")
    await pg.goto(f"{BASE}/projects/{P}/setup"); await pg.wait_for_selector("[data-testid=setup-aspect]", timeout=60000); await pg.wait_for_timeout(1500)
    await pg.select_option("[data-testid=setup-aspect]", "9:16"); await pg.wait_for_timeout(1500)
    out["setup_frame_restored"] = await pg.input_value("[data-testid=setup-aspect]")
    # ---- lyric timing on a project that already has timed lines: time again, compare, discard — nothing saved
    out["lyrics_timed_before"] = await pg.inner_text("[data-testid=setup-lyrics-timed]")
    await pg.click("[data-testid=setup-lyrics-align]"); await pg.wait_for_selector("[data-testid=setup-lyrics-preview]", timeout=180000)
    out["lyrics_retime"] = {"summary": await pg.inner_text("[data-testid=setup-lyrics-summary]"), "compare": await pg.inner_text("[data-testid=setup-lyrics-compare]"),
        "lines": await pg.evaluate("() => [...document.querySelectorAll('[data-testid=setup-lyrics-line]')].slice(0,4).map(e => e.innerText.replace(/\\s+/g,' '))"), "save_label": await pg.inner_text("[data-testid=setup-lyrics-save]")}
    await pg.click("[data-testid=setup-lyrics-discard]"); await pg.wait_for_timeout(400)
    out["lyrics_retime_discarded"] = {"preview_gone": await pg.locator("[data-testid=setup-lyrics-preview]").count() == 0, "still": await pg.inner_text("[data-testid=setup-lyrics-timed]")}
    # ---- lyric timing on a project that has a song and plain lyrics only: time, look, save
    await pg.goto(f"{BASE}/projects/{P2}/setup"); await pg.wait_for_selector("[data-testid=setup-lyrics-untimed]", timeout=60000); await pg.wait_for_timeout(1500)
    out["untimed_before"] = (await pg.inner_text("[data-testid=setup-lyrics-untimed]")).replace("\n", " ")[:160]
    await pg.click("[data-testid=setup-lyrics-align]"); await pg.wait_for_selector("[data-testid=setup-lyrics-preview]", timeout=180000)
    out["untimed_preview"] = {"summary": await pg.inner_text("[data-testid=setup-lyrics-summary]"), "lines": await pg.evaluate("() => [...document.querySelectorAll('[data-testid=setup-lyrics-line]')].map(e => e.innerText.replace(/\\s+/g,' '))")}
    await pg.click("[data-testid=setup-lyrics-save]"); await pg.wait_for_selector("[data-testid=setup-lyrics-timed]", timeout=30000)
    out["untimed_saved"] = await pg.inner_text("[data-testid=setup-lyrics-timed]")
    out["desktop_voice_director"] = await pg.evaluate("() => { const vis = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; return {panel: vis(document.querySelector('[data-testid=voice-director-panel]')), button: vis(document.querySelector('[data-testid=voice-director-open]'))}; }")
    out["review_logs"] = pg.logs[:6]
async def mobile(b, out):
    pg = await new_page(b, viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
    # like an iPhone: no full screen for anything but a video
    await pg.context.add_init_script("try { delete Element.prototype.requestFullscreen; Element.prototype.requestFullscreen = undefined; } catch (e) {}")
    await pg.goto(f"{BASE}/projects/{P}/storyboard"); await pg.wait_for_selector("[data-testid=box-card]", timeout=60000); await pg.wait_for_timeout(2500)
    out["m_board"] = await pg.evaluate("() => ({w: innerWidth, scrollW: document.documentElement.scrollWidth, cards: document.querySelectorAll('[data-testid=box-card]').length, cardW: Math.round(document.querySelector('[data-testid=box-card]').getBoundingClientRect().width)})")
    await pg.screenshot(path="shot_board_mobile.png")
    # the Voice Director is a button on a phone: it opens to a sheet and closes back to the button
    VD = "() => { const vis = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; const b=document.querySelector('[data-testid=voice-director-open]'); const r=b? b.getBoundingClientRect():null; return {panel: vis(document.querySelector('[data-testid=voice-director-panel]')), button: vis(b), buttonSize: r? [Math.round(r.width), Math.round(r.height)]:null}; }"
    vd = {"closed": await pg.evaluate(VD)}
    await pg.tap("[data-testid=voice-director-open]"); await pg.wait_for_timeout(300); vd["opened"] = await pg.evaluate(VD)
    await pg.screenshot(path="shot_voice_director_mobile.png")
    await pg.tap("[data-testid=voice-director-close]"); await pg.wait_for_timeout(300); vd["closed_again"] = await pg.evaluate(VD)
    out["m_voice_director"] = vd
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
        if k in ("play_from_top", "from_shot_5", "from_shot_8", "from_shot_10", "from_shot_42"):
            print(k)
            for s in v:
                exp = round(s["t"] - OFFSET, 3) if s["file"] == "take.mp4" else round(s["t"] - 35.29, 3) if s["file"] == "restaged.mp4" else None
                d = None if exp is None or s["vt"] is None else round(s["vt"] - max(0, exp), 3)
                # a take that has run out holds its last frame: not a sync error
                held = s["vpaused"] and s["file"] == "take.mp4" and s["t"] - OFFSET > 190.3
                if d is not None and abs(d) > 0.1 and not held and s["t"] > OFFSET + 0.1: bad += 1
                print("  ", s["t"], s["active"], s["kind"], s["file"], s["vt"], "drift", d, "held" if held else "")
        else:
            print(k, json.dumps(v)[:300])
    errs = [k for k in r if k.endswith("_error")]
    def want(name, cond):
        if not cond: errs.append("EXPECTED " + name)
    cc = r.get("check_cut") or {}
    want("check this cut: passes", cc.get("ok") == "true")
    want("check this cut: every line holds, the player read back", all(c[1] == "true" for c in cc.get("checks", [])) and len(cc.get("checks", [])) >= 12)
    want("check this cut: 43 shots listed", cc.get("cuts") == 43)
    want("media list: an image on a shot is shown", (r.get("media_image") or {}).get("n") == 1 and (r.get("media_image") or {}).get("loaded") is True)
    rs = r.get("restage") or {}
    want("restage: a performance shot offers its take restaged, priced", rs.get("clip", "").startswith("Restage") and "$2.36" in rs.get("clip", "") and rs.get("image", "").startswith("Place") and rs.get("broll_clip", "").startswith("Clip"))
    want("restage: the confirm names the take, its range and the seconds", "performance take.mp4" in rs.get("confirm", "") and "4 s of the take" in rs.get("confirm", "") and "0:14.8" in rs.get("confirm", ""))
    want("restage: the restaged clip shows on its shot as the take, restaged", (rs.get("c010") or {}).get("role") == "performance" and (rs.get("c010") or {}).get("text") is True)
    want("restage: the next shot's base layer is the take as filmed", rs.get("c011_base") is None or rs.get("c011_base") == ["performance", "true"])
    r10 = r.get("from_shot_10") or []
    want("restage: Review plays the restaged clip on shot 10, then leaves it", any(s["file"] == "restaged.mp4" for s in r10) and any(s["active"] != r10[0]["active"] and s["file"] != "restaged.mp4" for s in r10))
    sec = r.get("section") or {}
    want("section: shots 5-10 only, 23.5 s, in the link", sec.get("attr") == "5-10" and sec.get("rows") == 6 and "from=5" in sec.get("url", "") and "to=10" in sec.get("url", "") and "23.5 s" in sec.get("summary", ""))
    want("section: the playhead starts where the section starts and plays inside it", abs(float(sec.get("scrub_min") or 0) - 15.69) < 0.01 and 15.6 < (sec.get("stage") or {}).get("t", 0) < 15.8 and (sec.get("playing") or {}).get("active") == "c005")
    want("section: three frames a shot, the restaged take's from its own file", (sec.get("sheet") or {}).get("close") == "true" and (sec.get("sheet") or {}).get("shots") == 6 and (sec.get("sheet") or {}).get("ready", 0) >= 12 and len((sec.get("sheet") or {}).get("c010", [])) == 3 and max((sec.get("sheet") or {}).get("c010", [9])) < 4.1)
    want("section: cleared back to the whole song", (sec.get("cleared") or {}).get("attr") == "all" and (sec.get("cleared") or {}).get("rows") == 43 and (sec.get("cleared") or {}).get("url_has_from") is False)
    cs = r.get("contact_sheet") or {}
    want("contact sheet: a frame drawn for every shot on an MP4", cs.get("shots") == 43 and cs.get("drawn", 0) >= 39 and cs.get("images") == 1)
    ff = r.get("focus_frames") or {}
    want("focus: five frames across the shot's range, and a poster", ff.get("n") == 5 and ff.get("ready") == 5 and ff.get("poster") == "ready" and ff.get("times", [0])[0] >= 14.8 and ff.get("times", [99])[-1] <= 18.8)
    want("frame: 9:16 by default", (r.get("frame_default") or {}).get("aspect") == "9:16" and abs((r.get("frame_default") or {}).get("ratio", 0) - 9 / 16) < 0.01)
    want("frame: Review follows 16:9", (r.get("frame_16_9") or {}).get("aspect") == "16:9" and abs((r.get("frame_16_9") or {}).get("ratio", 0) - 16 / 9) < 0.02)
    want("frame: the full-screen shot follows 16:9", (r.get("focus_frame_16_9") or {}).get("aspect") == "16:9")
    want("frame: restored to 9:16", r.get("setup_frame_restored") == "9:16")
    want("lyrics: time again shows a comparison and saves nothing", "15" in (r.get("lyrics_retime") or {}).get("compare", "") and (r.get("lyrics_retime_discarded") or {}).get("preview_gone") is True)
    want("lyrics: an untimed project is timed and saved", "15" in (r.get("untimed_saved") or ""))
    vd = r.get("m_voice_director") or {}
    want("voice director: a button on a phone", vd.get("closed") and vd["closed"]["button"] and not vd["closed"]["panel"])
    want("voice director: opens", vd.get("opened") and vd["opened"]["panel"])
    want("voice director: closes back to the button", vd.get("closed_again") and vd["closed_again"]["button"] and not vd["closed_again"]["panel"])
    want("voice director: expanded on desktop", (r.get("desktop_voice_director") or {}).get("panel") is True and (r.get("desktop_voice_director") or {}).get("button") is False)
    # ---- post-production-test hardening
    bc = r.get("beats_card") or {}
    lines = bc.get("lines") or []
    want("beats: the card shows the shot's two timed beats, one line each", bc.get("beats") == "2" and len(lines) == 2 and bc.get("marks") == 2 and bc.get("other") == 0)
    want("beats: a beat hung on a sung line sits where the line is sung", len(lines) == 2 and lines[0]["by"] == "lyric" and abs(lines[0]["offset"] - 1.61) < 0.02 and "the house lights die" in lines[0]["text"] and abs(lines[1]["offset"] - 2.6) < 0.02)
    want("beats: a beat that switches to a lighting state says that state's own words", len(lines) == 2 and "Blackout, ice key" in lines[1]["text"] and "the only light is the glitter" in lines[1]["text"])
    bf = r.get("beats_focus") or {}
    want("beats: the full-screen shot shows them and its editor opens on them", bf.get("strip") == "2" and bf.get("rows") == 2 and bf.get("stateSelect") == ["", "BLACKOUT_ICE_KEY"])
    want("beats: the record keeps the pointer to the lighting state, not a copy of its words", bf.get("lightInput") == ["the house lights die", ""])
    want("beats: generating says what it does with them before anything is spent", bf.get("plan") == "timed_script" and "measured so far" in bf.get("planText", "") and "early on average" in bf.get("planText", ""))
    want("beats: a light change asked of the footage under the edit's own blackout is pointed out", len(bf.get("notes") or []) == 1 and "seen through it" in bf["notes"][0])
    conf = r.get("beats_confirm", "")
    want("beats: the restage confirm lists the beats, says what the timing measured", "This shot changes while it plays" in conf and "script with times" in conf and "measured so far" in conf and "early on average" in conf)
    want("continuity: the shot points at its place and its light", r.get("continuity_card") == [["location", "BLACK_RUNWAY"], ["lighting", "RUNWAY_NORMAL"]])
    want("continuity: restaging uses the place's approved picture, the same for every shot set there", "approved picture of Black Runway" in conf and "approved picture of Black Runway" in bf.get("source", "") and bf.get("place") == "BLACK_RUNWAY")
    cp = r.get("continuity_panel") or {}
    cards = {c["key"]: c for c in cp.get("cards", [])}
    want("continuity: the project's entities, each once, with the shots that use them", cp.get("summary") == "1 location · 2 lighting states" and cards.get("BLACK_RUNWAY", {}).get("usage") == "Used by shots 4, 7" and cards.get("BLACKOUT_ICE_KEY", {}).get("usage") == "Used by shot 7")
    want("continuity: the place's approved picture is shown", cards.get("BLACK_RUNWAY", {}).get("pictures") == ["true"] and cards.get("BLACK_RUNWAY", {}).get("loaded") is True)
    fx = r.get("effect_shot_7") or []
    on7 = [x for x in fx if x["active"] == "c007"]
    want("effect: as filmed before the beat", any(x["filter"] == "none" and x["t"] < 23.53 + 1.55 for x in on7))
    want("effect: the blackout is on the picture after the beat and holds", any("brightness(0.1) contrast(1.6)" in x["filter"] and x["t"] > 23.53 + 1.9 for x in on7))
    want("effect: the next shot starts as filmed", all(x["filter"] == "none" for x in fx if x["active"] == "c008") )
    tv = r.get("treatment_versions") or {}
    want("treatment: an edit keeps the version it replaced", tv.get("versions_before") == 0 and tv.get("versions_after_edit") == 1 and (tv.get("kept") or {}).get("by") == "edit" and "single hard light" in (tv.get("kept") or {}).get("text", ""))
    want("treatment: an earlier version is restored, and what it replaced is kept too", "single hard light" in tv.get("after_restore", "") and tv.get("versions_after_restore") == ["restore", "edit"])
    vr = r.get("variations") or {}
    want("variations: the chip on the page names the one being worked in", vr.get("chip_before") == "Original" and vr.get("chip_new") == "Interrupted Broadcast")
    want("variations: a new one starts with its own treatment, an empty board and no entities", "broadcast truck" in vr.get("new_treatment", "") and vr.get("new_cards") == 0 and "1 location" not in (vr.get("new_entities") or ""))
    want("variations: switching back finds the first as it was", vr.get("first_cards") == 43 and vr.get("first_c008") == "b_roll" and "single hard light" in vr.get("first_treatment", ""))
    want("variations: a duplicate carries the shots and their footage under new ids", vr.get("dup_cards") == 43 and vr.get("dup_c008") == "b_roll" and vr.get("dup_shot_ids_differ") is True)
    rc = r.get("render_contract") or {}
    want("export: the render contract is the whole cut, frame by frame", "43 shots" in rc.get("summary", "") and "at 30 fps" in rc.get("summary", "") and "1080×1920" in rc.get("summary", ""))
    want("export: it says what a render would and would not contain, and that the app does not render", "effects are applied on shot 7" in rc.get("notes", "") and "must already be in the footage" in rc.get("notes", "") and "does not make the finished video" in rc.get("boundary", ""))
    # ---- playing is not passing
    ac = r.get("acceptance") or {}
    b4 = ac.get("before") or {}; af = ac.get("judged") or {}
    want("acceptance: a restaged clip with a timed script is asked seven things", [l[0] for l in b4.get("lines", [])] == ["timing", "framing", "lips", "lighting", "camera", "integrity", "action"])
    want("acceptance: timing is what was measured off the file; what nothing looked at is not verified", (b4.get("lines") or [[None] * 4])[0][2] == "measured" and all(l[1] == "unverified" and l[2] == "none" for l in b4.get("lines", [])[1:]) and b4.get("verdict") in ("fails", "unverified"))
    want("acceptance: lip sync names the exact stretch to watch with the song", "watch shot 10 with the song, 0:35.29–0:39.22" in (b4.get("watch") or ""))
    want("acceptance: a judgement by eye is kept on the clip with its note, marked as seen not measured", (af.get("lines") or [[None] * 4] * 5)[4][:3] == ["camera", "fails", "by_eye"] and "no push toward him" in (ac.get("camera_text") or "") and af.get("verdict") == "fails" and af.get("chip") == "fails")
    ra = r.get("review_acceptance") or {}
    want("acceptance: Review lists the clip against what it was asked, apart from whether the cut plays", (ra.get("card") or {}).get("verdict") == "fails" and [c[:2] for c in (ra.get("card") or {}).get("clips", [])] == [["c010", "fails"]] and "camera and movement" in (ra.get("card") or {}).get("clips", [[0, 0, ""]])[0][2])
    want("acceptance: a cut that plays says that is not the same as its clips doing what was asked", cc.get("ok") == "true" and "not whether its clips do what they were asked" in (ra.get("said") or "") and ra.get("chips") == ["fails"] and [c[0] for c in ra.get("check", [])] == ["false"])
    log = open("backend.log").read()
    want("jobs: the page asks the server to move its unfinished job", "provider-jobs-tick" in log and (r.get("job_c012") or "").startswith("rendering the clip"))
    want("jobs: the page polls no provider and saves no clip itself", "proxy-provider-call" not in log and "ingest-provider-job" not in log)
    print("\nRESULT:", "FAIL" if (bad or errs) else "PASS", "· samples off the song clock by > 0.1 s:", bad, "· errors:", errs)
    sys.exit(1 if (bad or errs) else 0)
asyncio.run(main())
