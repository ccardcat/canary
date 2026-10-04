# Final visual additions

The existing Settings, themes, fonts, title bar and Modrinth installation code are preserved.

- Left/right sidebar placement, including artwork, mirrored edge and compact state.
- Independent global/sidebar treatment: intensity, blur, brightness, saturation, theme veil, vignette, zoom and position. Compact disclosures include recommended-default reset.
- Decoded artwork crossfade; a failed or superseded image load leaves the previous artwork visible.
- Five minimal CSS cursor presets; text, disabled and drag states retain conventional cursors.
- Default browser context menu suppressed. Editable/selectable areas get Copy, Paste and Select all; keyboard editing remains available.
- Compact theme-aware tooltips and pointer spotlight on project cards.
- Focus mode, bounded glass transparency, visual quality in Advanced, bounded particle controls and reflected surface edges.
- Existing user/system Reduce Motion also disables spotlight and button transforms. Low quality caps particle count and blur.
- New labels are localized in English/Russian; preferences are merged with existing saved appearance data.

## Verification

`npm run build` and `cargo check` passed. All 13 interaction scenarios passed; additional cursor/style and text-context-menu checks also passed.

`npm run tauri dev` successfully opened a real Windows window titled Canary after the stale test server was stopped. The native dev session subsequently closed cleanly.

Verified left/right expanded/collapsed layouts, background reset/crossfade and persistence, cursor presets and CSS pointer states, input Select all/editing, context-menu cancellation, Focus mode, effect budgets, themes and existing installation frontend regressions.

Native Windows physical pointer/cursor appearance and title-bar actions still need a final human visual check: Windows Computer Use was unavailable during the preceding pass. Automated browser UI tests cannot confirm OS cursor rendering or physical window dragging. This limitation is not hidden by the build/test results.

No Java, authentication, Minecraft launch, CurseForge or installer work was added.
