# Canary 0.1.8 release readiness

Audit base: `2ac633d89cfb4555d55b9315aed70a2f4c553199`, 9 October 2026.

## Changes

- Reduced decorative palette borders, material edge highlights and shadows. Ordinary action/choice buttons, metadata chips and disclosure groups no longer have bright decorative frames. Fill, text and keyboard focus still identify controls and selections. Forced-colors mode restores system borders.
- Soft and Glass card fills are slightly more translucent; menus and dialogs retain their existing readability floors. Solid, Low quality, Focus mode and Reduce transparency keep opaque fallbacks. Existing themes, backgrounds, layout and stored material choices are preserved.
- Material border strength now supports zero instead of stopping at 30%.
- Runtime dialogs close on actual backdrop clicks, not clicks in their interior padding. Escape is consumed by the top dialog. Settings' focus trap ignores native top-layer dialogs and disabled fields.
- First-error navigation waits for log filters to reset and uses the virtual list's wrapped offsets instead of assuming every row is 28px tall. Changing log filters/session resets the Copy confirmation.
- A stalled wallpaper load or native-material capability call can no longer leave the native window hidden after the 12-second startup deadline.
- Settings search results show localized section names rather than internal search keywords.
- Windows QA explicitly selects Desktop and a non-Solid surface preset before changing their sliders, and reports missing/disabled controls clearly.
- Fixed ANSI-bearing Actions log collection. The latest upstream Windows run failed at the missing-slider invocation; its follow-up reporting job also failed because `gh api` refused terminal escape sequences.
- Added complete browser QA to pull requests/main and tagged release builds. Publication requires successful browser QA, including when installer artifacts are reused. Release metadata checks cover npm, Tauri, Cargo and the notes version. Failures retain traces, screenshots and an HTML report.

## Executed checks

| Check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Passed using the committed lockfile |
| `npm run build` | Passed: TypeScript and production bundle |
| `node scripts/check-release.mjs` | Passed: 0.1.8 matches npm/Tauri/Cargo/notes |
| Gateway `node --test` | 13 passed, 0 failed |
| Material token inspection in Node | All seven styles produce finite tokens; zero edge works; Low quality gives 100% opacity/no blur |
| `npx playwright test --list` | 169 tests discovered, including four new regressions; this is discovery, not execution |
| Workflow YAML and embedded Python parsing | Passed |
| Windows smoke script syntax / `git diff --check` | Passed |

The local checkout was materialized through the GitHub connector at the exact base commit. Four backgrounds larger than the connector's contents limit could not be copied locally, including `sidebar-bg.webp`; the build's unresolved sidebar-image warning is a local materialization limitation, not a removed repository asset. The remote tree retains every original binary asset. The existing >500kB main-bundle warning remains.

## Required release checks still pending

The revised browser suite and Windows/Linux native build/QA must pass on the PR before declaring the release ready. Local Chromium could not run in this restricted environment, and the cloud preview timed out. Historical repository screenshots were inspected, but fresh after-change screenshots were not obtained locally. Rust tooling and a real native desktop session were unavailable here. None of these checks is represented as passed.

The upstream run [37835939965](https://github.com/ccardcat/canary/actions/runs/37835939965) passed gateway, Linux checks and both installer builds, but failed Windows QA and its reporting job. Those results apply to the base commit, not this change.

Before tagging:

1. Inspect the new CI screenshots for Dark, Light and AMOLED at 760×540 and 1280×800, with Solid/Glass/Clear/Vibrancy, keyboard focus, reduced motion and Low quality.
2. Require successful full browser tests, Rust checks/tests, Windows packaged WebView2 QA and Linux packaging from this source.
3. Confirm live licensed Microsoft/Ely.by gameplay, Modrinth downloads and publisher-approved CurseForge gateway/install with real accounts/network. Browser fixtures do not validate those services.
4. Review Windows desktop translucency in the actual compositor and test fullscreen/restoration and installer startup on supported hardware. Linux should report Solid fallback.
5. Keep production installers separate from the inspector QA executable. The project currently has no signing certificate.

No release tag, merge or production publication was performed by this audit.
