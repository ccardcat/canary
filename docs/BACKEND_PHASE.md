# Canary — backend phase, 5 October 2026

## Status

The existing Tauri application and visual architecture are preserved. This pass adds a real Windows runtime backend, not a browser launcher or simulated game process. This report records the initial runtime phase. The subsequent [accounts/content pass](CONTENT_ACCOUNTS_PHASE.md) adds direct documented Ely.by launcher authentication and safe Modrinth content/pack updates; the old OAuth setup blocker no longer applies. Remaining production/runtime validation gaps are listed below.

## Implemented

- Modular Rust backend: accounts, Java, Minecraft metadata/runtime, loaders, Modrinth repair, CurseForge API, downloads, processes, storage, settings, artwork and Windows system information.
- Persisted instance model: provider/project/version, Minecraft/loader versions, isolated directory, artwork, installation/last-played timestamps, playtime, favorites, state, errors and per-instance overrides.
- Native Library reads instances from disk. Existing `canary-instance.json` Modrinth records are migrated without moving their folders or touching worlds. New records use `instance.json`; runtime and provider inventories are separate.
- Existing Settings layout, appearance, backgrounds, fonts, custom title bar and RU/EN system remain. Runtime controls are added to Settings → Canary; Local accounts use the existing account area.
- Library actions: create Vanilla/loader instance, Play, Stop, explicit Force stop after normal stop failure, verify/repair, open folders, edit overrides, favorite, rename and confirmed deletion.
- Real session activity, game output/log files and screenshots from installed instances. Screenshots open in the OS image viewer; no fake gallery or playtime.

## Fixed

- Modrinth installation now invokes runtime/Java preparation before presenting the newly installed pack as ready.
- Preserved the already corrected Modrinth `versionId` index mapping; the old `version_id` error is covered by the existing schema regression test.
- Protected Canary metadata names from pack overrides; added Windows filename checks to the runtime storage layer.
- Corrected Tauri asset scope to `$LOCALDATA/Canary`, preserving the existing data root rather than changing it to the app identifier's folder.
- Corrected progress accounting for metadata downloads, stage changes and unknown file sizes; unknown totals are not presented as invented byte totals.
- Corrected Quilt metadata requests to the working v3 endpoints.
- Prevented instance editing/deletion while a job or game owns that instance, and kept the process entry alive until exit metadata/playtime has been saved.
- Prevented normal Canary window close while its Minecraft process monitor is active. The UI asks the user to stop Minecraft first; it never silently kills a world on close.

## Ely.by auth

