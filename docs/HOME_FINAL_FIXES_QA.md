# Home / Desktop Vibrancy fixes — 2026-10-08

## Behavior

- Home continuation cards, empty panels and content drop areas use the shared card fill, edge, shadow and blur. Hover no longer replaces continuation-card glass with an opaque palette fill. Icon placeholders use the shared button fill.
- With a Desktop background, translucent material fills and readability floors are reduced to 72% of their picture-background values, with a visible edge. Solid materials and Reduce transparency / Low quality / Focus fallbacks stay opaque. Surface opacity adjusts cards and controls in every theme.
- The opacity control is enabled if any category is translucent, including when cards are Solid but buttons use Glass. Foreground-only glass does not enable an ineffective backdrop-blur slider.
- Home hero is hidden by default, including existing preferences without an explicit showHero value. Settings → Background → Show Home banner enables it. The preference persists; hidden hero does not mount its carousel or timers.
- Continue playing includes a last-server row with the server address, matching instance, pack version, Minecraft and loader. Play starts that instance; it does not automatically join the server. Ordinary instance rows also show their own last server.

## Server history

History is local instance metadata. The output tracker waits for a Connecting message followed by server chat, advancement sync or an applicable login marker. Failed connections and transitions to an integrated server clear an unconfirmed candidate. IPv6 and non-default ports are supported. It does not guess from servers.dat order.

When no stored history exists, a once-per-process scan reads up to eight recent uncompressed canary logs / latest.log, capped at 5 MiB per file, and restores the latest confirmed server. Clients/mods without these log markers and older compressed/rotated-away logs cannot provide history; no placeholder server is invented.

Updates change only the server field under the metadata lock. An older process-exit snapshot cannot erase newer history, and late output cannot revert the saved process state.

## Verification

- Production TypeScript/Vite build passed.
- Rust suite passed: 92 tests, 9 explicitly ignored external integration tests. After tightening the atomic history update, both server-history tests passed again.
- Native history tests cover failed attempts, successful modern and legacy join markers, IPv6/ports, single-player transitions, restoration, restart persistence and stale exit snapshots.
- Browser contracts cover hidden-default hero and persisted toggle, old hero rotation/geometry checks, correct server-instance launch/details, adjustable opacity/hover/persistence in Light, Dark, AMOLED and System, live System theme change, and Solid-card / Glass-button controls.
- Screenshots inspected for Light and Dark: .qa/home-final/light-desktop.png and dark-desktop.png.
- Browser native-window operations are fixtures: these checks establish the surface rendering, not the actual Windows desktop blur. No live public Minecraft server login was performed.

Final selected browser checks: 13 passed across the new Home checks and existing carousel/material checks. All seven materials were compared on five backgrounds in Light, Dark, AMOLED and System, including live System transitions and four viewport widths. The full preset/reset/persistence check passed for eight sidebar-side/layout/density combinations.

Two older test setup issues were corrected: material preview controls live inside a collapsed comparison disclosure, so the test opens it first; seeded layout preferences are written before React mounts, because pagehide correctly flushes the running application's current state. The persistence reload itself has no preference seeding and checks the saved result.
