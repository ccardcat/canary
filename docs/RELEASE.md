Canary desktop launcher for Windows x64 and Linux x64.

Version **0.1.5** adds native Windows Acrylic/Mica/Mica Alt with supported fallbacks, configurable glass materials, titlebar styles, improved snow/sakura/autumn effects, rotating Home artwork, keyboard-accessible glass dropdowns and local `.mrpack` preview/import. F11 restores normal window geometry or maximized state; instance creation closes after success and shows the new Library card. Microsoft authentication and CurseForge failures now identify the failed stage or key/service problem. Existing providers, content management, storage migration, Minecraft/Java preparation and graceful stopping are retained.

## Downloads

Discord Rich Presence is integrated with real Minecraft sessions, task progress and launcher navigation. Settings → Discord offers persistent privacy toggles and immediate Off/clear. The site button opens https://plash3r.github.io/canarylauncher-site/. Discord is optional; the launcher reconnects automatically when it becomes available. Unconfirmed Portal asset keys and download URLs are omitted. See [Discord configuration and QA](https://github.com/ccardcat/canary/blob/v0.1.5/docs/DISCORD_RICH_PRESENCE_QA.md) for setup and the remaining native Discord visual checks.

- **Windows:** use the `.exe` installer, or `.msi` for managed installation. Installers include WebView2 bootstrap support. They are not code signed.
- **Linux:** use `.deb` on Debian/Ubuntu, or make `.AppImage` executable and run it. AppImage may require FUSE or `--appimage-extract-and-run`.
- **SHA256SUMS:** checksums of every installer.

Microsoft requires a licensed Java Edition account and application permission for Minecraft services. CurseForge uses a public Cloudflare gateway configured with `CANARY_CURSEFORGE_PROXY_URL` at build time. The publisher key is a server secret; end users do not enter it. See [gateway deployment](../services/curseforge-gateway/README.md). Restricted publisher downloads remain manual. Local profiles are for single-player/local scenarios.

Validation and remaining account, network and platform checks for this version are documented in [the implementation and QA report](https://github.com/ccardcat/canary/blob/v0.1.5/docs/FOLLOWUP_INTEGRATION_QA.md). Linux uses an opaque native window with a truthful Solid fallback for Windows-only materials. Licensed Microsoft gameplay and live CurseForge installation require account credentials/API key and are not claimed as verified in the cloud environment. Windows CI provisions WebView2, builds the production installers, then tests a separate same-source release executable with the inspector feature and an isolated browser data folder. The inspector executable stays in QA artifacts; publication includes only production installers. Low quality now reliably disables UI backdrop blur in production CSS.

## Recovering a failed Actions run

If a job reports `The job was not acquired by Runner of type hosted` or an internal server error before its steps start, GitHub failed to provision the hosted runner. Open the failed Desktop release run and choose **Re-run jobs → Re-run failed jobs** after GitHub runner availability recovers. Completed jobs and their uploaded artifacts can be reused in that run; there is no need to move the release tag or change the application version for this infrastructure failure.

If both release build jobs succeeded and only publication failed, an alternative is **Desktop release → Run workflow** on `main`: enter the existing tag, select the original platforms, and set `reuse_run` to that successful build run's numeric ID. The workflow checks that all installers required for the selected platforms are present before publishing. Leave `reuse_run` empty if the required artifacts were never uploaded.
