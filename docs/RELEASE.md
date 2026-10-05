Canary desktop launcher for Windows x64 and Linux x64.

This source adds browser Microsoft PKCE sign-in, shared Modrinth/CurseForge discovery and content management, verified instance-storage migration, native custom backgrounds, compact cursors, the Canary bird desktop icon, real F11 fullscreen, and graceful Minecraft stopping. Existing Ely.by and Local providers and Java/Minecraft preparation are retained.

## Downloads

- **Windows:** use the `.exe` installer, or `.msi` for managed installation. Installers include WebView2 bootstrap support. They are not code signed.
- **Linux:** use `.deb` on Debian/Ubuntu, or make `.AppImage` executable and run it. AppImage may require FUSE or `--appimage-extract-and-run`.
- **SHA256SUMS:** checksums of every installer.

Microsoft requires a licensed Java Edition account and application permission for Minecraft services. CurseForge requires an official `CANARY_CURSEFORGE_API_KEY` in the launcher's environment; restricted publisher downloads remain manual. Local profiles are for single-player/local scenarios.

Validation and remaining account, network and platform checks are documented in [the integration QA report](https://github.com/ccardcat/canary/blob/main/docs/FINAL_INTEGRATION_QA.md). Real Local-profile Minecraft launching, graceful stopping, Unicode-path migration and Modrinth content/pack updates were exercised on Linux. Licensed Microsoft gameplay and live CurseForge installation were not verified without account credentials/API key.
