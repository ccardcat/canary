# Canary CurseForge gateway

This Cloudflare Worker keeps the publisher API key on the server. Canary users do not enter a key. Only the public Worker origin is included in the launcher. Metadata and downloads use the official CurseForge API/CDN, with author distribution restrictions preserved.

## First deployment (launcher owner only)

In PowerShell, from the repository:

```powershell
cd F:\Canary\services\curseforge-gateway
npm ci
npx wrangler login
npx wrangler secret put CURSEFORGE_API_KEY
npm run deploy
```

The secret command prompts for the key interactively. Do not paste the key into source files, chat, GitHub Variables or a command argument. `CURSEFORGE_API_KEY` is a Cloudflare Worker secret, separate from the launcher's optional development environment variable. Wrangler may offer to create the Worker during secret setup; accept the configured `canary-curseforge` Worker. Alternatively deploy first, then add the secret: the service returns 503 until configured.

After deployment, verify `https://YOUR-WORKER.workers.dev/health`. It should return `{ "service": "canary-curseforge", "configured": true }`. Health verifies that the server has configuration and rate limit bindings; it does not prove that the publisher key is authorized. Verify real access with `/v1/mods/search?gameId=432&classId=4471&pageSize=1`, then install a permitted small project through Canary.

## Connect every Canary release

Set the GitHub repository **Actions Variable** `CANARY_CURSEFORGE_PROXY_URL` to the public Worker origin, e.g. `https://canary-curseforge.YOUR-SUBDOMAIN.workers.dev`. Use the origin only, with no `/v1`, query, credential or secret. Desktop verification and release workflows pass this non-secret address to the Rust compiler. Create the next desktop build after setting it. Changing the variable does not alter installers that were already built.

For a local rebuild:

```powershell
cd F:\Canary
$env:CANARY_CURSEFORGE_PROXY_URL = 'https://canary-curseforge.YOUR-SUBDOMAIN.workers.dev'
npm run tauri build
```

This address is compiled into the executable, so end users only install/update Canary. A runtime variable with the same name overrides it for development. Builds without a configured origin show CurseForge as unavailable and make no provider requests. A direct developer key via `CANARY_CURSEFORGE_API_KEY` remains supported, but is never compiled into the application or passed to Java.

## Behavior and operation

- Only read-only Minecraft search, project, description and file routes are exposed. Other games, arbitrary target URLs, oversized pages, duplicate/unknown parameters and write methods are rejected.
- API and CDN requests send the publisher key only to exact official hosts. Redirects are checked before credentials are sent. Publisher errors and response headers containing credentials are not forwarded.
- File metadata receives a signed download ticket valid for 30 minutes, bound to project/file IDs. The gateway rechecks publisher metadata and restrictions, then streams the official archive. It does not buffer game files or invent download URLs. The launcher still verifies publisher sizes/hashes and retains cancellation and atomic content installation.
- Approval fingerprints ignore rotating gateway authorization tickets, while retaining project/version IDs, destinations, sizes, filenames, checksums and stable URLs. Refresh expired links by reviewing installation again.
- Raw public metadata is cached for 60 seconds. Ticketed responses and streamed downloads use `no-store`. Rate bindings limit API and download requests per IP and total requests per Cloudflare location; these are not a global billing cap. Shared networks may need higher limits. Account quotas, CPU limits and availability still apply; monitor usage in Cloudflare and adjust the plan/limits for actual traffic.
- The Worker includes no request/secret logging. Optional Cloudflare request logging should avoid storing download tickets. Rotate the secret with `wrangler secret put CURSEFORGE_API_KEY`; rotation also invalidates existing tickets unless an independent `DOWNLOAD_SIGNING_KEY` Worker secret is set.

## Verification

```powershell
npm test
npx wrangler deploy --dry-run
```

Tests cover authenticated upstream search, signed downloads and exact streamed bytes, ticket expiry/tampering, publisher restrictions, endpoint/host validation, credential-safe redirects, rate limits, redacted failures and raw metadata caching. Test credentials are synthetic. A real publisher key is required for live validation; a local test pass is not evidence of a deployed/authorized production service.

References: [CurseForge API](https://docs.curseforge.com/rest-api/), [required CDN authentication](https://blog.curseforge.com/introducing-api-key-authentication-for-curseforge-file-downloads/), [Worker rate limit bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [Worker limits](https://developers.cloudflare.com/workers/platform/limits/).
