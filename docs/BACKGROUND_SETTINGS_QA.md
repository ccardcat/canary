# Background and surface controls — 2026-10-07

Starting main: b382bfbd5d0d7a6ab7517710e1723279f6bc8987.

## What was fixed

The wallpaper and native-window veil used a hidden 88% overlay floor. Most shading/transparency values therefore produced the same nearly opaque result. Sidebar artwork also depended on a material background-influence multiplier and a fixed second tint. Those layers now use the actual background settings, with one sidebar tint layer.

Background sliders preview CSS tokens on animation frames while dragging. Preference state and persistence commit on release or keyboard completion. No backend calls or preference writes occur per drag movement.

Defaults now use the Green wallpaper, 85% visibility, 8 px blur, 28% shading and 30% vignette. Legacy default values migrate once using backgroundVersion; non-default custom values and subsequent user changes persist.

Background settings have Launcher / Sidebar targets, Picture / Solid color / Desktop source choices, three primary sliders, an immediate preview, one image gallery, custom import, linking and expandable color/framing settings. Appearance keeps surfaces and layout; typography and effects retain their own sections.

Surfaces expose material preset, opacity and backdrop blur first. Style comparison and per-category tuning are expandable. Solid disables opacity/blur controls; Transparent disables blur. Reduced transparency, Focus and Low quality explain and disable controls which cannot affect the current surface. Sidebar preview and controls respect the same opaque modes.

Native Desktop chooses supported Acrylic or another available material and reports the actual applied result. Windows owns the native desktop blur radius; wallpaper blur and surface blur have separate controls.

## Verification

- background-live: 6 scenarios passed, including image pixel changes, actual CSS filter/tint changes, drag before release, restart persistence, custom-import target, legacy migration, RU at 760×540 and three-theme screenshots.
- A 20-movement background drag made zero preference writes and zero IPC calls; one deferred preference write followed release.
- sidebar-preview-cleanup + ux-performance + background-live: 28/28 passed.
- appearance, materials and polish: 21 distinct scenarios passed after adapting navigation and saved-preference fixtures to the existing pagehide persistence behavior. Seven materials, typography/scaling, image linking, ambient effects, layout, menus and readable dialogs are covered.
- Native browser contracts: 2/2 passed. Desktop enables Acrylic; native-window tint changes before drag release with no extra apply_window_material calls during the drag; release submits the final transparency; reload persists it. Mica restores after fullscreen fallback.
- Browser native contracts use mocked Tauri IPC, not a manual Windows compositor inspection. Hardware FPS/GPU and native blur appearance were not measured.
- Final targeted verification repeats live background drag and surface/opaque-mode behavior after the final control changes.
- npm run build succeeded (TypeScript and Vite production build). Existing warning about the main chunk exceeding 500 kB remains.
- git diff --check passed.

Screenshots are generated under ignored .qa/background-live; build/test artifacts are excluded from Git.
