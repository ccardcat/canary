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


## Итог hardening — 2026-10-09

### Executive summary и статус приёмки

Проверены аккаунты/OAuth/keyring, Rust/Tauri IPC, файловые операции и архивы,
оба Modrinth pipeline, CurseForge/Cloudflare, Java/Minecraft/loader processes,
React/remote content/CSP, приватность диагностик, зависимости и release CI.
Исходный аудит выше сохранён без сокращения: 12 подтверждённых findings
(5 High, включая одну проблему development tool; 6 Medium; 1 Low).
Финальная проверка добавила F13 Low — границу URL для provider content.
Подтверждённых Critical не найдено; это не утверждение об отсутствии неизвестных
уязвимостей.

Исправления опубликованы в `main` последовательными fast-forward обновлениями.
Параллельные visual/release изменения до `7fdd98e` сохранены. Функции аккаунтов,
инстансов, импорта, обновления/rollback, отмены, custom Java и custom JVM args
сохранены в коде; существующие данные пользователей не использовались в тестах.

**Техническая приёмка не полностью завершена.** Локальная Linux-сборка и
целевые тесты прошли, но Windows/native GUI и live account/Modrinth/CurseForge
проверки не подтверждены. GitHub Actions завершает jobs с failure до шагов,
без доступных логов. Затем execution environment потеряло соединение;
результат последнего полного UI-прогона и Windows cross-check недоступен.
Последний небольшой frontend follow-up F13 добавлен после потери окружения:
его новый тест и повторные build/test ещё не выполнены. Эти пробелы не
подменяются заявлениями о полной готовности.

### Findings: фактические статусы

| Severity | Component | Vulnerability | Status | Fix |
| --- | --- | --- | --- | --- |
| High | Java IPC — F01 | Произвольный executable запускался до проверки, является ли он Java | Код исправлен; native Windows consent QA ожидает проверки | Абсолютный/canonical local executable, native RU/EN consent с SHA-256, повторное согласование при изменении bytes, проверка перед launch |
| High | Network — F02 | Public HTTPS/redirect могли достигать private/loopback network | Исправлено; URL/DNS/redirect regressions прошли | Проверка initial URL и каждого redirect; public-only resolver использует проверенные адреса для самого соединения; credentials запрещены в public URL |
| High | Pack paths — F03 | Windows case aliases обходили protected instance/user paths | Исправлено; lexical/ZIP regressions прошли; реальный Windows junction QA не выполнен | Единая case-insensitive policy, Windows devices/ADS/trailing-name checks, preflight collisions и reserved paths |
| High | Filesystem — F04 | Validate-then-open TOCTOU и truncation hard-link targets | Исправлено в операциях launcher; POSIX link/race tests прошли | Handle-relative no-follow parents, exclusive temporary files, atomic write/copy/rename, identity-bound delete |
| Medium | Resource limits — F05 | Unbounded buffers/lines/archive sizes и overflow суммы | Исправлено; bounded-body/archive/overflow/line tests прошли | Потоковые downloads, metadata limits, checked arithmetic, extraction budgets, disk checks, cancellation |
| Medium | Logs/process environment — F06 | Другие секреты могли попадать в logs/Details/children | Исправлены известные sinks; synthetic tests прошли | Backend redaction до persistence/IPC, frontend Copy Details guard, bounded readers, удаление secret environment vars |
| Low | Account references — F07 | Corrupt metadata могла читать/удалять другую Canary keyring entry | Исправлено; alias/provider regression прошёл | Exact provider/account-ID credential reference перед каждой операцией с vault |
| Medium | Artifact reuse — F08 | Same-size tampering принимался за валидный cache/JAR/mod | Исправлено; digest/tamper regression прошёл | SHA-256 receipts и повторная проверка; старые receipts идут через обычную verification/repair |
| Medium | Public gateway budget — F09 | Per-POP limits не ограничивали общий upstream/transfer расход | Код исправлен; unit tests/dry-run прошли; публичное использование выключено | Один атомарный Durable Object; quota на каждый upstream fetch; byte/download/concurrency admission и bounded streams |
| High, dev tool | Wrangler/Miniflare/sharp — F10 | GHSA-wq5f-xc86-pv6w, sharp <0.35.5 | Исправлено; gateway npm audit = 0 | Совместимое обновление Wrangler до 4.149.0, lockfile и tests/dry-run |
| Medium | Release artifacts — F11 | reuse_run мог публиковать артефакты другой ревизии/workflow | Код исправлен; 3 provenance unit tests прошли; настоящий release не запускался | Trusted run/event/workflow + tagged source receipts + SHA-256 downloaded bytes до публикации |
| Medium | Tauri/CI authority — F12 | App commands не были scoped explicit ACL; build jobs имели write; actions — moving tags | Код исправлен; consistency/build checks прошли; native IPC denial QA ожидает запуска | AppManifest, 73 явных command permissions только local main; scoped opener; action SHAs; separate note-publishing job |
| Low | Provider URL boundary — F13 | Local asset image URLs разрешались в provider text; trailing-dot local host aliases обходили frontend filter | Код исправлен; extended tests ещё не выполнены после потери environment | Provider HTML/Markdown images только public HTTPS; normalised host check; local asset support сохранён для controlled Canary components |

