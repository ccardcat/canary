# Visual stabilization QA — 2026-10-07

Starting source of truth: `main` at `f193f367ecb67931954c42c288836ea5f638bce7` (Canary 0.1.5). Shell `git pull` could not authenticate; the connected GitHub API supplied the exact current tree and commit. All file blob hashes and the reconstructed Git tree were verified before editing.

## Changes and audit

| Area | Change | Verification |
| --- | --- | --- |
| Controls | Shared geometry in ControlSystem.css: 34/40/44 px scale; 14/16/20 px icons; theme-aware focus; safe wrapping; static interaction geometry; larger icon/titlebar targets | Measured heights, icon centers, hover/pressed bounds, keyboard focus; existing control/sidebar/material tests |
| Instance Content | Detail uses normal page flow with its own header actions; New Instance and provider occupy separate rows; safe search/action wrapping | RU Monocraft and EN Nunito at 1920, 1280, 1000, 780, 600 and 480 px; measured pairwise overlap and clipping |
| Providers | Shared availability registry and localized ProviderSelect/ProviderUnavailable; abort pending work and clear old results; disable unavailable install/repair/update; optional native update filter preserves mixed inventories | Discover and Content Coming Soon; no CurseForge IPC calls, results, pagination or toast; Modrinth return and cancellation tests; isolated Rust filter regression added |
| Settings | Separate Storage maintenance with 12 px lower gap; equal folder actions; metrics grid and wrapping path; wide Local input with right-side action; neutral help text; legitimate Microsoft configured status; wider About with subtle border and structured metadata | Four widths down to 480×340; every Settings section; account rename/delete and storage confirmation tests |
| Liquid Glass | Preset blur 26→18; intensity 70→55; profile blur 1.35→0.9, saturation 1.4→1.12, highlight .3→.085, edge .28→.13, shadow .25→.1; one gentle sheen, one inner highlight and one broad shadow | Six distinct materials; Light/Dark/AMOLED/System, nine palettes, ten accents and extreme backgrounds; existing foreground readability floors preserved |
| Hero | Remove drift scale/translation and hover reset; choose copy once per Home visit; absolute cover layers; stable responsive container and controls; preserve decode/crossfade and next-image preload | 48 repeated arrow changes across four sizes; imported 2400×600, 480×900 and 1920×1080 images; identical geometry |
| Global | Restore narrow provider visibility; responsive category tabs; prevent card/button hover movement; common empty states; metadata no longer resembles inputs; tooltip/context-menu top layer; bounded account/filter popovers; dropdown position calculated before painting; nested Escape no longer cancels its parent dialog; Activity no longer repeats its heading/empty state | Main-page/material containment, native-modal popup/tooltip checks, sidebar/fullscreen/scrollbar regressions |

The backend change is restricted to optional availability filters for update checks. Existing provider architecture, cancellation jobs, cleanup, auth and Discord RPC remain intact. Existing tests that expected working CurseForge or moving Hero copy were updated to the new requirements, retaining request cancellation and Modrinth coverage.

## Test environment and evidence

The actual React UI was loaded and interacted with in headless Chromium 153 with native IPC fixtures. Tests resized windows, opened screens/dialogs, switched themes/providers, measured rendered bounds and produced screenshots, which were visually inspected. Screenshots and measurements remain outside Git under ignored `.qa/`.

The fixture tests verify frontend behavior and IPC contracts. They do not execute native downloads, external authentication, real WebView2/WebKit rendering, the Windows compositor or physical native drag/drop.

- Frontend production build: passes; existing Vite warning remains for the main JavaScript chunk exceeding 500 kB.
- Frontend suite: 88/89 passed in the full run. The remaining nested-popup cancellation bug was fixed; all six related tests passed on rerun. The ten stabilization scenarios then passed together, and the additional Screenshots/Activity scenario passed separately (1/1). This covers 91 distinct scenarios across the full run and targeted reruns; it is not a claim that one final 91-test run was executed.
- Local `cargo check`: attempted; unavailable because Cargo/Rust are not installed.
- Local `npm run tauri dev`: attempted; blocked by missing Cargo (`cargo metadata` could not execute).
- Native Windows/Linux build, Rust checks/tests and Windows window QA: existing `Desktop verification` workflow runs after the main update; results belong to that exact commit and must be checked independently.

## Follow-up boundary

Before calling native visual QA complete, confirm the current commit's Windows/Linux workflow and inspect real native low-height resize, maximize/fullscreen, tooltip behavior and physical drag/drop. Perform real Ely.by/Microsoft authentication and Modrinth downloads only with appropriate test accounts/data. Windows XP theme is deliberately outside this pass.

## Native CI evidence

Code commit: `0ca4cac73776ff82feea753d0595d000d0cf3d0d`, [Desktop verification run 37616797063](https://github.com/ccardcat/canary/actions/runs/37616797063). Both Windows and Linux frontend builds, `cargo check` and `cargo test` passed. Linux completed the entire workflow and produced its desktop installer. Linux Rust results: 74 passed, 0 failed, 6 intentionally ignored external-service/download tests; the new unavailable-provider update-filter test passed. The documentation follow-up changes no application code.
