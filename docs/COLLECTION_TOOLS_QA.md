# Collection tools (0.1.9)

The status dock is omitted. Progress remains on project cards and the Downloads page.

## Behavior

- Test copies offer independent choices for worlds, settings and screenshots. Copies receive a new ID and do not overwrite their source.
- Export produces a local .mrpack with the exact Minecraft/loader versions and selected overrides. Exported account credentials, runtimes and launcher logs are excluded.
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

Before the GitHub-only handoff, 144 Rust tests passed (9 existing integration cases ignored), and six native IPC cases passed against disposable fixture data: copy choices, backup restore/retention, shared settings, group identity, backup storage accounting and native tray hide. No real account skin upload or real Minecraft hot-content session was exercised.

GitHub Actions runs the production build, browser suite, locked Rust checks/tests, dependency advisory scans, Windows native collection/tray checks, packaged CSP checks and window/material checks. The collection smoke creates disposable fixture instances inside the Actions runner. Installer artifacts come from the production build; the inspector executable is only a QA tool.

The current browser suite was interrupted at the user's request when work moved to GitHub. Its complete result is not recorded as a pass. See the pull request checks for final verification.
