# Wallpaper collection and effects

The October collection replaces the old bundled backgrounds with 16 unique user
images. Two byte-identical upload repeats are omitted. Garden Awakens and Minecraft
New Year keep their original files. All 18 backgrounds can be selected separately
for the launcher and sidebar, without duplicate default thumbnails.

The new images keep their 2048 × 1116 resolution and use WebP quality 88. Separate
400 px thumbnails keep the gallery lightweight. New artwork and thumbnails total
1,922,316 bytes. Retired built-in IDs migrate to Sunny Meadow; retained selections,
custom import IDs, treatment, material and effect preferences stay intact.

The gallery has its own 236 px scroll viewport and uses the launcher's scrollbar.
Show all wallpapers expands it to the measured grid height. Selection remains
accessible by name and keyboard, with hover tooltips and no visible captions.
Navigation branches also animate measured pixel heights, fade and slide their
contents. ResizeObserver keeps the geometry current when fonts or widths change.
Reduced motion continues to disable these transitions.

Particles now sit above the application rather than behind its surfaces. Explicit
snow, sakura and leaves stay selected through wallpaper changes. Automatic follows
the visible wallpaper's effect and falls back to snow if none is assigned, including
custom imports. Snow uses six-arm SVG snowflakes. Focus/reduced-motion settings
still pause particles, with an explanation in Effects; the selection is retained.

The follow-up particle fix reproduces a provider mounting while the native window
is hidden, followed by an opening without visibilitychange. The old visibility
attribute and imperative animation pause kept the effect frozen. CSS now owns
play/pause; startup-ready, window focus, pageshow and visibilitychange synchronize
visibility. Minimizing still pauses animation. Particle duration, density and
negative phase offsets are declarative, so new wallpaper/effect layers start with
their saved settings and visible particles. Live speed previews use the same timing
calculation, and closing a slider cancels its pending preview.

Fire Sparks is a selectable effect in Appearance → Effects. Small amber, orange and
gold sparks glow and rise with gentle sideways drift. It uses the existing density,
speed, opacity, size, wind and quality controls and persists through reloads.
Automatic selects it for Crimson Fortress, Nether Depths and Crimson Horizon;
explicit snow, sakura or leaves keep their selection on those backgrounds.

Validation: production build, TypeScript 6.0.3 compatibility check, 26 page-free
tests and the existing 12 actual settings component DOM scenarios passed. Targeted
provider DOM checks cover missing visibilitychange recovery without WAAPI, all 18
wallpapers with each manual effect and Automatic, import fallback, quality limits,
live speed preview, preference reload, Russian fire-spark selection and focus/
reduced-motion/Off behavior. Image dimensions, decoding, unique hashes and asset
references were checked in the preceding collection change; this follow-up leaves
the image files unchanged. Added browser regressions check actual resumed animation
time, upward spark movement and speed persistence. All 225 browser-suite tests
were discovered. Real Chromium and native WebView visual execution remain
unavailable in this environment; browser scenarios were not executed.

## Native visibility follow-up

The previous fix still trusted `document.hidden`. A targeted reproduction now keeps
that property true after the native window opens: the old provider leaves particles
paused even after startup-ready/focus events. The provider now uses the actual Tauri
window's `isVisible()` and `isMinimized()` state instead. Native focus/resize events,
startup-ready, pageshow and document visibility events refresh it; a two-second
watchdog recovers missed show/restore events. Browser previews retain ordinary
document visibility. Two explicit read-only window capabilities allow those queries.

Late asynchronous results cannot overwrite newer state, pending callbacks and
polling are cleaned up on unmount, and temporary native query failures retain the
last known native state. Minimized/hidden windows still pause particles. Wallpaper
assets and the selected effect, quality, density, speed, Focus and reduced-motion
behavior are unchanged.

Validation: production build, TypeScript 6.0.3 compatibility check, 30 page-free
tests, 12 actual settings component DOM scenarios and seven targeted provider DOM
groups passed. The old provider fails the stale-document/native-visible scenario;
the updated provider passes it, including minimize/restore, all 18 wallpapers,
manual effects, Automatic, import fallback and preference persistence. A browser
regression additionally checks that animation time advances with stale
`document.hidden`, but it was not executed: Chromium exits with SIGTRAP and Firefox
cannot locate its application directory in this managed environment. The full suite
discovers 230 tests in 34 files. Actual native WebView rendering still needs a device
run; the DOM and native-state mocks do not establish visual behavior on a real OS.
