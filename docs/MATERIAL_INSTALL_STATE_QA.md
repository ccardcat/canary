# Material ownership and Discover installation stabilization

Source baseline: `f770bd49351348eed750e28b748e0760ad67af59`, GitHub `main`.
Scope: material/layout ownership, seven material identities, project-scoped installation state and previous visual/runtime regressions. Windows XP and the removed Activity Dock are outside this change.

## Material Preset State Bug

The preset selector spread the entire `materialDefaults` object into Appearance before the selected preset. That object contained `sidebarMode: attached`, instance layout, artwork mode and button density. Clear Glass/Vibrancy/Glass therefore overwrote the user's Floating layout with Attached. Liquid/Transparent additionally forced `sidebarMode: floating` in their definitions. Material reset used the same mixed defaults.

`MaterialPreferences` and `LayoutPreferences` now have separate defaults, normalization and token application. `materialPresetPatch()` returns only typed material values. Preset definitions cannot contain layout keys. A material reset uses this same patch. Updating layout or corner radius also retains the selected material preset; the old generic `material*` dirty detection no longer mistakes `materialRadius` for material ownership.

## Settings Ownership

| Owner | Values |
| --- | --- |
| Material | Shared/category styles, linked mode, intensity, opacity, blur, saturation, brightness, contrast, border, highlights, shadows, optional accent tint, sidebar/titlebar material intensity, transparency reduction |
| Layout | Attached/Floating, Left/Right, Compact/Expanded, radius, instance layout/artwork mode, button density, sidebar/window geometry |
| Independent Appearance | User backgrounds/treatments, theme/palette/accent choice, fonts/scale, language, native window material/settings, motion and quality preferences |

The existing flat `canary-visual` persisted shape remains compatible. Sidebar compact state retains its existing storage key. Normalization keeps explicit saved layout values and old preset IDs (`canary`, `graphite`, `minimal`, `amoled`). Legacy linked Clear Glass using `materialStyle: glass` becomes the distinct `clear` style without reapplying a preset or changing layout/artwork/custom category values. A previously overwritten historical layout cannot be inferred from a config containing only its final value.

## Material Presets

The shared semantic pipeline derives cards, sidebar, foreground controls, popovers, dialogs, titlebar and floating surfaces. Layout sets radius independently. Inputs/buttons do not add nested backdrop blur. Overlay/control tints and the page veil protect text; sidebar artwork and isolated previews use local readable text backings so their open surfaces can remain translucent.

| Preset | Identity | Default card blur |
| --- | --- | --- |
| Solid | Opaque, clean edge, minimal shadow, no reflections or background influence | 0 px |
| Soft | Light translucency, softer border/shadow, low blur, no glass reflection | about 1 px |
| Vibrancy | Background color influence, controlled saturation/tint, medium blur | about 13 px |
| Glass | Neutral, denser translucent sheet, thin edge and subtle top reflection | 18 px |
| Clear Glass | Distinct `clear` type, less tint/fill, lighter edge/shadow, more visible background | 18 px |
| Liquid Glass | Layered soft reflection, inner highlight and one broad shadow; lower blur than Clear Glass | about 17 px |
| Transparent | Very low fill, no blur/reflection/shadow, minimal edge, background first | 0 px |

Default open card fills range from opaque Solid to approximately 7% Transparent. Denser semantic overlays/controls are intentional for readability. Blur is capped at 32 px; highlight alpha at .14 and shadow alpha at .18. Miniature preset previews use the same token generator and include RU/EN descriptions. Borders keep their physical width, and no preset changes geometry or user background settings.

## Discover Install State

Home and Discover previously passed the same App `busy` boolean to every ProjectCard. Every card therefore displayed Installing while any project installed. Long progress labels could also reflow the action row: the second half of a double click landed on View instead of the now-disabled Install button.

