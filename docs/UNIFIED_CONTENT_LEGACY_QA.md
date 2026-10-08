# Unified surfaces, compact content and legacy downloads

Validated on Windows, 2026-10-08, against main at `316bd22`.

## Changes

- Microsoft accounts display the active Minecraft skin head, a four-square Microsoft logo and `Microsoft`. The redundant authenticated status is hidden; expired and unavailable states remain visible. Public skin PNGs are cached from the authenticated profile's official texture URL. Texture failure does not fail authentication.
- Discover and the instance content catalog share compact cards with a 48px icon on the left. Library defaults migrate once to compact; the existing layout preference remains editable. Installed content rows are compact. Category counts appear inside the tabs, and the local drop zone is shown in the installed view.
- Buttons, inputs, cards and instance/settings dialogs share the adjustable material tokens. Removed fixed opaque control/dialog floors. Menus retain a readable minimum density. Low quality, focus and reduced transparency retain opaque fallback surfaces. Hover, selected and disabled controls follow their material fill.
- The content basket survives category/provider/page changes. Up to 100 projects can be reviewed together, including their dependencies, then installed by the existing atomic bulk transaction. Failed previews preserve the basket and download nothing. Datapacks preserve the world selected when added to the basket. Shaders still require an installed compatible shader loader.

## Legacy download root cause

Before 1.13.2, official library metadata contains entries with only native classifiers and no ordinary artifact. Canary incorrectly synthesized an unclassified Maven JAR for these entries. The publisher returns 404 because that artifact does not exist. Download only the artifacts actually published by the metadata; synthesize Maven paths only for loader profiles without a downloads object.

Use the official [Mojang manifest](https://piston-meta.mojang.com/mc/game/version_manifest_v2.json), Piston object hosts, libraries.minecraft.net and resources.download.minecraft.net. Old Mojang aliases preserve object hashes when normalized to Piston. Old Forge Maven URLs normalize to [Forge Maven](https://maven.minecraftforge.net/). Known publisher HTTP URLs upgrade to HTTPS. No unverified mirror or TLS downgrade was introduced.

Pre-1.13 Forge installer profiles now extract their embedded universal library from the publisher-verified installer and merge versionInfo, rather than attempting to execute the unsupported old installer schema. Modern Forge/NeoForge installer behavior is retained.

## Verification

- Frontend production build: passed.
- 52 distinct browser cases passed across background-live, materials, sidebar-preview-cleanup, unified-content, appearance, layout-controls and ux-performance. Checks cover account branding/skin rendering, compact icon position/card height, live opacity in Dark/Light/AMOLED, multi-mod/resource-pack installation, shader/datapack batches and world retention, failure preservation, persistence and existing cancellation/task UI. Fixtures isolate account and content interaction tests from private credentials.
- Rust unit suite: 85 passed, 7 ignored. Includes URL/coordinate handling, legacy Forge extraction, account texture URL selection, downloader integrity/cancellation and content transactions.
- Explicit ignored integration test `real_legacy_vanilla_preparation`: passed against real publisher files, using a disposable isolated cache. Downloads and integrity verification completed for the following versions:

| Version | Classpath entries | Verified files |
| --- | ---: | ---: |
| 1.12.2 | 33 | 1339 |
| 1.8.9 | 32 | 774 |
| 1.7.10 | 30 | 724 |
| 1.6.4 | 17 | 625 |
| 1.0 | 8 | 488 |
| b1.7.3 | 8 | 488 |

- Native CI scripts updated for current Background/Appearance navigation, slider names, preference initialization after pagehide, and the visible particle count. Both scripts pass Node syntax checks.

Local screenshots are in the ignored `.qa/unified-content` directory. The live legacy test verifies preparation/downloads, not game launch. Legacy Forge archive metadata and extraction were checked; a full real Forge launch and owner Microsoft OAuth login were not performed. Packaged Windows compositor QA runs separately in GitHub verification; it is not represented as a local pass. Rebuild the desktop executable to use these source changes.
