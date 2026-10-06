# Activity Dock and cancellable installations

Source baseline: `main` at `f3f5eb8ce7519d44eb40f6aed052971f9e391bd4`.

## Task and cancellation contract

`backend/activity.rs` extends the existing `download::Job`, instance leases, and atomic cancellation flags. Each invocation gets a unique UUID task ID, independent of its instance ID. `activity-task` carries a complete semantic record with typed kind/status, revision, progress counters, cancellation availability, and timestamps. `backend_snapshot.tasks` restores the current records after frontend reload. The existing `backend-progress` and `install-progress` events remain compatible.

A cancel request sets `cancelling`; it never reports `cancelled` immediately. HTTP requests are dropped at bounded cancellation checks, streaming downloads check before writes, retries and the next file. Batch workers are drained, Tokio writes are flushed and handles closed, partial downloads and staging directories are removed, then the command emits the terminal result. Cleanup failure is reported as failure rather than a successful cancellation. Metadata requests, archive extraction, override copying, runtime preparation and provider loops share the same flag. Forge/NeoForge's existing child installer cancellation is preserved.

The task registry lock serializes cancellation with entry into the non-cancellable commit. The final directory/metadata commit and content apply disable Cancel. Legacy cancellation by instance ID also resolves through this gate. Terminal tasks cannot emit new semantic progress. Frontend revisions reject old snapshot responses and a terminal record cannot return to active state.

## Instance transaction

New Modrinth, CurseForge, vanilla and MRPACK installs prepare inside journaled hidden directories on the instance drive. `save_instance` writes staged metadata without inserting it into the Library catalog. Pack files, runtime, Java selection and instance metadata all finish before the directory is published and the Library catalog committed. Cancellation/failure before that point removes the fresh staging tree; successful installation becomes a normal ready instance.

Existing preparation/repair copies the instance, including user files, before modifying it. Commit swaps directories with rollback, rebases runtime paths, and preserves the previous directory if recovery itself fails. Startup recovers an interrupted swap from its journal. Pack/content updates retain their existing staged apply/rollback architecture, with cancellation gated during apply. Shared valid runtime/cache artifacts remain reusable.

Copying a large existing instance requires extra disk space and I/O; worlds are copied rather than deleted. Resume is not implemented. Window close is blocked while jobs are active, so the user can explicitly cancel or wait for cleanup; running worlds retain the existing close protection.

## Frontend and Dock

`BackendProvider` owns tasks. Dock, Downloads/Activity, creation/import dialog, content manager and Library controls read that state. Closing or unmounting a creation dialog does not cancel its command. A later cancel is available through Dock or Downloads. Terminal records move out of active downloads and retain no progress bar or current filename. A small recent error/completion can be shown; cancelled tasks return to idle/other activity immediately.

Dock occupies one 42 px utility target above the existing sidebar mode/language controls. Its nonmodal panel uses the existing popover material tokens, opens toward the main content, clamps below the titlebar, and scrolls internally when space is limited. Hover opens after 200 ms; pointer transitions have a 250 ms grace period. Focus, Enter/Space, Escape, and outside click are supported. Progress is a lightweight SVG ring; unknown progress respects reduced motion. The compact panel shows at most three entries and links to Downloads for the remainder.

Game state comes from the backend process-backed snapshot, with instance/version/loader/elapsed time and the existing normal `stop_instance(force=false)` action. Launch completion alone does not fabricate a playing session. Process exit refreshes the snapshot; a crash generates a distinct recent failure task rather than reopening a completed launch.

Activity settings persist in the existing `canary-visual` preferences with backward defaults: Dock, game activity, progress, and names enabled. Hiding the Dock does not stop tasks. Privacy hides instance names in the Dock.

## Validation

Frontend build passes; the pre-existing >500 kB Vite chunk advisory remains.

The complete Playwright regression run passed all 70 tests (4.9 minutes). Playwright verification uses Tauri IPC/event fixtures, not a native Windows launcher or a real provider download. The new scenarios cover hover/focus/click/Escape/outside interaction, confirmed cancellation, close-and-navigate-away, retry, terminal cleanup, stale event rejection, critical-section disabled cancel, simultaneous game/download/update, launch/playing/stop/exit, persisted preferences/privacy, Left/Right, Compact/Expanded, Attached/Floating, 760×540 and 760×280, Monocraft 120%, all six materials, Light/Dark/AMOLED/System, and reduced motion. Actual material screenshots were inspected in headless Chromium. Existing regression suites also run with the new utility target.

Rust tests add a real local streaming HTTP transfer (test builds permit loopback HTTP only), cancel it mid-file, assert that queued files never start and all `.part` files are gone; test cancellation versus critical commit, terminal progress suppression, invisible failed/cancelled first install followed by successful retry, preservation of existing metadata/world/config on cancelled repair, and recovery of an interrupted directory swap after restart. Production still requires HTTPS. These tests must pass in GitHub Actions before claiming backend validation.

Local `cargo check --locked` and `npm run tauri dev -- --no-watch` were attempted: this workspace has no Cargo toolchain, so neither could run. Native Windows GUI/provider installation/game launch and hardware compositor/DPI validation are not claimed. The baseline Windows workflow already failed in its remote WebView2 inspector step; Linux and Windows Cargo/build steps passed on that baseline.
