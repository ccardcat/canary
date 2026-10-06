# Canary material and compact UI pass

This pass extends the existing React appearance provider and its `canary-visual`
preferences. It was built against main at
`0c9a7af8f3d4476e77b18ec07f89dedbf86981cd` (Canary 0.1.4).

## Material System

`src/components/MaterialSystem.ts` owns six profiles: Solid, Soft, Vibrancy,
Glass, Liquid Glass and Transparent. Eight semantic categories share one token
pipeline: cards, buttons, sidebar, popovers, dialogs, inputs, titlebar and floating
controls. Their depth scales blur, corners and shadows. Controls use foreground
glass without their own backdrop blur, preventing nested filtering on every
button. `Materials.css` maps existing components to these tokens; the previous
one-size surface rules in `LiquidGlass.css` now delegate to category tokens.

## Liquid Glass

Liquid Glass combines a lower-opacity theme surface, stronger blur and saturation,
subtle specular gradients, a bright inner edge, a darker outside edge, inset
shading and two outer shadow layers. Selected and primary controls add restrained
accent tint. Glass uses lighter highlights, less blur and shallower shadows.
These are CSS approximations of optical depth, not physical refraction.

## Vibrancy

Vibrancy uses a more translucent surface and stronger saturation than ordinary
Glass. Material intensity adjusts opacity, blur, saturation, highlights and
shadows. Existing background treatments and native Windows material preferences
remain available through their established paths.

## Sidebar

Attached and Floating geometry supports both sides. Floating adds an inset and
rounded corners. The original sidebar artwork and its treatment layers remain
visible beneath the material. Compact navigation keeps its existing behavior.

## Cards

Existing Library, Discover, Home, account, content, version and activity surfaces
use card tokens. Dialog children use quieter foreground layers. Instance cards
offer Comfortable/Compact layouts and Full/Ambient/Off artwork; Compact removes
the large artwork block and places the sharp icon beside the title and metadata.

## Buttons

Styles and Comfortable/Compact density share the same settings. Play/Stop stays
the primary action. Secondary icon actions keep localized accessible names and
tooltips. Destructive controls are neutral normally, red on hover or keyboard
focus, and slightly stronger when pressed. Existing confirmation flows remain.

## Titlebar

The titlebar uses its own material category. Persisted theme/System resolution
happens before initial paint. The existing centered Canary brand uses the actual
black/white assets; native drag, controls and fullscreen paths are retained.
Maximized window state is also exposed to appearance styling.

## Settings

Appearance includes eight presets, a shared-style toggle, individual categories,
intensity/blur, a live preview, layout/artwork/density and collapsed advanced
controls. Advanced controls include opacity, saturation, brightness, contrast,
edge/highlight, shadow, corner radius, accent tint and sidebar/titlebar intensity.
Reduce Transparency and Reset Materials are available. Normalization validates
enums and ranges while preserving existing backgrounds, typography, cursors and
native window settings. Presets do not reset those existing systems.

## UI bugs fixed

- Install stage, 43/97 count, long filename and preparation/cancel actions have
  explicit spacing and safe wrapping.
- Accent names wrap inside responsive controls, including RU Monocraft layouts.
- Linked Markdown badges keep intrinsic width instead of becoming wide dark bars.
- Settings headers stay fixed while their content scrolls.
- Local account metadata appears once.

## Friend requests

- Account edit/delete actions are adjacent pencil/trash icons with tooltips.
- Favorite star sits next to the instance heading rather than in the lower row.
- Instance actions are grouped into primary Play/Stop, secondary repair/folder,
  and compact details/content navigation. Repair-needed state remains visible.

## QA

The existing 40 Playwright tests and 8 additional material tests passed together
(48 total). Coverage includes all six styles on actual card/sidebar/modal
surfaces, foreground buttons, intensity, presets and reload persistence,
migration, compact card geometry, favorite/launch/stop IPC contracts, account
rename/delete/cancel, destructive hover and keyboard focus, four themes and
loaded logo assets, RU/EN Monocraft, both sidebar sides, 760x540 minimum viewport,
install progress/cancellation, linked project badges and a 60-instance Library.

Screenshots were generated under ignored `.qa/materials/` and visually reviewed.
Tests use Tauri/backend mocks; they do not prove a real Minecraft installation
or game launch. Scaled viewports approximate available layout space at 100%,
125% and 150%; they do not replace Windows DPI testing.

Software-rendered headless Chromium sampled the 60-card Library at a mean 32 ms
per frame with Liquid Glass and 20 ms in Low quality (p95 33 ms for both in that
run). Nested filtered buttons: zero. These measurements are diagnostic only:
they do not establish native 60 FPS or absence of a GPU performance regression.

## Build

- `npm run build`: passed, including TypeScript. The existing large-bundle warning
  remains; this pass does not change dependencies or the build configuration.
- `npm test -- --reporter=line`: 48 passed. The environment used the existing
  `BROWSER_EXECUTABLE_PATH` option with a temporary headless Chromium executable.
- `git diff --check`: passed.
- `cargo check --locked --manifest-path src-tauri/Cargo.toml`: blocked because
  Cargo is absent from this environment.
- `npm run tauri dev`: blocked at Cargo metadata for the same reason.

## Git

GitHub integration is the source of the baseline and publication. A direct
authenticated git checkout was unavailable in this environment. Publication uses
GitHub Git Data objects with the current main commit as parent and an expected-head,
non-force branch update. Original binary assets, package files and `src-tauri`
are unchanged. No synthetic local audit history is published.

## Remaining issues / required native checks

Run Cargo and Tauri on Windows; test real drag/minimize/maximize/fullscreen,
100%/125%/150% DPI, native Acrylic/Mica/transparency fallbacks, background contrast,
and long Library/Discover/Settings scrolling on a GPU. Validate the unmocked
account/install/launch flows as part of the normal native regression pass.

The supplied attachment contained a detailed textual Liquid Glass reference,
but no reference image was available. Visual comparison against that image is
still pending. Do not mark the complete native visual acceptance pass as closed
until these checks have been performed.
