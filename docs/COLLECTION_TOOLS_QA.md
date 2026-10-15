# Collection tools (0.1.9)

The status dock is omitted. Progress remains on project cards and the Downloads page.

## Behavior

- Test copies offer independent choices for worlds, settings and screenshots. Copies receive a new ID and do not overwrite their source.
- Export produces a local .mrpack with the exact Minecraft/loader versions and selected overrides. Accounts, worlds, screenshots, runtimes and launcher logs are excluded.
- Shared game options are opt-in for each instance. Only controls, mouse, sound, FOV and accessibility options are shared; graphics and unknown options stay local. The selected source is captured after Minecraft exits.
- Transfer discovers Prism, Modrinth and Minecraft instances through an explicitly selected folder. Unrecognized folders require a Minecraft/loader choice before import.
- Skin files are validated PNGs, stored in the launcher library and previewed as Classic or Slim. Upload requires a selected Microsoft Minecraft Java account and an explicit Apply action.
- Groups use stable IDs and support pointer dragging. Deleting a group does not delete its instances.
- World backups run before launch and obey per-instance count/space limits. Restore first preserves the current worlds. Running instances cannot be restored.
- Tray controls include show and guarded quit. Close-to-tray defaults on; minimize-to-tray is configurable.
- Stop immediately reports the stopping state and gives Minecraft three seconds to exit before offering force stop.
- Adding new mods, shaders and resource packs is allowed during a session. Duplicate/replacement files and destructive changes remain blocked. Mods load on restart. Resource packs and shaders can be selected in the running game's settings; no automatic in-game selection is implemented.
- Cards hide loader and modpack version numbers, keeping Minecraft and the loader name. Light surfaces provide a text backing for arbitrary artwork. Disclosures animate with a reduced-motion override.
- Typography can import .ttf/.otf files up to 16 MiB into Canary's font library. Selection persists across restart. Removing the active custom font returns to Nunito; original files and system fonts are not changed.
- The sidebar supports left, right, top, bottom and four corners with an optional Mini size. Floating placements reserve a content lane.

## Checks

GitHub Actions runs the complete browser suite in two shards, locked Rust checks/tests on Windows and Linux, dependency advisory scans, a real disposable Modrinth installation on Linux, and production Windows NSIS/MSI and Linux DEB builds.

Windows native QA uses a separate inspector executable with isolated application and WebView2 data. The collection suite checks a real font parser and removal, independent copies, backup restore with a current-world safeguard, shared settings, group identities, backup storage accounting and tray behavior. The CSP suite checks startup, main-window IPC, denied IPC in untrusted windows, dynamic styles and blocked injected content. Window QA covers fullscreen geometry, supported native materials across Light/Dark/AMOLED, all surface presets, layout persistence, a full process restart and live Discover installation/cancellation state.

The window suite waits for a stable main UI before its first preference reload and verifies isolated storage before seeding. Every seeded reload waits for its own new-document marker and ready UI. A process restart must release the previous inspector, and Discover must expose loaded, installable cards before starting the real download. Assertions and security boundaries remain unchanged.

Use [PR #16 checks](https://github.com/ccardcat/canary/pull/16/checks) for the final result on the current head; an earlier successful suite does not certify a later commit. Installer artifacts come from the production build. The inspector executable is only a QA tool and must not be published as a production installer.

Real Microsoft skin upload, licensed Minecraft gameplay, and a real Minecraft hot-content session are not exercised. No user accounts, worlds, installed launcher or local processes are used. Live Discover records a blocked result when the public provider cannot be reached; that is not evidence of a successful live install.
