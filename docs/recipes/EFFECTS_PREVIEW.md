# Effects preview: file a small copy each time an effect is built or changed

For post (Grokbot, or any agent that renders effects). Design and contract: [`docs/design/EFFECTS_PREVIEW.md`](../design/EFFECTS_PREVIEW.md).

**Why:** Fendi watches the song in AVT (Review, and the Cut page). Where a preview copy exists, AVT plays it in
place over the song, so he sees what post has built without waiting for a master render. A stretch with no copy
shows the plain clip. The copy is the effect as you rendered it, small; it is never the master.

## Every time a section is rendered or changes

1. **Make the copy** from the finished file of that section (a section render, a chunk, ProRes or MP4):

   ```
   python3 -I scripts/render/preview/make_preview.py <finished file> \
       --section storm_verse --version 3 --song-frames 3070-4980 \
       --label "Storm verse" --built-from lock=LOCK_v1e --built-from script=render_verse_v9look_v1e_p.py \
       --user <owner user id> --project <project id> --out-dir <a folder on the work drive>
   ```

   - `--song-frames FIRST-LAST` are the song frames the file shows (24 fps). Seconds work too: `--song-start` and `--song-end`.
   - If the file starts before the stretch, say where the stretch begins inside it: `--source-start <seconds>`.
   - `--section` is a slug that stays the same across versions. `--version` goes up by one each time.
   - `--plan` prints the command and the record and makes nothing.
   - The script refuses a source that is too short, and a copy whose frame count does not fit the stretch. A refused copy is not filed.

2. **Upload it** to the path the script printed (`upload_to`): bucket `project-exports`,
   `<user>/<project>/effects_preview/<section>_v<N>.mp4`. Through the AVT MCP: `avt_upload_asset` (`signed_url`, PUT
   the file, `finalize`).

3. **File the row** the script printed (`row`) in `project_assets`, adding `user_id` and `project_id`
   (`avt_insert`). Nothing else is written: no shot, no assignment.

4. **Look at it** in AVT → the project → Review. The bar under the song is blue over the stretch, and with
   **Effects on** the copy plays there. Watch the first and last second against the song: frame 0 must be the picture
   at the stretch's first song frame.

## Rules

- One copy per section and version. A new version replaces the old one on screen; the old row stays as the record.
- To take a wrong copy down, set its row's `approval_status` to `rejected`. Do not delete it.
- Two sections may overlap (a grade over a whole half, a spin inside it): the one made later is on top.
- No sound in the copy. The song is the only sound in the player.
- A copy says what was RENDERED. Never file a mock-up, a still frame held for the length, or a file from another
  version of the effect under the current version's number.
- Signed links, tokens and keys never go in chat, a commit or a PR. Media of him or the song is never committed.

## A fast look before the full-size render

The copy does not have to come from the 4K render. A compositor that can run at a smaller size (quarter size is 16
times fewer pixels) can render a section in minutes; file that as the copy, with `--built-from size=preview` so the
record says it was not cut from the master's frames. When the full-size render of the section exists, file the next
version from it.

## What Fendi sees

| On the bar under the song | Means |
|---|---|
| Blue | post has filed a copy for this stretch; it plays with Effects on |
| No colour | nothing filed yet; the plain clip plays |

The label over the picture names the section and version on screen (`effects · Storm verse · v3`).
