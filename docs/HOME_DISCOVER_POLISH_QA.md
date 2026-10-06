# Home, Discover and project detail polish

QA date: 2026-10-06. Starting source: `main` at
`b2e89c50970f21b4a0ec54ccc268bcdf0416edde`.

## Result and scope

This pass integrates into the existing React/Tauri application. It does not
change Rust, backend services, authentication, runtime/install contracts,
dependencies, fonts, cursors or bundled artwork.

- Home greets the active account in RU/EN using local time: morning 05:00–11:59,
  day 12:00–17:59, evening 18:00–22:59, night 23:00–04:59. It refreshes each
  minute, on focus and visibility changes. SVG sun/moon artwork uses a static,
  restrained glow. Empty and long account names are handled without an extra
  comma or horizontal overflow.
- Six deterministic hero copy pairs follow the selected artwork. The internal
  breadcrumb/caption is removed; existing rotation, manual controls, artwork and
  reduced-motion behavior remain.
- Continue Playing uses compact rows, Minecraft/loader metadata, status,
  existing Play/Stop IPC and instance details. Native instances are ordered by
  last played, falling back to installation time. Browser-only legacy entries
  still open their existing details. Empty state links to Discover.
- Community visibility defaults on, updates live, survives reload and safely
  migrates missing/invalid saved values. Settings search finds English and
  Russian community/popular terms.
- Appearance follows Theme → Materials → Layout → Background → Effects →
  Typography → Visibility. Existing standalone navigation stays available.
  Advanced Windows window material controls remain accessible in a disclosure;
  keyboard focus excludes closed disclosures. Native smoke automation opens
  disclosures before interacting with their controls.
- Labels and editable controls use consistent spacing and inherited UI font
  tokens. Particle preset labels have at least a 7px measured text-to-control
  gap with RU Monocraft, and RU preset options are localized.
- Sidebar hover and keyboard focus follow the whole button hit area, without
  moving geometry, for both sides, layouts and sizes. Icon-only outlines are
  replaced with a soft inset accent focus ring; forced-colors retains a visible
  system outline.
- Discover search owns one material surface and focus indicator; its input
  owns no additional fill, border, shadow or blur. Categories have a 6px gap,
  transparent group, individual selected states and narrow-window scrolling.
  Provider, Filters and Sort share control geometry; the decorative provider
  dot is removed.
- Project Back is a light action; Overview/Versions/Gallery use transparent
  tabs with a material selected segment. Metadata is 280–340px wide on desktop,
  has two columns and wrapping categories, and becomes one content column on
  narrow windows. The existing project header/actions remain.
- Instance metadata avoids duplicate provider/loader labels and a repeated
  generic failure chip. The specific error and repair action remain.

## Verification

| Check | Result |
| --- | --- |
| `npm run build` | Passed: TypeScript and Vite, 2609 modules |
| Full Playwright suite | **57 passed**, 1.9 minutes |
| `git diff --check` | Passed |
| `node --check .github/scripts/window-smoke.mjs` | Passed |
| Local `cargo check --locked --manifest-path src-tauri/Cargo.toml` | Blocked: `cargo` is not installed |
| Local `npm run tauri dev` | Blocked at Cargo metadata: `cargo` is not installed |

Run UI verification with `npm test`. In this environment the executable was
provided through `BROWSER_EXECUTABLE_PATH=/tmp/chromium`; no dependency or lock
file was changed to accommodate it.

The UI suite uses deterministic catalog responses and Tauri IPC mocks. It
verifies the existing account actions, instance identity and favorite/actions,
install 43/97 spacing and cancellation, structured errors, pagination,
CurseForge routing, external Markdown links/badges, accent labels, custom
cursors, wallpaper pairing/import controls, all six materials, native-material
fallback contracts and titlebar/fullscreen contracts. This is browser UI and
contract verification, not a real Minecraft launch or live account login.

