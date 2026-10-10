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

Deployment follows the existing Cloudflare Builds connection to `main`. The
commit is configuration activation, not proof of deployed API access. Live health,
search and download results are recorded separately once observed.
