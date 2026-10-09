# Canary security follow-up — 2026-10-09

Reviewed baseline: `5a2a585a8630541ee47605204a5a5ef10d986d57` on `main`.
This report supplements [the previous audit](SECURITY-AUDIT.md); its existing
findings are not counted as newly discovered vulnerabilities.

## New findings fixed on main

### S1 — Custom JVM options could replace the managed program

**Severity: high, conditional.** An attacker needs control of custom launch
settings, for example through imported/modified preferences or compromised
local UI access. This is not evidence that an ordinary catalog description
can execute code or that an account was compromised.

`java::validate_arguments` previously checked only size and null bytes.
`process::launch` prepends those arguments before Canary's managed main class.
`-jar payload.jar`, a bare main class, module/source selectors or a JVM argument
file could therefore select a different program without the existing native
code-loading consent check. The remaining managed arguments, including an
account access token, could be delivered to that program.

A harmless JAR on actual OpenJDK 17 reproduced the ordering issue: it printed
the managed arguments and a synthetic token. No user credentials were used.

Commit: `686a5a2e4049dc2a02eb8080c93045b430102299`.

- Reject custom entry-point/classpath selectors, bare program operands and JVM
  argument files in the shared save/authorization/launch validation path.
- Preserve normal memory/GC/property options and valid separate operands for
  module compatibility options such as `--add-opens`.
- Extend the existing native consent policy to error-command hooks, JVM
  configuration files, native agents and legacy extension/module paths.
- Include legacy `--session` in managed identity protection. Explicit game
  options continue to work; game arguments beginning with `@` remain literal.
  Actual Java testing showed argument files are not expanded after the main
  class, so no game-argument-file bypass is claimed.

### S2 — Additional credential formats survived diagnostic redaction

**Severity: medium, conditional disclosure.** Generic opaque tokens/secrets,
Xbox `IdentityToken`/`RpsTicket`/`UserTokens`, proxy authorization credentials
and escaped quoted passwords could survive existing text redaction. Structured
credential/cookie fields could also appear in copied frontend diagnostics.
Sharing such diagnostics could disclose secrets; no automatic upload or
evidence of prior exfiltration was found.

Commit: `2aa4104557e4e7677c11164371030650d2a5467c`.

The backend and frontend now recognize these additional formats, redact
quoted values with escaped characters and token arrays, and mask entire
sensitive structured fields before copying details. Ordinary error codes,
stages and messages such as "Token expired" remain readable. Redaction is
defense in depth, not a guarantee that arbitrary unlabeled text contains no
secret; the existing active-token replacement and secret-storage policies
remain necessary.

## Review scope and verification

Source review covered account/keyring ownership, OAuth/PKCE/loopback handling,
authenticated redirects, public download URL/DNS policy, download integrity,
archive paths and filesystem protections, child process construction,
Tauri IPC capabilities/CSP, external HTML/Markdown, the CurseForge gateway
and release workflow boundaries. Existing controls were retained.

Checks completed for this follow-up:

| Check | Result |
| --- | --- |
| Production JVM policy compiled directly with Rust, edition 2021 | 5 tests passed |
| Production Rust redactor and new regression test in an isolated regex-only crate | 1 test passed |
| Page-free Playwright privacy/library/catalog tests | 17 tests passed, including 5 new privacy tests |
| Actual InlineError rendering and Copy Details; actual HTML/Markdown components in jsdom | 3 scenarios passed; DOM simulation, not native WebView QA |
| Frontend type check with TypeScript 6.0.3 compatibility runner | Passed; checked-in TypeScript 7 binary cannot run in this environment |
| Vite production build | Passed; local missing public-font/background warnings, remote assets preserved |
| Gateway unit test command | Passed |
| Root and gateway npm audits | 0 reported vulnerabilities in each |
| OSV batch scan of exact versions in current Cargo.lock | 606 registry packages checked; known findings below |
| Pattern scan of 200 source/service/script/workflow/document files | No private-key, GitHub-token or AWS-key candidates; not a renewed full-history scan |

No real login, user-secret access, production attack/load test, release,
installer publication or gateway deployment was performed. Full Tauri/native
backend integration tests and Windows/real-WebView end-to-end scenarios were
not run: the environment lacks the Linux GTK/WebKit build prerequisites and
a usable browser. Added backend integration regressions still require native
CI execution. Passing isolated tests does not imply that the full native test
suite passed.

GitHub Actions [run 37995675102](https://github.com/ccardcat/canary/actions/runs/37995675102)
for the launch-policy commit ended in `failure`. All six jobs have empty step
lists and no assigned runner name in the jobs API; no build/test step is
recorded as executed. The frontend job log endpoint returned `BlobNotFound`.
The connector cannot read check-run annotations, so the underlying scheduling
failure could not be established. This is not a successful CI receipt and no
native verification is claimed from that run.

## Remaining known dependency findings

- `glib 0.18.5`: [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)
  / GHSA-wrw7-89jp-8q8g are aliases for the same `VariantStrIter` unsoundness.
  Fixed versions start at 0.20, incompatible with the current GTK 0.18 Linux
  stack as a simple lockfile update. The Windows build does not include glib.
  No direct affected Canary iterator call site was found, which does not prove
  it is unreachable through dependencies. This remains unresolved and needs
  a compatible patched stack or reviewed backport plus native Linux testing.
- `proc-macro-error 1.0.4`:
  [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html)
  is an unmaintained-package warning, not a newly demonstrated runtime leak.

This follow-up used OSV queries, not a new execution of `cargo audit`. No other
advisories were returned for the queried locked registry package versions.
The prior report's signing/native QA limitations also remain open. These
results do not establish that the launcher or third-party Minecraft mods are
free of all vulnerabilities.
