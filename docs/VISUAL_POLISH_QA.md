# Canary visual polish

Existing page layouts, Settings categories and Rust installation code are preserved.

## Added

- Frameless, theme-aware title bar using Tauri window commands and bird-only branding.
- Local global/sidebar artwork selectors, linked presets, intensity and separate blur controls.
- Background discovery by `*-bg` / `*-sidebar` naming, including different image formats.
- Local Nunito, Manrope, Plus Jakarta Sans, Rubik and Monocraft font selection.
- Monocraft headings/full-interface modes; technical text stays monospace.
- Twelve subtle Sakura/Snow particles, automatic mode and restrained artwork movement.
- System/user reduced motion, persistent appearance choices and unified control materials.

## Verified

- `npm run build` passed.
- `cargo check` passed.
- `npm run tauri dev` started a real Windows window titled Canary.
- Ten interaction tests passed. Expanded appearance tests also passed: all background options, linked/unlinked choices, local font loading, persistence across reload, theme/language updates and reduced motion.
- Layout checked at 1280×720, 1440×900, 1920×1080 and narrower widths.
- Monocraft font tables contain the tested Russian navigation strings; Russian full-interface screenshots inspected at 1280×720.
- Light wallpaper/Home and Russian Monocraft Settings/Home screenshots inspected.

## Remaining manual verification

Windows Computer Use repeatedly timed out, including after kernel reset. Physical drag, minimize, maximize/restore, double-click and close have **not** been manually verified. The title bar is wired to the actual Tauri commands and permissions, but this is not a substitute for native interaction QA.

The browser visual capture could not reach live Modrinth data in this restricted environment; API behavior and existing install frontend were covered with deterministic test fixtures. No installation/backend logic was changed.

Next step: use the running desktop window to test the native title bar actions and inspect actual Windows 125%/150% scaling. Then verify appearance persistence after closing and reopening the native app. Do not start the launcher backend phase until this final native QA is complete.