Cards now select active tasks from the existing BackendProvider by provider + projectId. The task has a UUID taskId, projectId, resolved versionId, operationId, title, typed status and progress. Version lookup creates the same authoritative task before native invocation and can be aborted from Downloads. Rust modpack jobs attach explicit provider/project/version identity to their events and task snapshots, avoiding parsing instance IDs or display names. Older events missing metadata retain the identity already associated with their taskId.

The existing native Modrinth serial-install lease remains intact. Other modpack actions can be disabled during an active install, but retain their normal label. The shared store prevents repeated invocation synchronously. CardView is memoized with stable action forwarding and rounded progress so unrelated cards do not repaint their contents for every progress event. Native progress retains its existing 120 ms throttle.

Completed/Cancelled/Failed tasks leave the active selector and cannot be resurrected by late events. Downloads and cards consume the same tasks; Library continues to use backend snapshots and publishes successful instances after native completion. Failed/cancelled first installations do not add frontend Library entries. Footer metadata and action slots remain fixed during label changes; percentage occupies the metadata row and the install button's accessible label.

CurseForge retains its localized expected-unavailable state and never starts fake installation tasks or exposes stale Modrinth results.

## Renderer QA

Real application components were exercised in Chromium with deterministic Modrinth responses and Tauri IPC fixtures. These are renderer/contract tests, not claims of actual native downloads or sign-ins.

| Coverage | Actual combinations/scenarios |
| --- | --- |
| Sidebar ownership | All 8 Left/Right × Attached/Floating × Compact/Expanded combinations × all 7 presets; material reset, saved unrelated settings and Clear Glass reload/startup persistence |
| Legacy configs | Old Clear Glass style, explicit layout/artwork/font/category values; previous preference/cursor migrations |
| Visual identity | All 7 presets × Light/Dark/AMOLED/System × dark/bright/colorful/photo/gradient samples; 140 scenes; live System light/dark transitions for every material |
| Geometry | Sidebar, Settings and titlebar unchanged within each viewport; material switching at widths 1920/1280/780/480; previous 1920×1080 through 480×340 responsive flows |
| Readability | Existing 9-palette × 10-accent × 7-material overlay/control contrast matrix; rendered Discover card pixels across 7 materials × 3 themes × 2 extreme wallpapers |
| Installing | Five cards; one install; UUID identity; double click; progress; search/clear, filters, sort, pagination, scroll, Library/Discover navigation; Downloads cancellation and late events |
| Terminal outcomes | Safe failure, no ghost instance, retry, success, only the matching Installed card, cancellation during version lookup without native invocation |
| Restored/concurrent task state | Explicit provider/project/version identity with opaque operation IDs; two independently matched active tasks; unavailable CurseForge does not add tasks |
| Previous regressions | Hero decode/geometry, buttons/focus, New Instance/provider overlap, Storage, Accounts/About, dropdown/popover/tooltip bounds, Activity/Screenshots, sidebar scrolling, RPC/privacy, runtime/content IPC and cleanup |

The full renderer suite run produced **96 passed / 2 failed out of 98**. The failures were an obsolete expectation that Transparent uses blur, and a filter selector expecting `Filters` after its count changed to `Filters 1`. Both expectations were corrected. The subsequent focused run passed **9/9** (the seven new state/material tests, Project Detail regression and Windows harness validation); rendered card contrast passed **1/1**, and independent layout/radius selection and sidebar background treatment controls each passed **1/1**. The live Discover native QA adapter also passed **1/1** in Chromium. Aggregate coverage is **103 distinct passing scenarios**, not a single 103-test run.

Representative material/contact-sheet, Discover and previous regression screenshots were visually inspected. Images, measurements and logs stay outside the committed source tree.

## Build and native QA

