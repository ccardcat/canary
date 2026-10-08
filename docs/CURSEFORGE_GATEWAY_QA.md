# Public CurseForge integration

Validated locally on Windows, 2026-10-08, from main at `0f4fc0a`.

## Implemented

The Cloudflare Worker in `services/curseforge-gateway` provides read-only Minecraft metadata and streams permitted official CDN downloads. The publisher credential exists only as a Worker secret. Download tickets are signed, expire after 30 minutes and bind project/file IDs. Incoming targets and publisher redirects are restricted; errors and outgoing headers do not expose upstream credentials. Author distribution restrictions remain enforced. Raw metadata is cached briefly; ticketed responses are not cached. Rate bindings limit per-IP requests and total traffic per Cloudflare location.

Rust requests use the configured gateway without an API key. The public origin comes from the non-secret `CANARY_CURSEFORGE_PROXY_URL` build variable, with a runtime override for development. Release and verification workflows include it. Direct developer API-key mode remains available with authenticated CDN requests and checked redirects. Java inherits neither CurseForge configuration variable.

The frontend derives provider availability from the backend snapshot. Configured builds enable Discover, content, installation, repair and updates. Unconfigured builds show an unavailable state without making provider requests. Gateway ticket rotation does not change the content approval fingerprint, while changed checksums/identities/destinations still do.

## Results

- `npm run build`: passed.
- Rust unit suite: 87 passed, 7 ignored. New cases cover gateway URL/CDN validation and stable approval across ticket rotation; existing integrity, cancellation, content transaction and account checks passed.
- Gateway Node tests: 9 passed. Cover authenticated search, signed streamed downloads, expiry/tampering, restricted distribution, other-game/arbitrary-target rejection, redirects, rate limiting, error redaction and raw cache behavior.
- Wrangler deployment dry run: passed, including all three rate limit bindings. No production deployment occurred.
- Actual local Cloudflare workerd runtime: `/health` returned 200 with a synthetic test credential; a non-Minecraft search returned 400 before contacting CurseForge. The disposable local server was stopped afterward.
- Eleven targeted browser checks passed across backend-ui, home-polish, material-install-state and stabilization. Includes configured provider search/details/HTML sanitization and installation IPC without a key, twelve-item pagination, unconfigured state, request cancellation and existing task identity. An initial run had three startup timeouts under simultaneous native compilation; the subsequent serial run passed all eight with a 60-second test timeout. Three additional content/account/about geometry checks passed in both languages.

Real publisher authorization and real CurseForge file installation remain unverified: the owner has not entered the issued key into a deployed Worker. Wrangler was not authenticated; browser OAuth was started but timed out waiting for user authorization. No production URL or Cloudflare account was invented. Complete [deployment and release configuration](../services/curseforge-gateway/README.md) to enable this for distributed Canary builds.