Baseline explanations, exploit prerequisites и planned checks остаются в таблице
выше. F04 требует concurrent same-user tampering; F01 требует доступа к trusted
local UI/IPC. Они не названы unauthenticated remote OS exploits. F10 —
development-tool issue, а не доказательство эксплуатации sharp внутри production
Worker. F13 native asset scope уже ограничивался screenshots/cache icons/wallpapers:
чтение произвольного файла или vault через этот finding не заявляется.

### Account security

Microsoft и Ely.by secrets хранятся в OS keyring: Windows Credential Manager,
Linux Secret Service. Metadata содержит ID/provider/username/UUID/avatar/status и
credential reference; secrets не добавлены в JSON, localStorage, React state или
client bundle. Ошибка vault не переключает приложение на plaintext fallback.

История schema аккаунтов в 28 исходных main commits не показала legacy plaintext
token fields. Поэтому фиктивная миграция/массовый logout не добавлены. Старые
metadata читаются с defaults для новых non-secret полей; существующие keyring
references сохраняют формат. Если появится реальный legacy формат, миграция
должна сначала успешно записать secret в vault, затем атомарно удалить plaintext;
при недоступном vault — сохранить возможность восстановления, без потери аккаунта.

Сохранены Microsoft random state, S256 PKCE, loopback callback, validation
state/duplicate fields, timeout и cancellation; authentication clients не следуют
redirects. Provider/account binding проверяется перед read/refresh/delete.
Удаление/launch guards привязаны к конкретному аккаунту, а не всем install jobs.
Local accounts не требуют remote vault credentials. Автоматические regressions
входят в Rust suite; настоящий вход Microsoft/Ely.by и logout из пользовательского
vault в этом аудите не выполнялись.

### Tauri и exposed commands

`app_commands.rs`, `build.rs` и `permissions/backend.toml` содержат согласованный
manifest из 73 зарегистрированных commands. Capability разрешает их только
локальному окну `main`; remote capability отсутствует. Frontend filesystem/shell
plugin privileges не добавлены. Opener plugin ограничен http/https URL, без
универсальных open-path/reveal полномочий. Нужные OS-folder операции остаются
backend commands с validation managed roots/IDs/paths.

Backend повторно проверяет IDs, names, providers, paths, URLs, task ownership,
hashes, settings/arguments и account resource leases. Проверка Java и импорт
preferences не дают supplied executable выполняться без native consent.
Native-qa feature создаёт отдельные isolated local/remote WebViews для реальной
проверки отказа IPC; этот feature отсутствует в обычном installer build.
Положительный/отрицательный native Windows IPC результат пока не получен.

