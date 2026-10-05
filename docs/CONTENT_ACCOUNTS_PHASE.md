# Canary — accounts and instance content, 5 October 2026

This pass continues the existing desktop application. Java selection, Minecraft runtime preparation, launch monitoring, the Modrinth mrpack installer and the visual/settings architecture remain. No installer/release, new scaffold or borrowed Microsoft client ID was created.

## Instance settings and motion

- Library cards use `instance.id`; the selected panel uses `settingsInstanceId`, never a shared boolean or array position.
- The floating panel sits outside the card grid. Switching A → B replaces its selected instance without resizing neighboring cards. It receives current metadata and closes when its instance is removed.
- Instance panels, content browsing/details, review/import/update/rollback/delete dialogs, new-instance creation, Ely.by forms, history and technical details use restrained fades/translates. Existing motion/reduced-motion settings and the OS preference remain authoritative.
- Native HTML dialogs provide focus containment, background inertness, Escape/backdrop close and focus restoration. Destructive content operations require explicit confirmation.

## Interface size

Settings → Appearance → Interface size: **90%, 100%, 110%, 120%**, default 100%. A root `--ui-font-scale` applies typography centrally; geometry is not browser-zoomed. It persists in the existing appearance store independently of font family. Nunito/Monocraft, Russian/English and all four sizes are covered by renderer tests. Technical paths/logs retain a readable monospace font and text selection.

## Ely.by