New coverage verifies all 24 time-period boundaries, local timezone/focus
updates, account/name/language changes, hero copy, Home Play/Stop/details,
community migration/persistence, label spacing, transparent search/tab
surfaces, every detail tab/material and sidebar hover/focus geometry.

Theme checks cover Light, Dark, AMOLED and live System changes. Typography
checks cover Nunito and Monocraft, RU/EN, headings/full interface, interface
size controls and long names. Responsive checks include 1280×800,
1024×640 and 853×533 (CSS viewport equivalents of 100/125/150% desktop scale),
plus narrower windows. These are not measurements of Windows native DPI.

Font cmap inspection confirms bundled Nunito, Manrope, Rubik and all four
Monocraft weights contain Cyrillic, including Ё/ё. Existing Plus Jakarta Sans
has no Cyrillic cmap; its deliberate Nunito fallback remains in place.

No page exceptions occurred during the separate before/after comparison.
The new Home action test also asserts no console errors. The complete mocked
suite emitted an existing Tauri callback warning during reload; this is not
evidence of native runtime behavior.

## Screenshot comparison

The original commit was materialized separately and served alongside the new
code. Both used the same 1280×800 viewport, Sakura artwork, Dark theme, Liquid
material style, account/instance fixture and catalog fixture. Home, Discover,
project details and full-interface Monocraft particle controls were captured
before/after and visually inspected.

The comparison shows the personalized greeting, smaller hero, actionable
Continue rows, lighter sidebar actions, separate Discover categories, single
search fill, light Back/tabs, wider two-column metadata and an independent
particle label above its select. Additional screenshots cover RU Monocraft
long names at scale equivalents, narrow Discover and Light/Dark/AMOLED detail
pages. Captures are generated under ignored `.qa/home-polish/`; temporary
comparison servers/scripts and screenshots are not product assets.

## Scrolling diagnostic

One sequential run in headless Chromium with software rendering recorded 72
animation-frame intervals per scene. Results are diagnostic, not Windows FPS,
and do not establish a performance improvement or absence of a native
regression. Different content height and a single sample also limit comparison.

| Scene | Before mean / p95 (ms) | After mean / p95 (ms) |
| --- | --- | --- |
| Home | 24.31 / 33.40 | 27.31 / 33.40 |
| Discover, 12 projects | 36.34 / 50.10 | 31.48 / 50.00 |
| Project detail | 16.67 / 16.70 | 16.90 / 16.80 |
| Settings, Monocraft | 66.90 / 83.40 | 72.91 / 100.00 |
| Library, 60 instances | 31.48 / 33.40 | 30.32 / 33.40 |

Settings is slow in this software-rendered environment in both versions and
the new single-run sample is slower. Real compositor timing remains unverified.
The existing 60-instance suite also confirms zero nested backdrop filters on
card controls, and low-quality mode still reduces the blur cost.

## Native limits and concrete remaining issues

- The starting commit's [Windows verification run](https://github.com/ccardcat/canary/actions/runs/37470204145)
  passed Cargo check, Rust tests (55 passed, 6 ignored) and NSIS/MSI builds.
  Its native window/material step failed before UI cases: the WebView2 remote
  inspector refused `127.0.0.1:9384`. A responding Canary window and WebView2
  processes were observed, but no native UI cases/captures completed. This
  baseline result is not a successful native verification of the new commit.
- Local Rust, real Windows GUI/DPI and native FPS verification are unavailable
  because this environment lacks Cargo and a Windows desktop. The existing
  Windows CI inspector failure must be resolved to obtain native UI evidence.
- Vite retains its existing >500KB chunk warning (main chunk about 600KB).
- Plus Jakarta Sans continues to use Nunito for Cyrillic because its existing
  bundled file lacks those glyphs.

Publication uses the actual upstream commit as parent and rejects an unexpected
`main` SHA, without force or history rewriting. The exact published commit and
current Actions status are reported separately after publication.