### Filesystem, archives, cancellation и данные

Shared path policy блокирует traversal/absolute/UNC/device/ADS/control/trailing
Windows names и case aliases protected metadata, saves, screenshots, logs.
ZIP preflight проверяет **все** entries до первой записи, links, collisions,
count/entry/expanded-size budgets. TAR runtime links разрешены только внутри
runtime root и превращаются в обычные проверенные copies.

Parent handles открываются no-follow от volume/root; writes, copies, finalize
и delete используют удержанный parent/directory handle. Temporary files создаются
exclusive с UUID. Полные JSON/artifact writes атомарны; hard-link target не
truncates. Partial RAII очищает незавершённую загрузку при drop/cancel. Сохранены
staging/swap/rollback и запрет замены пользовательских worlds/config во время
pack repair. Cancel install не вызывает kill постороннего Minecraft process.

Это confinement операций launcher, не sandbox для уже исполняющихся mods.
Полностью скомпрометированный процесс того же OS user может менять approvals,
receipts и файлы; финальный rename по имени и Linux spawn по path не являются
абсолютной защитой от такого противника. Windows execution guard удерживает
read-only sharing во время проверки/создания процесса; его фактическое поведение
в Windows ещё требует QA. Проверки использовали только isolated fixture roots
и sentinel files, без existing user instances или личных каталогов.

### Downloads и integrity

Public requests требуют HTTPS:443, public destination, отсутствие embedded
credentials/fragments. Все redirect hops проверяются до отправки запроса.
Resolver проверяет каждый DNS answer и возвращает те же addresses reqwest для
connect, поэтому повторной непроверенной DNS lookup нет. Ambient proxies
отключены: поддержка corporate proxy environment сейчас не обеспечена.

Provider-published SHA-1/SHA-256/SHA-512 проверяются там, где доступны.
Checksum mismatch не публикует файл и сохраняет прежний valid artifact.
Повторное использование Minecraft libraries, loader artifacts и provider mods
проверяет receipt digest, а не только размер; mutable configs/worlds не считаются
immutable downloaded artifacts. Для источника без published hash, например
некоторых Fabric metadata, local receipt после первого HTTPS download —
TOFU/integrity tracking, а не подтверждение автора.

Downloads stream в temporary files, hash вычисляется из того же open handle
перед finalize. Metadata ограничена 16 MiB, download/archive — 16 GiB, generic
ZIP entry — 4 GiB, expanded archive — 32 GiB, generic entries — 200000;
MRPACK имеет отдельный preflight count. Проверяются actual bytes, declared
sizes, mandatory hash formats, duplicate paths, version/schema, required files,
checked sums, cancellation и свободное место. Хэш подтверждает ожидаемые bytes,
не отсутствие вредоносного кода.

### Process launch, custom Java/JVM и privacy

Minecraft/Java/loader installer запускаются direct executable + separate args.
Shell-looking metacharacters остаются аргументами; shell-string interpolation в
production pipeline не добавлена. Custom Java сохраняется после native consent
по canonical path + SHA-256; изменённые bytes требуют нового согласования.
JVM code-loading options требуют native consent для argument fingerprint,
без предупреждений на каждый обычный запуск. Содержимое referenced javaagent
или argument file пока не входит в fingerprint — это остаётся пользовательским
trust decision и не описывается как malware scan.

Child environment удаляет token/secret/password/cookie/API/credential variables,
SSH/AWS key handles, JAVA_TOOL_OPTIONS/JDK_JAVA_OPTIONS/CLASSPATH и URL с embedded
password. В launch protocol Minecraft access token может быть обязательным
command-line argument: процесс с соответствующими OS правами может увидеть его.
Он не дублируется в debug output/UI. Game lifecycle отслеживает owned child;
launcher не изолирует mods и не обещает полный sandbox/process-tree containment.

