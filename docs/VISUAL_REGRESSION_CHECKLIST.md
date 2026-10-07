# Visual regression checklist

Run this checklist before adding a visual theme or changing control/material tokens.

- [ ] Start from current `main`; review the entire diff and exclude generated files, logs and secrets.
- [ ] Open Home, Discover, Project Detail (description/gallery/versions), Library (comfortable/compact/empty/running/error), Instance Settings and Content, Downloads and every Settings section.
- [ ] Resize through 1920×1080, 1280×800, 1000×640 and the supported native minimum; stress 780×540, 600×420 and 480×340 in the renderer. Check low height, both sidebar sides, compact/expanded and floating/attached.
- [ ] Use RU/EN, Nunito/Monocraft, long names and paths. Inspect button text, icon centering, shared 34/40/44 px control scale, row wrapping, scrollbar clearance and horizontal overflow.
- [ ] Check primary/quiet/ghost/destructive/icon buttons, tabs, segmented controls, dropdown triggers, toolbars, card/dialog actions, sidebar and titlebar. Hover/pressed states must not move controls; keyboard focus, selected and disabled states must remain readable.
- [ ] Check all six materials, all palettes and accents, Light/Dark/AMOLED/System, and bright/dark/colorful backgrounds. Keep foreground readability floors, restrained Liquid Glass and no nested backdrop blur on card controls.
- [ ] Switch Hero artwork repeatedly, including imported wide/tall/HD images. Container, copy, controls, border radius and image scale must stay fixed; decode/preload and crossfade must preserve the previous image while loading.
- [ ] Select CurseForge in Discover and Content, including during a pending Modrinth request. Show localized Coming Soon immediately, with no old results, endless loading, pagination, API calls, install/update actions or red toast. Return to Modrinth and verify search/detail/install/update remain usable.
- [ ] Check Storage maintenance/action spacing, long path copy/wrapping and metrics; Local account form, Ely.by and legitimate Microsoft availability; About width, soft border and version/provider metadata.
- [ ] Open dialogs/selects/tooltips/context menus near viewport edges and inside native modals. Verify top-layer ordering, bounds, Escape/close, focus restoration and listener cleanup.
- [ ] Exercise active/progress/cancelling/completed/failed downloads. Confirm real cancellation, no resurrected tasks, no cancelled/failed ghost instances and no Activity Dock. Verify Discord RPC privacy and copy.
- [ ] Run `npm run build`, `npm test`, `cargo check --locked --manifest-path src-tauri/Cargo.toml` and Rust tests. When a native GUI is available, run `npm run tauri dev` and inspect resize/maximize/fullscreen, native backdrop fallback and drag/drop on Windows/Linux.
- [ ] Record exact commands, results and platform limitations. Never equate a build or mocked native IPC with verification of the actual OS compositor or remote auth/install service.