Implemented using the [official launcher authentication protocol](https://docs.ely.by/en/minecraft-auth.html), not browser OAuth:

- Login/email and one-use password are passed to Rust. The frontend clears the password on submission; Rust zeroizes its owned password and request-value copies. No password is written to JSON, localStorage, logs or diagnostics.
- Documented `password:TOTP` handling after the two-factor response; friendly localized errors.
- Selected profile UUID/name and client-token validation; several accounts, instant switching, logout/removal and persisted non-secret metadata.
- Access/client tokens and selected profile are stored through **Windows Credential Manager**, with no plaintext fallback. Startup validates/refreshes stored sessions; expired/unavailable status is reflected in metadata. Launch refreshes before using an Ely.by identity.
- Logout attempts token invalidation, then removes the local secure credential even when the server cannot be reached.
- Public profile textures use the [documented skin/session services](https://docs.ely.by/en/skins-system.html), HTTPS and bounded local artwork caching. The account avatar crops the real skin head; unavailable images fall back to initials.
- The existing JVM builder adds the [documented authlib-injector agent](https://docs.ely.by/en/authlib-injector.html) only for Ely.by. Its official publisher artifact is SHA-256 checked. Minecraft JARs are not patched; Local identity/launch behavior remains separate. Ely.by launches below Minecraft 1.7.2 are rejected.
- Session values are not frontend account fields. Minecraft output redacts the actual access token and recognized authentication lines.

**Not yet verified:** successful owner login, actual TOTP submission, remote session refresh/expiry and an Ely.by-authenticated Minecraft/server session. The negative API test and disposable Credential Manager roundtrip do not prove these. Enter credentials only in Canary’s login dialog, never in chat.

Microsoft stays disabled/prepared. `CANARY_MICROSOFT_CLIENT_ID` indicates legitimate future configuration; setting it does not implement the Microsoft/Xbox/Minecraft authentication lifecycle.

## Instance content

Open **Library → + Content**. The instance name, Minecraft version and loader remain visible throughout the flow.

- Mods, shaders, resource packs and datapacks have separate categories, inventory/search, counts and correct folder destinations.
- Modrinth search prefills the instance’s version/loader and supports sort, debounce, pagination and widening compatibility filters. Broad search results are marked cautiously; a compatible provider version is required for installation.
- Project details use safe Markdown, real gallery, authors, compatible versions and changelog. Release versions are preferred; beta/alpha are explicitly enabled.
- Required dependencies resolve recursively by provider project/version metadata and are reviewed before application. Optional dependencies are recommendations, never silently installed. Conflicting/unsupported dependencies block installation. Required dependencies that were disabled are re-enabled as part of the approved plan.
- Provider files use the existing runtime downloader and shared progress/cancellation events: stage, file, verified bytes/counts and actual average network speed. Downloads are staged, SHA-512 verified and inspected before final moves. Cancellation is available before final apply.
- Local file selection uses the Windows native picker. Native drag/drop is restricted to the content drop zone. Imports inspect archive contents/loader metadata, copy to same-volume staging, verify source/staged hashes and support cancellation before final apply. The source file is preserved.
- Mods → `mods`, shaders → `shaderpacks`, resource packs → `resourcepacks`.
- Datapacks require an existing `saves/<world>/level.dat` and go to that world’s `datapacks` directory. No fabricated global datapack folder or fake worlds. Identical datapacks can be added to different worlds; duplicates within one world are blocked.
- Shader versions are checked against real installed shader-loader mod IDs. Without support, the UI offers a compatible-mod search instead of silently installing arbitrary Iris/OptiFine. Local shader import also requires shader support; provider metadata supplies the stronger compatibility check.
- Persisted `content.json` records identity, provider project/version, file/hash, source, enabled state, dependency relationships and compatibility. Original pack files are distinguished from local/provider additions; new installs also record override content provenance.
- Rescan detects externally changed files even at the same size. Modified pack files become local/user-owned and are excluded from normal repair. Unknown manual files are never an ordinary repair deletion target.
- Enable/disable moves files to/from a controlled `.canary-content/disabled` location. No file is lost when switched off.
- Multiselect enable/disable/update/remove; compatible single/all updates, explicit review, dependency-use warning, optional unused-dependency removal and duplicate/version replacement protection.
- Open-folder actions preserve manual workflows. Running instances/active operations hold leases that prevent simultaneous content mutation.

CurseForge content browsing remains unavailable: no API key is configured and the existing provider commands are not connected to a content browser. There are no fake listings. Content installation does not require Ely.by authentication.

## Snapshots, rollback and safe pack updates

- Content mutations save up to eight snapshots. Metadata references deduplicated, content-addressed file backups; repeated identical files are not copied per snapshot. Only managed content/pack metadata is backed up, not whole worlds or a duplicate Minecraft runtime cache. The first snapshot of a large mod set still consumes disk space.
- Rollback verifies and prepares all restore copies before changing current files. It refuses unknown destination collisions or external changes, preserves newly scanned manual files, and restores enabled states/provider versions. Recovery staging is retained if a filesystem failure prevents reversal.
- Recent changes and Activity record installs, updates, toggles, removal and rollback. A recent-content crash hint presents changes without claiming a mod caused the crash; disable/rollback requires user action.
- Modpack update reviews a newer compatible version for the **same Minecraft version and loader**. It invokes the preserved mrpack installer in an isolated root, then safely merges verified content. User additions, worlds and existing configuration remain; conflicting user files block application.
- Pack snapshots include previous provider/loader version and hashed metadata references. Rollback restores the previous manifest, content, runtime receipts and pack version, while keeping current user-facing name/overrides. New unmodified override files can be removed on rollback; subsequently modified configuration is preserved.
- A changed loader version invalidates prepared receipts so the existing launch pipeline prepares it normally. The update workflow does not migrate Minecraft versions or change loader families.

## Validation evidence

The standard Rust suite covers archive/path validation, wrong loader/version, world selection, local duplicate/import cancellation, enable/disable/removal, external same-size edits, rollback, partial-apply recovery, pack conflicts and preservation, account identity/persistence and an actual disposable Windows Credential Manager roundtrip.

Renderer tests cover per-instance settings identity/card geometry/deletion, content compatibility prefill and dependency review, pack update confirmation, password clearing/TOTP UI, RU/EN typography sizes/persistence, existing themes/backgrounds/cursors, navigation/resize and safe descriptions/errors. Tauri IPC is explicitly mocked only inside these tests; they are not real backend login/download tests.

Actual native Rust integration checks on this host:

- **Iris + required Sodium**, Fabric/Minecraft 1.21.1: compatible download/hash verification, duplicate prevention, an older compatible Iris release → newer release, rollback and persistence.
- A Forge/NeoForge-only **Embeddium** release is blocked for the Fabric instance.
- **Complementary Unbound**, **Motschen’s Better Leaves**, **Terralith**: real shader/resource/datapack downloads and hashes; enable/disable/removal/rollback. Datapack testing uses an isolated world-directory marker, not a playable user save.
- Two real **Fabulously Optimized** Minecraft 1.21.1/Fabric releases: reviewed update, user-addon/config/world preservation, storage reload and rollback to every original content hash. The extra user-mod/world markers are isolated test fixtures; this is a filesystem/update test, not gameplay.
- One official Ely.by request with a generated nonexistent login: correctly rejected, no account/session created.
- The documented public Ely.by example profile: its real HTTPS PNG skin was cached and verified. The official authlib-injector artifact was downloaded and its publisher SHA-256 verified; no account was created by this check.

Final checks: `npm run build` and `cargo check --offline` succeeded; **33 Rust tests** and the full **22 renderer tests** passed. After a final shader-support correction, its additional renderer test passed: enabled archive mod IDs, rather than mutable project names, determine the support notice. The explicit native network checks (content installation, safe modpack update, Ely.by public artifacts/rejected login) also passed. The remaining ignored original-installer network test was not rerun separately; the real safe-pack-update test invoked that installer for two releases.

The frontend build reports a bundle-size advisory (521 kB main JavaScript), not a compile error. Windows UI automation could not connect to its native helper after its recovery attempt, so native mouse/keyboard interaction, actual file-picker/drag-drop gestures and Windows 125%/150% scaling are not claimed as tested. Renderer interaction tests and actual Rust filesystem/network tests are separate evidence.

`npm run tauri dev` completed the native compilation and opened a separate Windows window titled **Canary**, verified by its nonzero native window handle and executable path. A stale project Vite process initially occupied port 1420; only that verified process was stopped. The first desktop link also exposed duplicate Windows manifest resources, which were fixed by keeping one linker-generated Common Controls v6 manifest for main/test/utility executables, while preserving Tauri icon/version resources. No dependencies or build caches were deleted.

After that manifest fix, `cargo check --offline` succeeded again and the native Rust suite again passed **33/33** active tests. An additional renderer-suite repeat was stopped when the machine became heavily resource-constrained; its timed-out account/Play contract was subsequently rerun alone and passed. The completed 22-test suite, additional shader-support test and actual Rust integration checks above are the validation evidence, not the interrupted repeat.

Tests use disposable UUID roots. Owner instances/worlds/settings are not deleted or replaced. Actual successful Ely.by authentication and in-game application of the newly installed content must not be inferred from these tests.

Optional enabled-content profiles and filesystem watching are not implemented; rescan is available. Local version ranges beyond directly recognized metadata are marked possibly compatible. Unsupported/oversized (>512 MB) local/provider content archives fail explicitly. Broader historical Minecraft/loader compatibility is not claimed.

## Run

```powershell
Set-Location 'C:\Users\hxppy\Desktop\whatscord launcher'
npm run tauri dev
```

Data remains `%LOCALAPPDATA%\Canary`. The development executable remains internally named `src-tauri\target\debug\scaffold.exe`, with visible product/window title Canary. It needs the development Vite server. No production installer or publication is part of this pass.