- `npm run build`: passed; the existing >500 kB chunk warning remains.
- Local `cargo check --locked --manifest-path src-tauri/Cargo.toml`: unavailable, exit 127 because Cargo is absent.
- Local `npm run tauri dev`: unavailable, exit 1 because `cargo metadata` cannot run.
- A Rust regression verifies task identity serialization, progress/terminal retention and rejection of late identity/progress changes.
- GitHub Windows/Linux verification passed frontend build, Cargo check/test and desktop installers for the pushed code.
- Windows QA passed all seven presets through actual packaged WebView2 controls, 56 layout/material combinations and persistence on renderer reload, plus all presets across Light/Dark/AMOLED at native widths 1200 and 960. It then set Right + Floating + Compact + Clear Glass, closed the actual process, launched a new process with the same WebView2 profile and verified the full persisted Appearance configuration and rendered sidebar/material state.
- Live Discover QA passed using actual public Modrinth results and native IPC: 12 cards, one real installation, matching UUID/provider/project/version identity, Downloads cancellation, return navigation and no ghost instance. The adapter harness validates its controls/logic separately with fixtures; the live CI run used no network or IPC fixtures.

## Verified CI evidence

Verified code commit: `61143226dd4bb5fbc038276bc10c45b7d451c2c1`.
Run: [Desktop verification 37628414777](https://github.com/ccardcat/canary/actions/runs/37628414777).

| Check | Windows | Linux |
| --- | --- | --- |
| Frontend build | Passed | Passed |
| Cargo check, locked | Passed | Passed |
| Cargo test, locked | 72 passed, 0 failed, 6 ignored | 75 passed, 0 failed, 6 ignored |
| Production installers | NSIS + MSI passed | DEB passed |
| Real native GUI | Passed; release executable with supported inspector feature | Not exercised |

The first code CI run caught an old Discord test fixture missing the three new optional Task identity fields. Commit `f4f79e2` updated the fixture with `None`; subsequent Windows/Linux test suites passed, including the new identity/terminal regression. No tests were disabled to resolve the failure.

The final native report contains 98 material entries, 36 window/material/restart cases and 82 captures. **81 captures used native desktop capture**. The initial `fullscreen` capture used the explicit WebView-only fallback because PowerShell timed out; its fullscreen state and geometry assertions still used real native IPC. Earlier run [37627362005](https://github.com/ccardcat/canary/actions/runs/37627362005) passed with all 79 captures using native desktop capture. Representative native Light/Dark/fullscreen thumbnails were visually inspected in addition to the renderer material/contact sheets.

Full process restart changed PID **8300 → 3008**, with `sidebarSide=right`, `sidebarMode=floating`, `compact=true`, `preset=clear` and the entire saved Appearance configuration unchanged.

Live installation evidence: provider/project **`modrinth:1KVo5zza`**, version **`MKDr2HvF`**, task UUID **`198f3e3f-2a7f-4e01-95b6-04c9f95a7e46`**. Exactly **1 of 12 cards** displayed Installing. Rust task identity was confirmed through `backend_snapshot`; cancellation from Downloads finished with **`cancelled`**, all Discover Installing states cleared after return navigation and the backend instance list contained no ghost instance.

The actual runner compositor samples recorded 258 frames per four-second high/low quality sample, median about 15.6 ms and no intervals over 50 ms. Low quality disabled sidebar backdrop blur. These bounded runner measurements are not a physical scrolling or hardware FPS guarantee.

## Limits

Local native GUI/compositor testing and `tauri dev` remain unavailable because Cargo is absent. Real process restart and an actual Modrinth installation start/cancellation passed in Windows CI. A complete successful public pack download and interactive Microsoft/Ely.by sign-in were not performed. Their UI/contracts and success/failure/cleanup paths have renderer/Rust regression coverage. Network-dependent Rust integration tests retain their six existing ignored tests. Browser/IPC fixtures must not be described as successful live account authentication or a complete real Modrinth installation. No new claim of physical drag/drop or hardware scroll frame rate is made. The existing frontend >500 kB chunk warning and legacy Rust unused-code warnings remain.