Redaction применяется до backend logs/events/errors; Copy Details дополнительно
очищает structured values/строки и сохраняет useful error code/stage.
Java probe имеет timeout и bounded stdout/stderr; game/loader lines ограничены
до allocation growth. Диагностика скрывает home path; обычные mod errors остаются.
Известные patterns/Bearer/cookies/tokens/passwords/OAuth signed queries/JWT
проверены synthetic values. Произвольный секрет без узнаваемого контекста может
не распознаваться. RU/EN notice просит проверить logs перед передачей:
имена, server addresses и пользовательский текст могут остаться.
Raw Minecraft/crash files создаёт сама игра; ручное OS-opening такого файла
не является автоматически sanitized export.

### CurseForge / Cloudflare: код и реальная публикация

Ключ `CURSEFORGE_API_KEY` остаётся Cloudflare Secret. Он не запрашивался,
не раскрывался, не записывался в Rust/React/GitHub или audit output.
Worker принимает только конкретные Minecraft read-only routes/GET и download
HEAD; arbitrary target, body, write, duplicate/invalid query и other-game
requests отклоняются. CORS не представлен как authentication. Signed ticket
с project/file ID и expiry — download admission, не доказательство Canary client.
API/archive cache не используется.

Durable Object `publisher-global` атомарно считает каждый реальный API fetch
между POPs, UTC daily/minute budgets, reserved bytes, download admissions и
concurrent leases. Edge per-IP limits сохраняются как smoothing. Каждый redirect
CDN проверяется вручную до передачи x-api-key; допускаются только official exact
hosts. Response headers allowlisted, private upstream errors/cookies/key headers
не возвращаются. Поток ограничен размером и 300 секундами; leases освобождаются
или истекают. Respect distribution rights, unavailable files и missing downloadUrl
сохраняет manual download path.

После security push обнаружилось **уже существующее Cloudflare Builds
подключение**, автоматически создающее Worker versions. Ручной `wrangler deploy`
не запускался; выполнялся только dry-run. Нельзя утверждать, что code deployment
не произошло. GitHub check подтвердил успешные Builds; последний проверенный
app commit `e80a4b9` получил version
`b10a0ea4-ebbc-40bd-9dd6-fa091d56360f`.

Safe live `/health` с User-Agent Canary после первого push вернул:
`protocol:2, configured:true, rateLimiting:true, gatewayApproved:false,
ready:false, api:not_checked, reason:terms_approval_required`.
Он не обращался к API издателя. Дополнительно в `wrangler.jsonc` явно
зафиксировано `CURSEFORGE_GATEWAY_APPROVED=false`, чтобы последующие Builds
не включали публичное использование.

Third Party API approval/выдача ключа не подтверждает shared server gateway.
Публичное включение требует отдельного publisher confirmation и согласованных
quotas. Примерные quotas в repo — не обещание стоимости или одобрение CurseForge.
Fixed windows допускают bursts на границах; anonymous traffic может исчерпать
quota для остальных; Cloudflare request/DO charges возникают даже при отказах.
Controlled live CurseForge install/search/CDN тесты не запускались до approval.
Health и mock tests не названы доказательством end-to-end live installation.

### Frontend, XSS, CSP и UX

DOMPurify HTML profile удаляет executable HTML/SVG/handlers/frames/style;
Markdown raw HTML отключён. URLs фильтруются по schemes/credentials/local
destinations, а provider HTML/Markdown images после F13 принимают public HTTPS
без local asset origins. Controlled Canary RemoteImage сохраняет asset support.
Remote images используют no-referrer. React error displays/Copy Details проходят
central sanitization с bounds/cycle protection.

Production CSP: scripts self, без eval/inline-script, script-src-attr/object/
frame/worker/base/form none; connections — IPC/local assets и Modrinth API.
Inline styles нужны существующим styles/Motion; inline JavaScript не разрешён.
Dev CSP допускает dev tooling, оно не подменяет production CSP.
Обычные menus, custom Java/JVM, imports и Discover не заменены пугающими dialogs;
native warning касается executable/code-loading trust decisions. RU/EN error
families для unsafe paths/sources/resource limits/consent добавлены.
Provider изображения могут видеть IP/CDN request посетителя; referrer suppression
не делает это анонимным.

