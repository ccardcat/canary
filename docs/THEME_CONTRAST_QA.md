# Theme contrast and Discord copy audit

## Source and scope

The starting GitHub `main` was `e8a352e9336b1dc32ef4deab8b1bdd155312fde9`.
During the audit, `9b01e3da88bad300a8467c53ec1bbff1f2665f21` added a native
QA dropdown animation wait. That change was synchronized and preserved.
Local `git pull` has no tracking remote in this workspace; source files were
retrieved through the authenticated GitHub integration. The local baseline
tree was checked against the exact upstream tree before editing.
`b2f4d95d9a09334e852e4758ff88bdce55337d32` was also synchronized during final
QA. Its 0.1.5 version, Low-quality fix, vendor/standard backdrop declaration
order, release artifact filtering and existing QA evidence are preserved.

## Root cause and shared fix

Soft Light's palette colors were already reasonable, but the material pipeline
allowed dialogs and controls to use a 55% glass fill, or an even lower
Transparent fill. Over the dark modal backdrop this made a light dialog gray
and its muted foreground lose separation. White sheen replaced the top border;
pastel accents doubled as focus/link ink; placeholders and disabled controls
also received opacity reductions. Palette definitions were spread across CSS
files, making these interactions difficult to assess.

`src/ThemeTokens.css` now owns the existing palette vocabulary, with aliases for
app/page, primary/secondary/elevated/input/sidebar/modal/glass surfaces;
primary/secondary/tertiary/disabled text and icons; subtle/default/strong borders;
hover/pressed/selected/disabled surfaces; accent/hover/pressed/soft and focus;
success/warning/error/info, backdrop and shadow roles. Existing components keep
their `--text`, `--muted`, `--surface`, `--line` vocabulary. No second theme engine
or background-image color sampling service was introduced.

Opaque palette values enter the existing material pipeline once. CSS opacity
floors protect text-bearing surfaces: 88–90% cards/sidebar, 92% buttons/floating,
94% inputs/dialogs, 96% menus, 88% titlebar. Profiles retain their filters, sheen,
depth, radius, shadows, per-category overrides, and native window behavior.
Sheen follows the palette highlight instead of applying a fixed white wash.
Normal borders remain visible underneath their inset highlight.

Soft Light retains pale green-white surfaces with deeper, independent text
roles and soft borders. Settings navigation has a distinct secondary surface;
selected controls have a clear tint, border and weight. Hover and pressed states
also work on selected controls. Disabled controls use their own foreground/fill
without fading a text-bearing container. Search has one input surface and a
contiguous focus ring with a soft halo. White/gray/pastel accent pickers retain
their original swatches, with outlined dots and theme-appropriate accent ink.
Carousel arrows and selected dots use semantic foregrounds over artwork.
The atmospheric scene and native-window veil share an 88% minimum theme tint:
max-intensity images and a low user overlay cannot erase text outside cards.
User preferences and background images remain; the visible tint is bounded by
this readability floor rather than applying opacity to content.

Canary White, Soft Light, Frost, Warm, Graphite, Black, Soft Dark, Midnight and
AMOLED share these roles. System still follows the OS theme. When a saved
palette belongs to the other theme, the visible picker and applied CSS use a
valid fallback without discarding the saved palette choice.

## Visual and regression evidence

`tests/theme-contrast.spec.ts` exercises the browser-rendered UI and measures
540 combinations: nine palette/mode states × six materials × ten accents.
The contrast calculation composites the computed material base fill against
both black and white underlays. It checks primary text >= 7:1 and normal
secondary/tertiary/placeholder/control/accent ink >= 4.5:1. This checks the base
fill, not a WCAG certification of every gradient, pixel, image or font glyph.

The screen flow covers Home, comfortable/compact Library, Downloads with active
progress/Cancel, Discover search/cards, Project Detail and Settings at 760×540.
Both EN/Nunito and RU/Monocraft full-interface 120% are exercised. Project
Overview, Versions and Gallery are visited, with settled page opacity before
capturing their screenshots. Settings
navigation, selected/hover/pressed/disabled, placeholder/typed text and keyboard
focus are checked. System light/dark and every material over bright, dark,
colorful and blurred synthetic artwork are captured. Screenshots and computed
matrix data remain in ignored `.qa/theme-contrast`; they are not shipped.

Representative screenshots are visually reviewed, including Soft Light
Settings before/after, bright Glass Settings, dark System Settings, Home,
Discover, Project Detail, Library and Downloads in the small window. Existing
tests also cover titlebar, sidebar sides/modes/scrolling, dialogs, dropdowns,
account actions, typography, native-window bridge, cancellation, terminal/late
events and first-install Library publication. Provider/auth/install/process
implementation files are untouched by this audit.

A separate PNG pixel check samples the background behind bare Home text on
bright, dark and colorful images at intensity 100%, overlay 35%, vignette 0.
Before the scene fix, Soft Light/dark-image secondary contrast was 1.63:1;
Dark/bright-image secondary contrast was 1.38:1. After the fix, the minimum
across the nine pixel samples is 9.72:1 primary, 5.10:1 secondary, 4.04:1 tertiary.
The test enforces >=7, >=4.5 and >=3.5 respectively for those bare-page roles.

Production Vite assets are also checked in Chromium: 36 cases (Light/Dark/AMOLED
× High/Low quality × six materials). High-quality non-Solid profiles retain
actual standard backdrop filters; Low quality disables them. Dialog/input tint
floors survive production CSS minification. No development CSS is substituted.

The complete frontend suite passed: **80/80 tests**. `npm run build` passed
against the synchronized 0.1.5 source. The production asset checks passed
**36/36 cases**. Fresh Rust verification is delegated to the Windows/Linux
Actions run for the published commit; no local Cargo result is claimed.

## Presence presentation

The existing Rust mapper now emits these localized examples:

| Context | RU details | State |
| --- | --- | --- |
| Home | На главной | omitted |
| Discover | Просматривает проекты | omitted |
| Project | Смотрит Better MC | omitted |
| Library | Управляет экземплярами | omitted |
| Settings | Настраивает Canary | omitted |
| Installing | Устанавливает Better MC | 67% · 43 / 97 файлов |
| Launching | Запускает Minecraft | instance name, if allowed |
| Playing | Играет через Canary | instance · Minecraft version, respecting privacy |

EN copy follows the current locale. Provider/category metadata no longer enters
the main details/state strings. Existing optional confirmed provider/loader
assets, short tooltips, Canary logo configuration, public website button and
Playing timestamps are preserved. Missing file totals leave only the progress
percentage instead of extra Minecraft/loader metadata.

Transport, reconnect, scheduling/dedup, task priority, terminal exit, process
sessions and privacy architecture are unchanged. Updated mapper tests cover
both locales, both providers, optional assets, clean navigation and Launching
privacy. Existing progress/privacy/timestamp/terminal/scheduling and real test
IPC reconnect tests remain. No real Discord desktop client was available here;
protocol fixtures do not prove Discord's actual client rendering or assets.

## Environment limits

`cargo check --locked --manifest-path src-tauri/Cargo.toml` and
`npm run tauri dev -- --no-watch` were attempted locally. Cargo is not installed;
Tauri could not run `cargo metadata` and no native local window started.
Fresh Windows/Linux Actions are used for Rust checks. A real Windows DPI,
native-material/background and Discord-client visual pass is separate from
the Chromium/IPC fixture evidence above.
