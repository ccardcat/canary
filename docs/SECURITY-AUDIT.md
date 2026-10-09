# Canary security audit and hardening

Audit date: 2026-10-09. Baseline: `main` at
`2ac633d89cfb4555d55b9315aed70a2f4c553199` (Canary 0.1.8).
The following assessment was written **before production hardening changes**.
It distinguishes demonstrated code paths from deployment assumptions. No real
credentials, tokens, API keys, personal files or production load tests are used.
Implementation status and measured validation results will be appended below.

## Scope and existing controls

Reviewed authentication and account resource guards; Rust IPC, Tauri configuration,
capabilities and plugins; both Modrinth installation pipelines; CurseForge gateway
and direct API paths; content imports, migration, backups and deletion; Java,
Minecraft and loader processes; React HTML/Markdown/images/errors; lockfiles;
verification and release workflows. The clean working tree was fast-forwarded to
the exact remote commit without reset, force push or history rewriting.

Existing controls worth preserving: remote tokens use `keyring` (Windows native
Credential Manager; Linux Secret Service), metadata contains credential references
rather than tokens, Microsoft uses random state and S256 PKCE with a loopback
listener and rejects duplicate callback fields, authentication HTTP clients disable
redirects, Minecraft uses direct process spawning, provider downloads verify
published hashes, staging protects installed instances on cancellation, account
removal guards track the particular account rather than unrelated jobs, and game
termination tracks the selected child. The production CSP forbids eval, inline
script, frames, objects and workers. HTML is sanitized with DOMPurify and Markdown
raw HTML is disabled. No filesystem or shell plugin is granted to the frontend.
The Worker already restricts routes, query parameters and CDN hosts, does not
forward publisher errors, uses short-lived signed download tickets, streams files,
honors distribution restrictions and gates public use on publisher approval.

## Threat model

| Entry point / attacker | Boundary and component | Exploitability / impact | Existing protection | Required mitigation |
| --- | --- | --- | --- | --- |
| Malicious MRPACK / CurseForge pack author | Provider/archive → instance and launcher-owned metadata | Installation writes internal metadata or exhausts memory/disk | Hashes, staging, traversal checks | Uniform Windows-aware reserved paths, bounded manifests, streamed files and extraction budgets |
| Compromised metadata/CDN or malicious download URL | Network → host network, cache and executable inputs | Internal-network requests, oversized content, altered binaries | HTTPS and published hashes, partial files | Validate every hop, public DNS addresses pinned to connection, body limits and integrity revalidation |
| ZIP/TAR entry and mutable destination | Archive → real filesystem | Traversal, symlink/reparse escape, hard-link truncation or race | Lexical and existing symlink checks | Confined handle-relative operations, exclusive temporary creation, guarded atomic finalize |
| Corrupt account metadata | Account/provider → OS secret entry | Wrong account secret read/refreshed/deleted | Provider-specific sessions and identity checks | Bind credential references to provider and account ID |
| Forged OAuth callback | Browser/localhost → account secret store | Session substitution or sign-in disruption | State, PKCE, unique fields, timeout, cancellation | Preserve controls; test malformed callbacks and bounded responses |
| Compromised local frontend / future XSS | WebView → Rust IPC / OS execution | Execute arbitrary supplied executable via Java test; unauthorized file operations | CSP, sanitization, no shell plugin | Explicit app-command ACL, native consent for custom executable, backend argument/path validation |
| Game/loader output | Untrusted child → logs/events/Copy Details | Leak tokens, cookies, passwords; unbounded line allocation | Exact current game token replacement and selected markers | Central redaction before persistence/IPC, bounded line reads, safe export details |
| Anonymous gateway clients | Public Worker → publisher quota and bandwidth | Scraping, distributed quota exhaustion, repeated downloads | Per-location limits and route restrictions | Global consistent upstream quota, transfer admission/bandwidth limits, strict validation and fail-closed configuration |
| Malicious dependency/action/artifact | Package registry/CI → build and release | Build-host compromise or publish unrelated installers | Lockfiles, no PR-secret workflow, tag checks | Advisory audit, compatible updates, action SHA pinning, least-privilege build jobs, reuse provenance |
| Forged Canary update | Distribution → installed launcher | Execute substituted launcher | No in-app updater or automatic executable replacement exists | Document unsigned release status; signing and authenticated update policy before adding updater |
| Malware already running as the same OS user | User process → game, files and credential store | Can read authorized process args, tamper files and call OS APIs | OS account isolation | Explicit limitation: launcher is not a sandbox for mods or protection against a compromised OS account |