### Updates, signing и release supply chain

In-app updater или automatic Canary executable replacement отсутствуют.
Поэтому существующая updater signature verification не заявляется.
Windows Authenticode signing не настроен; release installers не названы signed.
Перед добавлением updater нужны trusted metadata/source, signatures до execution,
защита от downgrade/подмены и private signing keys вне Git/CI PR builds.
Signing certificate/private keys не запрашивались.

Release reuse проверяет repository, trusted event/branch/workflow,
successful builds, source tag/version, actual checkout receipts/run/workflow SHA
и SHA-256 downloaded files до публикации. Historical artifacts без receipts
требуют rebuild того же tag. Full frontend QA gate из параллельного main
сохранён. Actions закреплены SHA; build tokens read-only, write нужен отдельному
receipt/note/publish job; PR не публикует notes и не получает release secrets.
Настроен Dependabot для root/gateway npm, Cargo и Actions.

### Dependencies и secret scanning

Root npm audit: **0** reported vulnerabilities. Gateway: baseline одна unique
High advisory в sharp через Wrangler/Miniflare (3 dependency entries);
после Wrangler **4.149.0** audit: **0**. Lockfiles сохранены;
полного несовместимого dependency churn не выполнялось.

Cargo-audit 0.22.2, advisory DB commit
`7eebec69c352c7191b1f13eb95dd510eeca5d1de`, 599 locked dependencies:
**0 vulnerability records**, но **2 реальных informational warnings**:
`proc-macro-error 1.0.4` unmaintained (RUSTSEC-2024-0370) и
`glib 0.18.5` unsound VariantStrIter (RUSTSEC-2024-0429).
Последний затрагивает Linux GTK transitive dependency; Windows dependency tree
glib не включает. Прямых Canary call sites affected iterator не найдено,
но это не доказательство полной недостижимости. Patched glib >=0.20 несовместим
с текущим GTK 0.18 stack; warning не скрыт ignore-list и не объявлен fixed.
Нужен compatible upstream transition/backport с Linux QA.

Gitleaks scan current tracked text snapshot (239 files) и всех reachable unique
historical text blobs исходных 28 main commits: **0 leaks**.
Binary blobs не выдавались за полноценно просканированные text.
Новые commits добавляют только code/tests/docs/config и synthetic test values;
temporary artifacts, node_modules, target, real credentials/private keys/.env
не включены в commits. Полный history rewrite/rotation не выполнялись,
поскольку реальный committed key не обнаружен. Zero findings не исключает
нестандартного/нераспознаваемого secret format.

