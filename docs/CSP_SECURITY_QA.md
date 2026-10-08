# Canary CSP

Production CSP is enabled in `src-tauri/tauri.conf.json` and inherited by Windows/Linux builds. Tauri's default asset CSP modification remains enabled: it authorizes bundled startup scripts with generated hashes/nonces. Production does not allow inline scripts, script event attributes, `eval`, remote scripts, frames, plugins, web workers, HTML base changes or form submission.

Frontend connections are limited to the application origin, Tauri IPC, scoped local assets and the Modrinth API. CurseForge, Microsoft authentication and game downloads run in Rust; this browser policy does not interfere with their native HTTP clients or change their permissions.

Bundled fonts and cursors, scoped local pictures, data/blob images and HTTPS images remain available. HTTPS images are intentionally not limited to one CDN because project descriptions can link author-hosted images. They can make image requests to their hosts; CSP does not make those hosts private or remove tracking pixels. They cannot load executable scripts through `img-src`.

Inline CSS remains allowed for React/Motion, live appearance variables and positioning. Script event handlers remain blocked independently by `script-src-attr`. Imported file access still requires Tauri's asset scope; allowing an asset origin in CSP does not grant filesystem access.

Development has a separate `devCsp`, allowing Vite's inline initialization and loopback HMR WebSockets. It does not relax the packaged application's script policy. No production remote script origin, general `https:` connection permission or `unsafe-eval` is added.

Verification:

- `npm run build`: TypeScript and production Vite assets.
- `tests/csp.spec.ts`: the actual `dist` bundle under a production HTTP CSP with browser-normalized hashes for bundled inline code; startup/fonts/wallpaper/themes/live opacity, Discover API/icons/lazy descriptions, and deliberate script/handler/frame/connection injection. All three cases passed.
- `.github/scripts/csp-smoke.mjs`: passed in the actual packaged Windows WebView2 with generated Tauri CSP, real IPC and deliberate injection. Normal startup, themes, fonts, wallpaper and live surfaces generated no CSP violations; the five deliberate injection attempts generated the expected blocks. It uses a unique WebView profile and `CANARY_QA_DATA_ROOT`, which exists only in inspector builds behind the `native-qa` feature. It never uses real user accounts or instances.

The previous Windows window/material suite had a documented failure before this CSP change: it clicked the Background page and immediately dereferenced a button while AnimatePresence was still switching tabs. Its click helper now waits for the target to render. That suite explicitly enables Hero in its own test profile because it measures Hero geometry; fresh-user defaults remain unchanged.

The Windows native check is also part of GitHub desktop verification. This is a compatibility/security regression check, not a complete penetration test or a guarantee against malicious native Minecraft mods.