Hashes establish expected content, **not absence of malware**. Minecraft mods and
official Java installers execute code with the user's OS privileges. Filesystem
confinement protects launcher operations, not arbitrary code after a mod runs.

## Confirmed findings at the baseline

All findings below initially have status **Open — mitigation planned**. Severity
includes prerequisites; a compromised local UI or same-user file tampering is not
claimed to be an unauthenticated remote exploit.

| ID | Severity | File / function | Exploit and impact | Planned fix | Verification |
| --- | --- | --- | --- | --- | --- |
| F01 | High | `backend/commands.rs::test_java`, `backend/java.rs::test/select` | IPC supplies any regular file. `Command::new(path)` executes it with Java-looking arguments **before** determining whether it is Java. Settings and per-instance Java paths reach the same sink. A compromised UI can execute a local payload. | Validate canonical executable paths; require native user consent for custom executable selection/use; constrain backend Java authority without removing custom Java. | Disposable executable marker rejected before spawn; valid Java/custom consent; relative/UNC/device paths and altered executable regression. |
| F02 | High | `backend/download.rs::secure_source/json`, `installer.rs::download_job`, public `Backend::client` | HTTPS alone permits loopback/private/link-local destinations and default redirects reach them before the final URL check. A malicious MRPACK URL or compromised metadata can contact internal services. | Public destination validation, DNS resolution checked and pinned, every redirect checked before sending, no credentials on public requests. | Mock DNS/hops for IPv4/IPv6/private/rebinding and redirects; ensure rejected targets receive no request/header. |
| F03 | High | `installer.rs::safe`, `backend/modpacks.rs::verify`, `backend/curseforge.rs::copy_overrides` | Reserved launcher names and world paths use case-sensitive checks. `INSTANCE.JSON`, `.CANARY-CONTENT` or `SAVES/World/...` alias protected paths on Windows; a pack can replace launcher metadata or user data during install/repair. Original installer also lacks Windows device/trailing-name checks used elsewhere. | One shared case-insensitive pack path policy with Windows device/ADS/normalization checks and duplicate/collision detection. | Mixed-case protected names, devices, ADS, trailing dots/spaces, ZIP Slip and real Windows behavior. |
| F04 | High | `backend/storage.rs::safe_join/extract_job/write_json`, download/copy finalization | Path validation returns a string; later `File::create`, copy and rename resolve mutable parents again. A concurrent same-user actor can replace a checked directory with a link. Existing hard links are truncated by direct writes. | Handle-relative confinement for writes/copies/finalization; reject reparse/link escapes; exclusive temporaries and atomic replacement; protect deletion identity. | Isolated link/junction/race and hard-link tests must leave outside sentinel untouched. |
| F05 | Medium | `installer.rs::download_job/read_index/apply_overrides_job`, `storage.rs::extract_job`, `download.rs::json/batch`, Java TAR and process readers | Original Modrinth installer buffers entire downloads and index without limits. Generic ZIP extraction has no total/file-count limit, general JSON is unbounded, metadata size sums overflow, and `lines()` allocates before truncation. Crafted content can exhaust memory/disk or panic. | Stream artifacts, bounded metadata and line readers, checked arithmetic, generous separate archive/entry/count/total budgets and cancellation. | Small configured budgets with crafted archives/bodies, u64 overflow and long no-newline output; normal large-pack boundaries. |
| F06 | Medium | `process.rs::output`, `loaders.rs::output/profile`, `installer.rs::InstallError`, `game_logs.rs`, `src/services/errors.ts` | Redaction only covers the current game access token and case-sensitive marker strings. Other Bearer tokens, refresh credentials, cookies/passwords/API keys/codes can enter logs and copied details. Loader and Java probe children inherit publisher-key environment. | Central redaction at backend sinks plus Copy Details defense; bounded sanitized reads; remove secret environment variables from every Java/installer child; export privacy notice. | Synthetic secret formats never appear in persisted logs/events/copied details; meaningful ordinary diagnostics survive. |
| F07 | Low | `accounts.rs::remove_reserved/credentials`, `microsoft.rs::identity`, `elyby.rs::refresh` | A corrupt stored `credential_ref` may point at another provider/account's Canary keyring entry. Delete/refesh does not verify reference ownership before touching it. Requires metadata corruption; no cross-user OS vault bypass is claimed. | Require exact provider + account ID reference before every credential operation; fail without deleting unrelated entry. | Aliased and wrong-provider references rejected; normal logout/removal and unrelated account regressions. |
| F08 | Medium | `minecraft.rs::prepare`, `loaders.rs::profile`, `modpacks.rs::verify` | Fast reuse accepts file length alone. Replacing a cached JAR/mod with different same-size bytes bypasses the expected integrity check before launch/use. | Store and revalidate verified artifact digests; migrate old receipts by normal verification; respect mutable user configs/worlds. | Same-length tampering forces verification/repair, hash mismatch never finalized, cancellation preserves installed files. |
| F09 | Medium | `services/curseforge-gateway/src/worker.mjs::handle/api` | `BUDGET_RATE_LIMIT` uses a constant key but Cloudflare counters are per location and eventually consistent. One client request can issue two API requests; each costs one admission. Tickets are public admission tokens, not client authentication. Distributed traffic can exceed the intended publisher quota; no transfer budget/timeout bounds CDN work. | Durable global request/byte quota counted per upstream call, fail-closed configuration, bounded downloads, preserve per-IP edge smoothing and approval gate. | Concurrent mocked locations share exact quota; request amplification charged; unavailable budget fails closed; oversized/redirect streams rejected. |
| F10 | High (development tool) | Gateway `package-lock.json`: Wrangler → Miniflare → `sharp` | `npm audit` reports GHSA-wq5f-xc86-pv6w/CVE-2026-96889 in `sharp <0.35.5`, affecting SVG processing in local tooling. Three package entries refer to **one** advisory; this is not three independent vulnerabilities or proof Worker production executes sharp. | Compatible Wrangler 4.149.0 update and lockfile verification; run both npm audits and Rust advisory scan. | Audit returns no affected version; Worker tests/dry-run pass. |
| F11 | Medium | `.github/workflows/release.yml::publish` | `reuse_run` downloads installer artifacts from a supplied run without checking matching commit, workflow success or trusted event. A maintainer can accidentally publish installers from another revision/run under a verified tag. | Verify same repository/workflow/tag commit, successful trusted build/event before download; produce checksums; keep signing status truthful. | Unit-test valid reuse and wrong commit/workflow/failed/PR cases. |
| F12 | Medium | `src-tauri/build.rs`, app command registration, CI action references/permissions | App commands have no explicit app manifest ACL, so window-only plugin capability does not itself scope those commands. Build jobs also retain contents-write solely to publish QA notes, and actions use moving tags. No remote API capability or PR-secret grant was found. | Explicit command manifest + local main capability; minimize opener permissions; pin reviewed action SHAs; isolate QA-note publishing from compile/test jobs. | Native local IPC works, auxiliary/remote invocation fails; configuration consistency test; CI notes/builds still work with read-only build token. |

