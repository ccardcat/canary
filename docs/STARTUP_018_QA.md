# Canary 0.1.8 — startup and visual cleanup

The splash covers the window with a translucent theme vignette, showing the selected wallpaper or native desktop material behind the brand. Its exit crossfades the interface while the brand gently lifts/scales and fades. Only transforms and opacity animate; full-window animated backdrop blur remains removed.

Normal startup holds the splash for at least 2.85 seconds, then crossfades for 1000 ms. Completion follows the actual CSS animation end instead of a wall-clock fade timer, so delayed first frames cannot cut the reveal short; a three-second exit fallback prevents a stuck overlay. Reduced motion uses a 900 ms hold and a 220 ms exit window without brand movement; existing global reduced-motion rules disable CSS animation. Input stays locked until the exit completes. Fonts, visible artwork, the initial local snapshot and the native material must settle before the reveal; a 12-second upper bound prevents an indefinite splash.

Both Tauri configurations create a hidden window with a black initial background. The frontend requests visibility after the native material, fonts and visible artwork settle and the first splash frames; a native three-second fallback restores visibility if that handshake fails. Native material application waits for capability detection and skips duplicate applications of the same effective configuration.

The first snapshot skips the remote CurseForge health check but retains local instance/server history. Provider verification and account restoration run after the reveal; update checks are delayed. Discover search starts when Discover is visited, and Home community queries run only when that section is enabled.

Fresh preferences use a solid black AMOLED theme, solid surfaces, no background image rendering, no particles or hero, and a system cursor. Existing preferences retain their colors, wallpaper, opacity, typography and material choices. The sidebar and window branding remain; repeated Canary overlines/breadcrumbs are removed from content headings and settings.

Unused solid/desktop wallpaper layers are not mounted. Artwork changes keep at most a previous/current pair and discard previous layers after the fade. Reduced motion and low quality switch artwork directly. Background animations pause when the document is hidden. Page transitions use opacity without translating the whole glass page, and the shared CSS transition list avoids animating every property.

Version 0.1.8 is consistent in package.json, package-lock.json (both root entries), Cargo.toml, the scaffold entry in Cargo.lock and tauri.conf.json. About reads package.json; native launcher metadata reads CARGO_PKG_VERSION. Client User-Agent values now use the Cargo version, and the Worker identifies this release as 0.1.8. Dependency versions are unchanged.

Verification:

- Transparent splash follow-up: all 12 startup/CSP/centering cases passed, including actual browser animation midpoint opacity, completion after CSS animation end, input lock, reduced motion, one-time window showing and saved themes. Midpoint checks seek and restore the real animations rather than depending on the test runner producing a frame at a specific timestamp. Screenshot review confirms the selected wallpaper remains visible under the translucent splash.

- Production TypeScript/Vite build with version 0.1.8.
- Browser startup/Home suite: 11 passed; targeted native-material/titlebar/control checks: 3 passed (one repeated case); wallpaper pairing/restart check: 1 passed; delayed Desktop-to-Solid native material race: 1 passed. Total: 15 distinct cases, 16 executions.
- Screenshot review: fresh black profile and preserved light/glass profile in .qa/startup/.
- Worker tests: 13 passed with synthetic keys, including the unchanged approval gate.
- Final native Rust library suite with version 0.1.8: 92 passed, 0 failed, 9 explicitly ignored network integration tests.

Browser native-window operations use fixtures. These checks validate readiness ordering, rendering and contracts; they are not a cold-launch FPS benchmark on the user's hardware. No production running launcher was replaced or terminated.
