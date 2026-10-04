# Canary first-phase validation

Validated on 2026-10-04 in Debian 13 with Node 24.19.0, Rust 1.99.0, GTK 3.24.49 and WebKitGTK 2.54.0.

## Diagnosed defects

- Pagination buttons called `load(true)` immediately after setting offset. That requested offset 0 and reset offset again. Discovery now updates one criteria/page state, computes `(page - 1) * 12`, replaces that page's results, and cancels stale requests. Opening account/settings or changing language does not reset it. Loader options now send lowercase Modrinth facet values.
- Fabulously Optimized `9toQ7Bv7` has 45 downloaded files and an `overrides/` ZIP directory record. The old extractor passed that directory's empty relative path to `fs::write`, attempting to write a file over the instance directory after 90%. Directory entries are now handled explicitly, including nested directories and client-overrides precedence. A regression test reproduces the old failure and verifies the corrected extraction.
- The frontend could reuse versions loaded for another open project. Installation now resolves versions for the selected project, selects an actual `.mrpack`, and the backend verifies project ownership. The native instance path is retained in the local library.
- Light theme previously inherited a hardcoded light root foreground. Foregrounds now use semantic theme tokens; bright accents use a dark button foreground. System mode responds to OS theme changes and uses the matching bird logo.

## Validation

- TypeScript and production Vite build passed; Markdown is loaded separately from the initial UI bundle.
- Locked Cargo check/build passed.
- Default Rust suite: 5 passing tests for directory/client overrides, path/OS error diagnostics, cross-platform traversal, checksum diagnostics, and real Modrinth field names. The online integration test is separate and explicitly executed.
- Playwright: 7 passing tests covering changing results and request offsets through 1→2→3→2→1; query/sort/filter/type resets; stale responses; account repeat/outside/Escape; viewport widths 1600, 1280, 1000, 800, 640 and 480; light theme; reduced motion; safe Markdown; native-required message and structured error/retry behavior.
- Live API/UI smoke checks used real Modrinth responses, in addition to deterministic regression tests.
- Native Tauri was opened through `npm run tauri dev` with the existing Vite server. Home, Discover, detailed Markdown, settings, themes and resize were exercised in the actual WebKit window.
- A real Fabulously Optimized 15.0.0-alpha.4 installation fetched version `9toQ7Bv7`, downloaded its `.mrpack` and 45 files (42,803,435 bytes), verified checksums, applied overrides/client-overrides, wrote metadata and reached Library without restarting. An independent comparison verified all 45 downloaded files and 52 override files against the real archive. The local library contains the native instance path. Success/100% and the installed CTA were checked in the UI.

## Scope limits

Validation ran on Linux/Xvfb, not Windows hardware. The Windows OS-error field and Windows path rules are implemented; a Windows visual/runtime pass remains useful. No Minecraft launch, Microsoft authentication, Java management, CurseForge, backup, updater or release installer was added. Server browsing remains explicitly unavailable because this Modrinth API has no server listings.

Native WebKit needed software compositing in this cloud display. Chromium's proxy certificate store differs from the command-line/system trust store, so live Chromium smoke checks transported actual HTTPS responses through verified curl; deterministic browser tests and native WebKit checks are separate. TLS/signature/hash verification was not disabled.