## Deployment conditions and honest limits

The existing CurseForge key stays in Cloudflare secrets. No key is requested,
printed or inserted into Rust, React or GitHub. Third Party API approval does not
establish approval for this shared server gateway. `CURSEFORGE_GATEWAY_APPROVED`
must remain an operator attestation after publisher confirmation. This work does
not deploy or publicly activate the Worker. The official CurseForge notice dated
2026-06-10 requires API-key authentication for `edge.forgecdn.net` downloads from
July 16, 2026; the gateway's exact-host header method preserves that behavior.
Public metadata caching remains off unless publisher terms explicitly permit it.

No Tauri updater plugin/configuration or automatic Canary executable replacement
was found. Windows Authenticode signing is not configured: installers must not be
described as signed. Signing certificates/private keys and any future updater
private key must remain outside Git; updater signatures must be verified before
execution when that feature is introduced.

Reference checks: [Tauri capabilities](https://v2.tauri.app/security/capabilities/),
[Tauri opener defaults](https://v2.tauri.app/plugin/opener/),
[Cloudflare rate-limit locality/accuracy](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/),
[CurseForge CDN authentication](https://blog.curseforge.com/introducing-api-key-authentication-for-curseforge-file-downloads/),
[CurseForge API](https://docs.curseforge.com/rest-api/),
[sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).

## Verification ledger

Baseline root `npm audit`: 0 reported vulnerabilities. Baseline gateway audit:
1 unique high development-tool advisory (3 affected dependency entries).
Rust and Windows/native results are pending; none are claimed in this baseline.
Full-history secret scanning and legacy-token-storage assessment are pending.
No live Microsoft/Ely.by login or destructive/user-directory test has been run.
