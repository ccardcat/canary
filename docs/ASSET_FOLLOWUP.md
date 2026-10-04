# Local asset follow-up

## Changes
- Existing bundled background discovery preserved (PNG/JPG/JPEG/WEBP). Sakura 1 and Sakura 2 use their original JPG application/sidebar pairs, including linked selections and compact previews.
- Automatic ambient chooses Sakura for the default sidebar or a selected Sakura application/sidebar preset. Explicit Off/Snow/Sakura settings are unchanged.
- Cursor options are Canary Custom and System. Saved generated cursor selections migrate to Custom; saved System remains System. No system-wide cursor scheme is installed.
- Six previous generated SVG cursor assets were removed. Native CUR images retain their original dimensions and hotspots.
- Main scrollbar uses an isolated RTL scroll container when the sidebar is right. All direct content subtrees return to LTR, including nested scroll containers. Sidebar artwork stays inside the sidebar and retains user positioning.

## Native cursor mapping
Roles are verified against the supplied `public/cursors/Install.inf` (kept as source metadata, not executed).

| Role | Pack asset |
| --- | --- |
| Arrow | pointer.cur |
| Link/action | link.cur |
| Text | beam.cur |
| Working/progress | working-static.cur |
| Busy/wait | busy-static.cur |
| Move | move.cur |
| Help | help.cur |
| Precision/crosshair | precision.cur |
| Unavailable/disabled | unavailable.cur |
| Horizontal resize | horz.cur |
| Vertical resize | vert.cur |
| NW/SE resize | dgn1.cur |
| NE/SW resize | dgn2.cur |
| Alternate selection | alternate.cur |
| Handwriting | handwriting.cur |
| Person selection | person.cur |
| Location selection | pin.cur |

`busy-static.cur` and `working-static.cur` are lossless native first-frame extractions from the corresponding supplied RIFF ACON ANI files. Originals are retained. CSS/WebView ANI playback is not assumed. Roles without a CSS equivalent use explicit `data-cursor-state` hooks only for appropriate interactions; unused roles do not create fake tools. Missing roles use their semantic system fallback. Vertical text and grab retain system cursors.

## Verification
- npm run build: passed.
- cargo check: passed; backend unchanged.
- Existing appearance/desktop checks: passed, including theme/language geometry, linked/unlinked background persistence, Sakura automatic versus explicit effects, context menu editing.
- Four focused polish tests: passed after fixing busy cursor specificity. They verify both sidebar sides expanded/collapsed, real left/right scrollbar gutters, LTR content, native cursor roles on buttons, editable I-beam, disabled/working states, CUR headers/hotspots, preset migration and System persistence.
- npm run tauri dev: completed compilation and launched the Windows executable; the separate Canary window was confirmed by its native window handle.
- No claim of physical Windows cursor rendering or full native manual interaction QA: native desktop automation is unavailable in this environment. Full OS close/reopen preference selection should be checked manually; automated persistence checks reload the application.
