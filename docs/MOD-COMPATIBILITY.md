# Mod compatibility checks

Canary rejects declared incompatible content before applying an installation,
local import or enabling disabled mods. Catalog checks use the instance's
Minecraft version, loader and release policy. Errors identify the project,
required version or dependency, and the current instance or conflicting mod.

Local JAR checks read Fabric/Quilt JSON and Forge/NeoForge TOML metadata. They
check supported Minecraft and loader version predicates, required dependencies,
fatal incompatibilities and duplicate top-level mod IDs. The complete proposed
selection is checked together with enabled, present installed mods; selecting a
mod and its dependency together is supported. Declared bundled JARs contribute
dependency candidates and have bounded archive/metadata inspection limits.

Compatibility rejection occurs before a checkpoint or installed-file changes.
The final transaction repeats validation against the actual downloaded/copied
archives, so frontend checks cannot bypass it. Removing or disabling a broken
mod remains available. Existing pack-update transactions retain their previous
policy and are not subject to the new transaction gate.

When a game exits unsuccessfully after a recognized fatal loader dependency
error, Canary displays the loader's bounded explanation instead of only an exit
code. Output passes through the existing credential sanitizer before collection.
Other crashes retain their normal diagnostics.

## Limits

This is validation of declared metadata, not execution or a full loader solver.
Unknown predicates are left to the loader rather than guessed. In particular,
legacy Forge `mcmod.info`, Minecraft snapshot normalization, Maven qualifier
ordering, Quilt alternative dependency groups and conditional `unless` rules
are not fully evaluated. Java selection remains the launcher's runtime policy.
Fabric advisory `conflicts`, recommendations and suggestions do not become hard
errors. Runtime mixin/code conflicts without declared incompatibilities cannot
all be predicted before launching.

## Verification of this change

- 16 isolated Rust tests passed using production policy/log collector source
  and copied archive/plan/preflight functions, with dependency versions pinned
  to the repository lockfile. Fixtures cover ranges, Forge/NeoForge, multi-loader
  JARs, bundled dependencies, batch inspection and provider conflicts.
- 17 frontend unit tests passed (6 content-error, 5 privacy, 6 catalog tests).
- 5 DOM scenarios passed for blocked catalog/import actions, named reasons,
  compatible import and visible runtime loader explanations.
- Frontend type-check and Vite production build passed. The local source mirror
  omits binary assets; the remote Git tree preserves those existing assets.
- Added native import/transaction regressions and browser UI regressions for CI.
  Full native Tauri execution and real browser tests were not run in this
  environment: Linux GTK/WebKit prerequisites and a working Chromium installation
  were unavailable. The isolated tests do not replace native integration tests.
