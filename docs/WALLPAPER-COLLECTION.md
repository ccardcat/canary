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

Validation: production build, TypeScript 6.0.3 compatibility check, 24 page-free
tests and 12 actual component DOM scenarios passed. Image dimensions, decoding,
unique hashes and asset references were checked. Browser regressions cover gallery
scroll/expand/persistence, custom wallpaper effects, flake geometry and tree height.
Real Chromium and native WebView visual execution remain unavailable in this
environment; the browser suite was discovered, not executed.
