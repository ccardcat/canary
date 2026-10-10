# Canary CurseForge gateway: preparation and verification

The October 8 report below is historical. The October 10 activation section
records the later owner-confirmed approval and current validation.

Date: 2026-10-08 (Europe/Moscow). Starting main: `0217de9`.

## Real deployed endpoint

The owner supplied `https://canaryclientcurseforge.forwildcraft222.workers.dev` and confirmed the server secret name `CURSEFORGE_API_KEY`. Its value was not requested, read, printed or saved.

Real HTTP requests to /health, permitted search, a different-game search and categories all returned HTTP 200, Content-Type text/plain, and `Hello World!`. Therefore the created Worker is still the starter deployment. This is not proof of CurseForge API authorization or installation.

The owner explicitly confirmed that gateway/file streaming had not been separately discussed with CurseForge. Public API access stays disabled pending publisher confirmation. The earlier metadata cache was removed. See the [third-party API terms, `3.1](https://support.curseforge.com/support/solutions/articles/9000207405-curseforge-3rd-party-api-terms-and-conditions) and the [owner's setup guide](../services/curseforge-gateway/README.md).

## Prepared code

- Exact read-only Minecraft routes for search, category discovery, Minecraft versions, project details, file lists and approved file streaming. Requests validate methods, bodies, URL/header sizes, parameters, duplicates, IDs, pagination and filters.
- No Cache API use or persistent API/archive storage. API/CDN fetches and client responses use no-store. Publisher errors/headers are redacted. Credentials are attached only to exact official upstream hosts and checked redirects.
- Rate bindings remain required; missing bindings fail closed. Public endpoints additionally require the owner-side CURSEFORGE_GATEWAY_APPROVED flag after confirmation. Health safely reports configuration/readiness without returning secrets. API health probes only after these prerequisites.
- Worker name matches the existing canaryclientcurseforge deployment. keep_vars preserves owner-managed dashboard variables during Git deployments.
- The provided origin is the client's default public address. Backend availability checks actual protocol-2 API health; a Hello World response cannot enable CurseForge. The short local memo stores only the gateway's own health boolean, not publisher metadata.
- Discover has provider category IDs, remote Minecraft-version options, loader filters, compact cards, project details and filenames. Restricted/unavailable projects have disabled installation actions.
- Discover mod installation selects an eligible existing instance, resolves compatible releases/dependencies, reviews the plan, then queues the existing install_content task in Downloads. Modpack installation retains the existing installer. Publisher restrictions, hashes, cancellation and atomic content application remain in place.
- The publisher's 10000-result pagination limit is enforced, including a partial final page.

## Local checks

- Frontend production build passed.
- Full Rust suite passed: 87 tests, 8 ignored. After the final CurseForge pagination/availability changes, the targeted CurseForge suite passed: 7 tests, 1 live test ignored.
- Worker tests passed: 13. Synthetic credentials only. Covers signed streamed bytes, API/CDN authentication, expiry/tampering, permitted endpoints, other-game/target rejection, author restrictions, no-cache behavior, approval gating, health errors, request size/filter bounds and rate limits.
- Final targeted browser run passed: 11. Covers both configured and unavailable provider states, real category-ID/loader/version request contracts, project details sanitization, mod and modpack installation IPC, Downloads handoff, restricted projects, pagination, provider cancellation and Modrinth restoration. These tests use mocked IPC and do not claim a live CurseForge download.
- Wrangler dry run passed with the three configured rate bindings. No production deployment or secret modification occurred.

## Explicitly not verified

Live publisher API access, a real permitted mod download/installation, and a real modpack installation are not verified. No gateway approval was assumed from an API key. The ignored real_gateway_mod_install test is prepared to create a disposable instance, install a compatible permitted Fabric API release through the actual gateway, verify the publisher SHA-1 and inventory, then clean up. It requires explicit live verification opt-in and successful deployed API health.

The browser-only deployment guide provides source-paste/Deploy instructions, GitHub Builds configuration for rate bindings, safe health links and a ready-to-send publisher confirmation request. Until the owner completes deployment/confirmation and real-file validation passes, this is a prepared integration, not an activated/verified production service.


## October 10: owner-confirmed approval and activation

The owner reported that CurseForge permission was granted and requested enabling
it. `services/curseforge-gateway/wrangler.jsonc` now sets
`CURSEFORGE_GATEWAY_APPROVED` to `"true"`. This changes the approval flag only:
existing API/day/byte/concurrency budgets, rate bindings, Durable Object migration,
request validation, author distribution restrictions and the server-secret model
are unchanged. No publisher key was requested, read, printed or committed.

Before this change the actual deployed `/health` returned HTTP 200 JSON with
`configured: true`, `rateLimiting: true`, `gatewayApproved: false`, `ready: false`
and `reason: "terms_approval_required"`. The integration was deployed and
configured; its approval flag was the blocking prerequisite.

Validation: all 20 gateway/budget tests passed with synthetic credentials. A
separate check using the actual Wrangler variables/binding names returned
protocol-2 `gatewayApproved: true`, `ready: true`, `api: "reachable"` against a
synthetic upstream and confirmed missing secrets or budget bindings still block
upstream calls. The full configuration compared equal to the baseline after
excluding the approval flag. Client/backend source and dependencies are unchanged.
Wrangler dry-run was not repeated: its CLI is unavailable in this workspace.

Live verification after activation commit `61487750f06b2feea0305c8633d3af79bccf530b`:

- Cloudflare check `Workers Builds: canaryclientcurseforge` completed successfully
  and created version `00d78a4f-aa2f-490b-ace3-0aafe27b0e53`.
- Actual `/health?check=api`: HTTP 200, protocol 2, configured/rateLimiting/
  gatewayApproved/ready all true and `api: "reachable"`.
- Actual search with Minecraft 1.21.1, Fabric and mod-class filters returned the
  permitted Fabric API project. Actual filtered file listing returned compatible
  Fabric releases with signed URLs on the Canary gateway.
- Downloaded a permitted Fabric API JAR through that signed gateway URL into
  disposable QA storage. Its byte count matched API fileLength and calculated
  SHA-1 matched the publisher hash. No publisher key/cookies were returned.

These are real gateway/API/file checks, not mocked network responses. Native
instance installation, inventory persistence, modpack installation and Minecraft
launch were not run during this activation. Existing compatibility/dependency
checks and transactional installers remain unchanged. Restart a current client to
refresh provider availability; no end-user key is required.

GitHub Actions verification jobs for activation run `38081578222` reported failure
with empty step lists. This is not a successful application CI receipt and no
cause is inferred. The separate Cloudflare build and live service checks above
succeeded. Local gateway/budget test results are recorded separately above.
