# Loader compatibility — 2026-10-08

The custom-instance dialog queries each official loader catalog for the selected Minecraft version. Vanilla is always offered; mod loaders appear only when the publisher returns compatible releases. A failed catalog is shown inline with Retry, rather than interpreted as unsupported or displayed as a global download/network failure. Controls and submission are guarded while compatibility is being checked. Changing Minecraft retains a supported loader and falls back to Vanilla when it becomes incompatible. Old responses cannot overwrite a newer selection.

The native create command validates the exact Minecraft/loader/release combination before creating game files. Validation is part of the existing cancellable installation job and transaction. The .mrpack path still uses its own manifest and import workflow.

## Publisher sources

- Fabric: https://meta.fabricmc.net/v2/versions/game and /versions/loader/{minecraft} ([API documentation](https://github.com/FabricMC/fabric-meta)).
- Quilt: https://meta.quiltmc.org/v3/versions/game and /versions/loader/{minecraft}.
- Forge: https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml; Minecraft prefix must match exactly.
- NeoForge: https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml. 1.21 maps to 21.0.*, 1.21.1 to 21.1.*. [From 26.1](https://neoforged.net/news/26.1release/), the first three numeric components identify Minecraft, including its hotfix. Snapshot releases must match their snapshot suffix.
- NeoForge 1.20.1 uses the publisher's separate net/neoforged/forge artifact and installer URL.

## Verification

- Production frontend build passed.
- Parser tests cover exact Forge patch matching, NeoForge 1.21 versus 1.21.1, 26.1 versus 26.1.1, snapshot isolation and legacy NeoForge repository selection.
- Browser contracts cover old-version filtering, preserving Forge across supported versions, resetting incompatible Fabric, Vanilla-only catalogs, delayed stale responses, creation arguments, inline provider failure and Retry.
- Existing Vanilla, Fabric and MRPACK creation contracts exercise single submission and Library refresh.
- Live publisher verification is a separate ignored Rust test, real_publisher_compatibility, explicitly run for this change. It queries all four publishers for 1.8.9, 1.12.2, 1.20.1, 1.21, 1.21.1 and 26.1, and checks the incompatible-selection error. Outcome: passed against the real official servers (17.25 seconds).

This checks compatibility metadata and the creation flow. It does not claim that every Minecraft release and every loader installer was downloaded or launched.

Final results: production frontend build passed; full Rust suite 90 passed / 9 explicit live tests ignored; the loader live test separately passed; 7 selected browser contracts passed (the old-version test was corrected to expect Forge to remain selected when switching between two Forge-supported versions and then rerun successfully). No game installation or launch across the whole Minecraft catalog is claimed.
