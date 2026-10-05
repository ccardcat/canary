Canary desktop launcher for Windows x64 and Linux x64.

This source adds browser Microsoft PKCE sign-in, shared Modrinth/CurseForge discovery and content management, verified instance-storage migration, native custom backgrounds, compact cursors, the Canary bird desktop icon, real F11 fullscreen, and graceful Minecraft stopping. Existing Ely.by and Local providers and Java/Minecraft preparation are retained.

## Downloads

- **Windows:** use the `.exe` installer, or `.msi` for managed installation. Installers include WebView2 bootstrap support. They are not code signed.
- **Linux:** use `.deb` on Debian/Ubuntu, or make `.AppImage` executable and run it. AppImage may require FUSE or `--appimage-extract-and-run`.
- **SHA256SUMS:** checksums of every installer.

Microsoft requires a licensed Java Edition account and application permission for Minecraft services. CurseForge requires an official `CANARY_CURSEFORGE_API_KEY` in the launcher's environment; restricted publisher downloads remain manual. Local profiles are for single-player/local scenarios.

Validation and remaining account, network and platform checks are documented in [the integration QA report](https://github.com/ccardcat/canary/blob/main/docs/FINAL_INTEGRATION_QA.md). Real Local-profile Minecraft launching, graceful stopping, Unicode-path migration and Modrinth content/pack updates were exercised on Linux. Licensed Microsoft gameplay and live CurseForge installation were not verified without account credentials/API key.

## Recovering a failed Actions run

If a job reports `The job was not acquired by Runner of type hosted` or an internal server error before its steps start, GitHub failed to provision the hosted runner. Open the failed Desktop release run and choose **Re-run jobs → Re-run failed jobs** after GitHub runner availability recovers. Completed jobs and their uploaded artifacts can be reused in that run; there is no need to move the release tag or change the application version for this infrastructure failure.

If both release build jobs succeeded and only publication failed, an alternative is **Desktop release → Run workflow** on `main`: enter the existing tag, select the original platforms, and set `reuse_run` to that successful build run's numeric ID. The workflow checks that all installers required for the selected platforms are present before publishing. Leave `reuse_run` empty if the required artifacts were never uploaded.