The subsequent accounts/content pass implements the official [launcher authentication protocol](https://docs.ely.by/en/minecraft-auth.html): login/email + password, optional TOTP, validate, refresh and invalidate. It does not require an OAuth client ID or secret. Sessions use Windows Credential Manager; account metadata has no password/token fields. The documented authlib-injector integration extends the existing JVM argument builder.

See [current implementation and validation](CONTENT_ACCOUNTS_PHASE.md). Successful login/session refresh/remote-authenticated game launch still need the owner's account test. Negative authentication and secure-storage tests are separate evidence, not a successful sign-in.

## Microsoft auth

**Not configured / not a working provider.** No legitimate Entra Application client ID was provided. `CANARY_MICROSOFT_CLIENT_ID` is a configuration point and availability indicator only; setting it does not implement authentication.

Account metadata, provider discriminator, secure credential reference, per-instance account selection and launch-identity separation are prepared. A later provider must implement its own official OAuth → Xbox Live → XSTS → Minecraft Services/profile/entitlement lifecycle. No other launcher's client ID or desktop client secret is included.

## Local

- Create several Local profiles, switch without restarting, rename and remove with confirmation.
- Username validation: 3–16 ASCII letters, digits or underscores.
- UUID generated once per profile and preserved across storage reloads. Per-instance account override wins over global selection.
- Identity is explicitly Local/offline (`legacy` user type); it is not a Microsoft or Ely.by identity and does not authenticate to official online-mode servers.
- Actual persistence, switching/removal and game launch were checked. The validation profile `CanaryTest` remains available in the owner's data folder.

## Java

- Tests actual executables with `-XshowSettings:properties -version`, capturing version, major, architecture and vendor with a timeout.
- Searches PATH, JAVA_HOME, common Windows installation directories and Canary-managed runtimes.
- Selection: per-instance executable → global executable → detected compatible Java → automatic managed Java when enabled.
- Required Java major comes from Minecraft metadata rather than one fixed version for every game. Managed downloads use the official Adoptium API, publisher SHA-256, staging extraction and executable validation before publication.
- Actual Java 21 detection/selection and managed Java 25 download were exercised. Java 8/17 parsing exists, but their game integrations were not run in this pass.
- Global/per-instance RAM, JVM/game arguments and resolution are persisted. Windows physical memory is queried for validation. Fullscreen is supported in global settings and in the Rust override model.

## Minecraft runtime

- Official `piston-meta.mojang.com` version manifest and hashed version metadata/client/logging configuration.
- Releases and optional snapshots, modern and legacy arguments, Windows OS/architecture/version rules, feature rules and placeholders.
- Shared immutable libraries/assets cache; SHA-1 verification, native classifier extraction, logical assets for legacy metadata, classpath and metadata main class.
- Native instances keep their own mutable mods/config/worlds/screenshots/logs folders. Launch uses that instance as the game working directory and passes arguments as an array, not a shell command.
- Prepared-runtime inventory avoids redownloading intact files. Full Repair performs checksum validation; the fast launch path checks saved sizes/existence, so same-size corruption requires Repair to detect it.

## Loaders

| Loader | Implementation | Actual validation |
| --- | --- | --- |
| Vanilla | Official Minecraft metadata/runtime | 1.21.1 prepared and real Java process launched |
| Fabric | Official v2 loader profile | Fabulously Optimized, Minecraft 26.3 / Fabric 0.19.5; actual game window observed |
| Quilt | Official v3 loader profile | Minecraft 1.21.1 prepared successfully; game launch not tested |
| Forge | Official publisher installer, headless client install/processors | Minecraft 1.21.1 prepared successfully; game launch not tested |
| NeoForge | Official publisher installer, headless client install/processors | Minecraft 1.21.1 prepared successfully; game launch not tested |

Loader versions are queried dynamically. Forge/NeoForge run their legitimate installer in a fresh Canary-owned staging folder, record installer output and copy verified generated libraries into the shared cache. Old/unsupported installer formats fail explicitly; broad historical version compatibility is not claimed.

## Modrinth

- Existing `.mrpack` installer remains: real version/archive, manifest validation, client environment rules, file verification, `overrides` then `client-overrides`, progress and atomic instance publication.
- Installation is connected to the new runtime/Java preparation command. Existing installed packs can also prepare/launch through native Library.
- Repair validates managed pack files, restores missing manifest downloads, preserves existing mutable configuration and unknown user mods, and backs up conflicting managed mods before replacing them.
- The subsequent content pass adds reviewed in-place updates for the same Minecraft version/loader, using the preserved installer in isolated staging. User additions/worlds/existing configuration are preserved, conflicts block application, and content snapshots restore the preceding pack metadata/files. See the current report for actual update/rollback evidence.
- A fresh Fabulously Optimized `.mrpack` integration test passed, including repeated install reuse. Separately, the existing real pack was prepared and launched. Native Discover clicks were not automated; UI invocation and real backend downloads/processes were tested separately.

## CurseForge

Official API commands for search, project, files and ZIP manifest installation are implemented. They need the owner's own `CANARY_CURSEFORGE_API_KEY` in Canary's process environment. The actual environment has no key; no authenticated API or pack installation is claimed tested.

The API key goes only to the official API client, with redirects disabled. A missing `downloadUrl` or disabled third-party distribution returns a manual-download requirement; no guessed CDN URL/mirror is used. Published SHA-1 is required.

Remaining local integration work: connect a CurseForge provider to the existing Discover UI, resolve manifest file destinations by content class (current installer assumes mods), complete repair/update behavior and test with the owner's real key. Setting the environment variable alone does not finish those tasks.

## Launch

Actual Java process creation, stdout/stderr capture, PID tracking, Running/Ready/Crashed state, exit code, persisted last-played/playtime and Stop are implemented.

Native evidence from this Windows host:

- Vanilla 1.21.1: prepared; real Java process stayed alive for the 20-second check; exit/playtime persisted. A rendered Vanilla window was not separately observed.
- Fabulously Optimized 15.0.0-alpha.4, project `1KVo5zza`, version `9toQ7Bv7`, Minecraft 26.3, Fabric 0.19.5: actual separate `Minecraft* 26.3` window observed. The second integration run stayed alive for 240 seconds and normal Windows termination succeeded. Its persisted total playtime after both checks was 303 seconds.
- Canary itself was started with `npm run tauri dev`; a native window titled `Canary` and nonzero window handle were observed.

These are Local-profile tests. No remote-authenticated game launch is claimed. This verifies startup/process behavior, not interactive gameplay in a world.

## Accounts

One persisted account model distinguishes Local, Ely.by and future Microsoft identities. Sensitive credentials are not fields of account/instance JSON. Launch credentials have no Serialize/Debug implementation. Remote identities fail closed until a real validated provider exists.

The account menu and Settings are connected to actual Local account commands. Windows Credential Manager helpers passed an actual disposable write/read/delete roundtrip; this checks storage availability, not Ely.by session persistence.

## Downloads

The runtime downloader reuses HTTP clients, streams files and hashes, checks HTTPS/redirects, validates sizes and publisher checksums, uses unique `.part` files and atomic replacement, retries transient failures/checksum failures and bounds concurrency to 1–8.

Runtime progress reports stage, current file, verified/prepared bytes, known totals and file counts. Cache-hit bytes count toward preparation, not new network transfer. Real network speed is tracked separately in Rust; the UI does not invent speed/ETA. Preparation can be cancelled; a running game uses Stop instead.

The existing `.mrpack` downloader was preserved and is separate from the newer runtime downloader. It does not gain runtime cancellation merely because runtime preparation supports it. Pause/resume, byte-range continuation and a persisted multi-job Downloads queue are not implemented. The UI currently displays the latest runtime operation.

## Security

- Windows Credential Manager, no plaintext credential fallback; actual roundtrip tested and test entry removed.
- Instance IDs/path traversal, Windows reserved filenames and managed-path symlink checks; archive symlinks rejected. Narrow local asset protocol scope for instance screenshots/cached icons.
- Publisher hashes where available; local integrity receipts for versioned loader libraries whose metadata does not publish hashes. A local receipt is not a publisher signature.
- API credentials not emitted to the frontend; request errors omit URL query context. Sensitive launch identities are not dumped; recognized authentication output lines are redacted.
- No borrowed Microsoft/Ely.by credentials, fake login, unofficial download mirror or online-mode bypass.
- Existing worlds/configurations remain in place. Deleting an instance explicitly warns that it deletes that instance's worlds/screenshots.

This is not a completed security audit. General ZIP expanded-size limits, advanced crash recovery and remote-provider token redaction/lifecycle still need further validation before production remote auth.

## Tests

Completed on this Windows host:

1. `npm run build` — passed (TypeScript and Vite production frontend).
2. `cargo check --offline` — passed.
3. `cargo test --offline --lib` — 16 passed; the one real-network test is ignored by default.
4. Explicit `real_modrinth_install -- --ignored --nocapture` — passed with a real network `.mrpack`, files/hashes/overrides and existing-install reuse.
5. Existing Playwright desktop UI suite — 15 passed: navigation, themes, backgrounds/fonts/cursors, localization, persistence, resize, context menu/image behavior and API/UI contracts.
6. Additional backend UI contract suite — 2 passed: Local menu, Play/Stop command connection, readable errors/details, Settings Java selection and RAM save. These use clearly marked test-only Tauri IPC fixtures, not real downloads or authentication.
7. Native `canary-backend-check` — real Vanilla/Fabric launch, process exit/playtime/reload; Quilt/Forge/NeoForge preparation; Windows Credential Manager roundtrip.
8. `npm run tauri dev` — native Canary window confirmed. Full native mouse-driven UI/gameplay testing was not available through the current tools; it must not be inferred from browser contract tests.
9. Native `failure-check` — passed: cancellation before request, actual in-flight official client download cancellation/partial cleanup, same-size corrupt-cache rejection, incompatible Java, real connection refusal, unconfigured Microsoft and actual non-zero Java process exit persisted as Crashed. The invalid JVM argument is applied only inside a disposable validation instance. Unknown game arguments were found to be ignored by Minecraft, so they are not used as the crash test.

The opt-in validation executable is excluded from default builds:

```powershell
cargo run --offline --manifest-path src-tauri/Cargo.toml --features backend-check --bin canary-backend-check -- audit
```

It also supports `secure-store`, `vanilla`, `fabric`, `quilt`, `forge`, `neoforge`, and `launch <existing-instance-id>` (actual downloads/processes). The launch check stops its own game after the selected hold period and preserves real account/instance data. Use deliberately, not as an ordinary app startup command.

For negative integration checks, `failure-check <prepared-Vanilla-instance-id>` borrows that instance's verified immutable runtime artifacts and creates a separate temporary game directory. It never edits the source instance's JVM arguments, worlds or configuration. The validation root is removed afterwards.

## Remaining blockers / work

External setup blockers:

1. **Ely.by:** owner-driven successful login, session restore and authenticated game/server testing remain unverified. No OAuth application/exchange service is required for the implemented direct launcher protocol.
2. **Microsoft:** missing legitimate own Entra client ID; implementation is intentionally deferred.
3. **CurseForge:** missing owner's official API key prevents authenticated integration tests.

Local unfinished work, not credential blockers:

- CurseForge Discover UI/content-class destination handling and repair/update integration.
- Safe in-place pack update/conflict UI is now implemented in the subsequent content pass for the same Minecraft version/loader. Cross-version migration remains outside that workflow.
- Reconcile a surviving Minecraft process after Canary is forcibly killed. Normal close is currently prevented while its monitor owns a game; hard-crash reattachment is not implemented.
- Startup recovery UI for corrupt settings, richer game-crash summary/report UI, whole-provider error/retry coverage.
- Home still uses its previous local project-library presentation; newly created Vanilla instances and native session history are primarily shown in Library/Activity.
- Restore missing pack override files during repair, improve download queue/history and cancellation across the preserved `.mrpack` stage.
- Remote auth tests, broader Java/loader/version compatibility, actual native UI/gameplay QA and a production bundled-path launch check. No release installer was built in this pass.

## Run / data locations

Project: `C:\Users\hxppy\Desktop\whatscord launcher`.

```powershell
Set-Location 'C:\Users\hxppy\Desktop\whatscord launcher'
npm run tauri dev
```

Data: `%LOCALAPPDATA%\Canary` (unchanged). The Windows debug app remains internally named `src-tauri\target\debug\scaffold.exe`; its visible product/window title is Canary. This development binary expects the Vite dev server and is not a standalone installer.

Changes are saved in the working tree. No commit, push, release publication or deletion of build dependencies was performed.
