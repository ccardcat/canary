# Greeting, scrollbar and small-height sidebar

Date: 2026-10-06. Starting `main`:
`7cb084ccd07cc78fadefc2789838dc3cdaa4365c`.

## Greeting

Russian copy is now **Доброе утро / Добрый день / Добрый вечер / Доброй ночи**.
English copy is unchanged. A trimmed account name receives one comma and space;
missing/empty names receive neither. Existing active account selection, SVG
sun/moon, static glow, local-time helper and lightweight update lifecycle stay
in place: 05:00–11:59 morning, 12:00–17:59 day, 18:00–22:59 evening,
23:00–04:59 night. Refresh runs on mount, each minute, focus and visibility.

The existing greeting test was updated to reject the old wording, and checks
the requested local 06:00, 13:00, 20:00 and 01:00 examples, all 24 helper
boundaries, live account changes, no account, long names and RU/EN.

## Scrollbar

One shared `src/Scrollbars.css` replaces the old global styling. Tokens derive
colors from the existing theme's muted/accent values. Track and corner are
transparent. The thumb has a 999px radius, transparent inset and 24px minimum
length. Main hit width is 10px with a 6px visible thumb; sidebar hit width is
8px with a 6px visible thumb. Hover becomes more opaque with a restrained
accent; active drag increases the accent contribution. No blur layer or
continuous animation is added.

On Blink/WebView2 the WebKit path hides scrollbar buttons with `display:none`
and zero width/height. In supporting engines, CSS `scrollbar-width/color` are
reset to `auto` so that they do not override these pseudo-element styles.
Other engines retain the standard thin-scrollbar fallback. Forced-colors uses
system colors. Stable gutters prevent layout movement on the navigation and
existing long settings/dialog scroll areas. Existing main scrollbar placement
for left/right sidebar remains unchanged.

## Sidebar architecture and minimum size

The configured native minimum stays **760×540**; no minimum size is increased.
The previous sidebar clipped overflow while navigation had an automatic
minimum size and the utility block relied on `margin-top:auto`. When logo,
navigation and utilities exceeded available height, important controls ended
up outside the non-scrollable surface.

The decorative/material outer sidebar keeps its existing bounds. A new inner
flex column contains a non-shrinking logo, a navigation flex item with
`min-height:0; overflow-y:auto`, and a non-shrinking utility block. Utilities
remain visible while navigation scrolls. The divider stays subtle; content
does not scroll under the utility block, so no new backdrop is required.

Below 620px viewport height, only vertical padding/gaps are reduced. Labels
may wrap; hit targets and icons remain usable. Below 340px, the inner column
becomes the single sidebar scroller and navigation stops owning a separate
scroll area. This is a graceful fallback below the configured native minimum,
including a tested 280px height. The rounded outer surface never expands the
document or leaves window bounds.

Compact/expanded widths remain 76/224px at supported desktop widths. The
existing narrow-window automatic compact behavior remains the default, but
the utility button now uses the actual visible state and allows explicit
expansion even at 760px width. This opt-in is persisted in
`canary-sidebar-expanded-narrow`; the existing `canary-compact` and language
keys keep their meanings. The language button has an explicit localized
accessible name in compact mode.

## Verification

Full Playwright suite: **62 passed (3.5 minutes)** on the final source.

- `npm run build`: passed TypeScript and Vite, 2610 modules; existing >500KB
  chunk warning remains.
- `git diff --check`: passed.
- Local `cargo check --locked --manifest-path src-tauri/Cargo.toml`: blocked,
  Cargo is not installed.
- Local `npm run tauri dev`: attempted and blocked at Cargo metadata for the
  same reason. No native Windows GUI or Minecraft launch is claimed.

New Playwright coverage uses painted scrollbars: it explicitly removes
Playwright's default `--hide-scrollbars` launch argument. Before this change,
headless tests could inspect scrollbar CSS but could not test a visible thumb.
The drag test now performs actual mouse down/move/up and verifies scrollTop,
unchanged navigation width and pinned utility position. Wheel and sequential
Tab checks verify navigation scrolling, focus visibility, utility reachability
and opening/closing Language settings.

Geometry coverage uses RU full-interface Monocraft at 120% font scale, both
sides, both surface layouts, both compact states and these CSS viewports:
1280×540, 760×540, 1024×432, 853×360 and 760×280. The latter sizes exercise
125/150% desktop scale equivalents and the extreme-height fallback; they are
not real Windows DPI measurements. The matrix checks all navigation items,
both utilities, hit targets, scrolling ownership and document/window bounds.

Actual settings interactions verify Left → Right → Left, Floating → Attached
→ Floating, Compact → Expanded → Compact and RU → EN → RU, including reload
persistence and explicit narrow expansion. Global computed scrollbar styles
are checked on Library, Discover, project details, instance dialogs, Settings
content/navigation and sidebar navigation. Theme/material checks include
Light, Dark, AMOLED, live System and all six shared material styles.

Existing regression coverage retains Home hero/Continue/community, single
Discover search surface, category focus, project Back/tabs/metadata, compact
instances, account actions, install 43/97 spacing, particle label spacing,
accent labels, titlebar/fullscreen contracts, custom cursors and saved visuals.
Backend, Rust, auth/runtime/install services, dependencies, bundled artwork and
fonts are unchanged. IPC/browser fixtures validate UI contracts rather than a
real account login or Minecraft process.

## Screenshot evidence and limitations

Painted scrollbar captures are generated in ignored `.qa/sidebar-scroll/`,
including thumb drag, small-height sidebar and all four settings themes.
Before/after comparison uses a separate snapshot of the exact starting tree,
the same account, RU Monocraft 120%, Sakura background and 1280×540,
760×540 and 1280×280 viewports. Generated images and temporary comparison
scripts are verification artifacts, not product assets.

Visual inspection confirms that the old main scrollbar's triangular end
arrows disappear and that the new thumb is a muted capsule. Geometry measured
after focusing Language shows its lower edge moving from 617.48px to 525px at
1280×540, and from 593.80px to 525px at 760×540. At 1280×280 the utility is
reachable inside the inner fallback scroller with its lower edge at 265.09px.
No page exceptions occurred during this separate before/after capture run.

The [starting commit's desktop CI](https://github.com/ccardcat/canary/actions/runs/37483514115)
passed Linux verification and Windows Cargo check/tests and installer builds.
Its Windows native UI step failed before cases/captures with
`ECONNREFUSED 127.0.0.1:9384` from the WebView2 inspector. That startup failure
remains outside this focused UI pass. Windows compositor rendering, physical
touchpad behavior and native DPI/FPS still require a working Windows runtime;
browser screenshots and simulated wheel events do not establish them.

Publication uses the real upstream parent with a checked expected `main` SHA,
without force or history rewriting. The published commit and new CI status
are reported after the ref update.
