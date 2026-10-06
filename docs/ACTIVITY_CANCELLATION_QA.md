# Task progress and cancellable installations

Dock removal baseline: `main` at `21c78d39a055499679e1fa5b21adfaec3f266a66`. Backend cancellation and transactional installation are preserved.

## Task and cancellation contract

`backend/activity.rs` extends the existing `download::Job`, instance leases, and atomic cancellation flags. Each invocation gets a unique UUID task ID, independent of its instance ID. `activity-task` carries a complete semantic record with typed kind/status, revision, progress counters, cancellation availability, and timestamps. `backend_snapshot.tasks` restores the current records after frontend reload. The existing `backend-progress` and `install-progress` events remain compatible.

A cancel request sets `cancelling`; it never reports `cancelled` immediately. HTTP requests are dropped at bounded cancellation checks, streaming downloads check before writes, retries and the next file. Batch workers are drained, Tokio writes are flushed and handles closed, partial downloads and staging directories are removed, then the command emits the terminal result. Cleanup failure is reported as failure rather than a successful cancellation. Metadata requests, archive extraction, override copying, runtime preparation and provider loops share the same flag. Forge/NeoForge's existing child installer cancellation is preserved.

The task registry lock serializes cancellation with entry into the non-cancellable commit. The final directory/metadata commit and content apply disable Cancel. Legacy cancellation by instance ID also resolves through this gate. Terminal tasks cannot emit new semantic progress. Frontend revisions reject old snapshot responses and a terminal record cannot return to active state.

## Instance transaction

New Modrinth, CurseForge, vanilla and MRPACK installs prepare inside journaled hidden directories on the instance drive. `save_instance` writes staged metadata without inserting it into the Library catalog. Pack files, runtime, Java selection and instance metadata all finish before the directory is published and the Library catalog committed. Cancellation/failure before that point removes the fresh staging tree; successful installation becomes a normal ready instance.

Existing preparation/repair copies the instance, including user files, before modifying it. Commit swaps directories with rollback, rebases runtime paths, and preserves the previous directory if recovery itself fails. Startup recovers an interrupted swap from its journal. Pack/content updates retain their existing staged apply/rollback architecture, with cancellation gated during apply. Shared valid runtime/cache artifacts remain reusable.

Copying a large existing instance requires extra disk space and I/O; worlds are copied rather than deleted. Resume is not implemented. Window close is blocked while jobs are active, so the user can explicitly cancel or wait for cleanup; running worlds retain the existing close protection.

## Task UI and Sidebar

`BackendProvider` owns tasks. Downloads/Activity, creation/import dialog, content manager and Library controls read that state. `TaskActivity.tsx` provides shared task rows and Cancel controls. Closing or unmounting a creation dialog does not cancel its command: progress and cancellation remain available in Downloads. Terminal records leave the active list and retain no progress bar or current filename; a collapsed recent list can retain a short completion/cancellation/error entry.

Activity Dock, its sidebar target, rings/counts/game indicators, portal, hover/focus/outside-click handlers and timers are removed. Sidebar utilities contain only mode and language controls again. The extreme-height inner-scroll fallback returns to 340 px; the existing scrollbar, hover surfaces, Attached/Floating, Left/Right and Compact/Expanded layouts remain.

The four Dock-only preferences and their empty Settings section are removed. Existing `canary-visual` configurations are normalized with the established defaults, so those unknown fields are discarded while appearance, typography, material and other valid preferences survive.

Game state still comes from the backend process-backed snapshot. Library running/Stop controls, process-exit handling and internal typed sessions remain. No sidebar game status or Discord Rich Presence is added.

## Validation

Frontend build passes; the pre-existing >500 kB Vite chunk advisory remains.

The full removal regression suite passed all 69 Playwright tests (4.9 minutes); the targeted cancellation/sidebar run also passed all 12 tests. Screenshots of Downloads and the restored Sidebar were inspected in headless Chromium. The removal regression suite uses Tauri IPC/event fixtures, not a native Windows launcher or a real provider download. It verifies absence of Dock/overlay/settings, safe old-config migration, mode/language keyboard access at minimum/extreme heights, all sidebar modes, download progress across all six materials and four themes, reduced motion, closing a dialog without cancellation, cancellation acknowledgement/retry, failed first install, successful publication, terminal cleanup and late-event protection. Existing regression suites also run with the restored two utility targets.

Preserved Rust tests cover a real local streaming HTTP transfer (test builds permit loopback HTTP only), cancel it mid-file, assert that queued files never start and all `.part` files are gone; test cancellation versus critical commit, terminal progress suppression, invisible failed/cancelled first install followed by successful retry, preservation of existing metadata/world/config on cancelled repair, and recovery of an interrupted directory swap after restart. Production still requires HTTPS. All six cancellation/transaction Rust regression tests passed in GitHub Actions on Windows and Linux.

Before removal, CI [run 37506456420](https://github.com/ccardcat/canary/actions/runs/37506456420), for code commit `92e39f0f721329c8ca6f3c04a728880f2756c645`, passed `npm run build`, `cargo check --locked` and `cargo test --locked` on Windows and Linux.

Local `cargo check --locked` and `npm run tauri dev -- --no-watch` were attempted: this workspace has no Cargo toolchain, so neither could run. Native Windows GUI/provider installation/game launch and hardware compositor/DPI validation are not claimed. The baseline Windows workflow already failed in its remote WebView2 inspector step; Linux and Windows Cargo/build steps passed on that baseline.