Primary references:
[RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html),
[RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html),
[gtk-rs fix](https://github.com/gtk-rs/gtk-rs-core/pull/1343),
[sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).

### Test results: выполнено, вручную и не выполнено

| Проверка | Фактический результат / предел доказательства |
| --- | --- |
| npm run build | PASS до последнего F13 follow-up; последний follow-up повторно не собран |
| cargo check --locked (Linux) | PASS |
| cargo test --locked --lib | 109 passed / 0 failed / 9 ignored / 1 filtered; filtered Discord socket test нельзя выполнить: AF_UNIX denied в environment |
| Rust security regressions после добавления redirect case | 9 / 9 PASS; это subset, не прибавление 9 к full suite |
| Дополнительные Rust policy/fs/integrity/privacy tests | Входят в full suite: private URL/DNS, sentinel hardlink/parent swap, same-size tamper, bounded lines |
| Frontend security regressions | Первые 4 / 4 PASS; после F13 теперь 5, extended cases/new Markdown test ещё не выполнены |
| Browser CSP tests | 3 PASS в предыдущем полном прогоне; packaged Windows WebView2 CSP/IPC тест не выполнен |
| Worker tests | 21 / 21 PASS; в approval regression добавлены false/invalid значения, без live API traffic |
| Wrangler deploy --dry-run | PASS; не ручная публикация сервиса |
| Release provenance node tests | 3 / 3 PASS; настоящий publish/reuse и подписанный installer не проверялись |
| Linux Tauri build --ci --bundles deb -- --locked | PASS; Canary_0.1.8_amd64.deb 22.88 MiB, до последнего F13 follow-up |
| Первоначальный full frontend suite | 139 passed / 26 failed; повторная baseline-2ac проверка этих 26: 24 failed / 2 passed |
| Full frontend после объединения 7fdd98e | Запущено 174 tests. На последнем доступном выводе были 10 failed и продолжение прогона; итог недоступен после disconnect. Не заявляется PASS |
| Сравнение с последним upstream 7fdd98e | Запущено 8 failing cases в isolated baseline; видимые повторные ошибки включали native material harness/cursor. Итог недоступен; все failures не объявляются доказанно unrelated |
| GitHub Desktop verification | failure до шагов, steps отсутствуют, logs 404. Один retry не помог. Причина недоступна; billing/ошибка кода не приписываются без доказательств |
| Windows cross-target check | Windows std установлен, cargo check запущен; финальный результат недоступен. Не заменяет Windows build/GUI |
| Controlled live Modrinth install | Локально не прошёл DNS до API request; добавлен explicit ignored-fixture запуск в Linux CI, но CI steps не стартовали |
| Real Microsoft/Ely.by sign-in, vault migration/logout | Не выполнялись с личными credentials; code/mock/isolated regression coverage вместо неподтверждённого live результата |
| Real approved CurseForge search/install/CDN | Не выполнялся до отдельного gateway approval; live safe health проверен |
| Existing user instances/worlds | Не использовались, не удалялись и не мигрировались для attack tests |

Ручной code/config/diff review выполнен, включая отдельный baseline threat model,
historical schema, permissions, secrets/redaction sinks и supply chain.
Ручное взаимодействие с native GUI, account provider login, установка в реальную
пользовательскую сборку и полный manual end-to-end walkthrough не выполнялись.
Browser fixtures/native-qa harness preparation не названы ручным GUI тестом.

Доступные CI receipts:
[security push run](https://github.com/ccardcat/canary/actions/runs/37933848731),
[frontend follow-up run](https://github.com/ccardcat/canary/actions/runs/37936034615).
Эти failed runs не используются как успешная validation evidence.

### Матрица покрытия пунктов ТЗ

| Пункт ТЗ | Выполненная работа / оставшийся предел |
| --- | --- |
| 1. Project inspection | Clean baseline, safe main sync, modules/auth/install/launch/Worker/Actions review; parallel upstream сохранён |
| 2. Threat model | Entry points, adversaries, boundaries, risks и limits записаны до fixes |
| 3. Audit report | Сохранён original report с file/function/severity/exploit/fix/check; appended actual statuses |
| 4. Accounts | OS vault/metadata isolation/OAuth/provider/account guards; legacy plaintext не найден; live login не выполнен |
| 5. Tauri | Explicit 73-command local-main ACL, scoped opener, backend validation; native remote denial QA pending |
| 6. Filesystem | Shared traversal/Windows/archive paths, handle-relative mutation, staging/atomic cleanup; real Windows QA pending |
| 7. Downloads | Public-network pinned DNS/hops, hashes/receipts/bounds/manifests; live installs pending |
| 8. Process | Direct spawn, custom consent, args/env/privacy/lifecycle; OS sandbox не заявляется |
| 9. Worker | Routes/key/CDN/gate + global quotas/streams/tests; auto Builds обнаружен, API remains approval-gated |
| 10. Frontend | Sanitization/URL/image/CSP/Details; last F13 build/test pending |
| 11. Privacy | Redaction/bounded lines/home paths/export notice; arbitrary user text/raw crash files require review |
| 12. Updates | Updater absent, unsigned release accurately recorded; signing/future updater requirements documented |
| 13. Git/CI/deps | History/current secret scan, audits/update/lockfiles/SHAs/privileges/Dependabot/provenance |
| 14. Attack scenarios | Isolated traversal/ZIP/link/hashes/limits/redirect/vault/args/XSS/Worker tests; no destructive load/user-data tests |
| 15. UX | Features retained, targeted native trust consent and RU/EN errors; full current UI suite not green/complete |
| 16. Build/validation | Linux build/check/test evidence, failed/blocked/incomplete checks separated; Windows/native GUI not proven |
| 17. Final report | All required domains, findings/results/remaining risks/Git below |
| 18. Critical acceptance | Code fixes delivered; no claim of complete acceptance until unresolved validation and release/gateway prerequisites are closed |

### Remaining risks и следующий обязательный этап приёмки

1. Запустить full build/tests после F13, разобрать full current frontend failures,
   проверить Windows installers/junction/ACL/packaged CSP/native GUI.
   Execution environment и GitHub job startup должны сначала стать доступны.
2. Выполнить controlled live Microsoft/Ely.by/Local lifecycle и Modrinth install/
   cancel/update/launch без пользовательских данных; approved CurseForge —
   только после отдельного publisher confirmation и реальных quotas.
3. Решить Linux glib unsound warning через compatible patched stack/backport
   и отслеживать unmaintained proc-macro-error; нельзя трактовать audit 0
   vulnerability records как отсутствие warnings.
4. Windows Authenticode и future updater signatures отсутствуют; SHA-256
   release receipts/checksums не заменяют подпись доверенного издателя.
5. Untrusted JAR/mods/agents/custom Java исполняют код с правами OS user.
   Подмена approvals/receipts и чтение process args при compromised same-user
   остаются за пределами launcher isolation.
6. Regex redaction не гарантирует распознавание любого secret/user text.
   Raw game/crash files и передача diagnostics требуют review; remote images
   видят сетевой адрес пользователя.
7. Anonymous gateway quota exhaustion, fixed-window bursts и Cloudflare costs
   остаются; approval gate выключен, tickets не являются client authentication.
8. Ambient corporate proxies отключены; intentionally linked/junction-based
   managed paths могут требовать явного переноса в обычный каталог.

### Git и delivery

Ветка назначения — `main`; исходный baseline `2ac633d`, параллельный upstream
`7fdd98e` включён целиком. Force push/reset/history rewrite не использовались.
Локальный pre-hardening report commit `8fc603c` сохранён в
`security-local-baseline-report`.

| Commit | Изменение |
| --- | --- |
| 6ea1e12e8f40b0b607e9f5395015174cdefb57b4 | Original baseline findings/threat model |
| 8bf72cca3087442eb885c7681a1c3652e99b5443 | Rust filesystem/network/accounts/integrity/Java/privacy + Tauri/frontend guard/tests |
| b3cd012a21e826d9e8000bc70173d5ecaef7c6ff | Global gateway budgets, bounded streaming, Wrangler update/tests/docs |
| 01fcae460e5f0fb4fae3fc673c3303183108f313 | Pinned/least-privilege CI, release provenance, native ACL/CSP QA preparation |
| ddb93a5b0244031bafadb7792525692d40f65759 | Explicit disabled approval value for existing automatic Cloudflare Builds |
| e80a4b9d73f7852afdcc0388d79af79c584d52ec | Provider image boundary, trailing-dot hosts, extended regressions |
| This report commit | Full measured results, incomplete validation, residual risks и пункт-за-пунктом acceptance |

Все перечисленные code commits успешно опубликованы в `main` с expected-head
checks и `force:false`. Перед первым push staged tree SHA совпал с remote tree.
Последние follow-ups/report после disconnect опубликованы через GitHub;
состояние локального checkout/index для этих commit не удалось повторно
синхронизировать/проверить. Нельзя заявлять clean local working tree.
Реальный release/tag не создавался, пользовательские credentials/данные
не перемещались для аудита.
