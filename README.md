# Canary

A Tauri 2 Windows/Linux desktop Minecraft launcher with Modrinth discovery, isolated instances, Java management and real Local-profile game launching. React, TypeScript, Rust and Vite; local typography and Canary artwork.

Discord Rich Presence uses the local desktop client, real Minecraft process sessions and the existing task registry. **Settings → Discord** controls sharing, names, downloads and page visibility. No Discord sign-in/token is required. See [Discord setup, assets and QA](docs/DISCORD_RICH_PRESENCE_QA.md) for Developer Portal configuration and verified/remaining checks.

## Development

Use the existing checkout. Install Node.js 24, Rust (validated with 1.99.0) and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). Linux needs GTK 3 and WebKitGTK 4.1 development libraries.

```sh
npm ci
npm run tauri dev
```

`npm run dev` runs frontend-only inspection on port 1420. Installation and launching require the native Tauri window. Home and Discover are separate; Discover uses 12 results per page and preserves search, filters and sort through pagination. Server listings remain unavailable. Ely.by uses its official launcher login/password protocol in the native application.

In the desktop app, create a **Local account** in the account menu, then use **Library → New instance**, import a local **.mrpack** through its native picker and preview, or install a Modrinth modpack. Canary resolves the official Minecraft runtime, compatible Java, assets, libraries and loader before Play. Successful creation closes the dialog and highlights the new Library card. Local profiles are for single-player/local scenarios and do not authenticate to official online-mode servers.

Runtime settings are grouped under **Settings → Minecraft / Downloads / Advanced**, with the existing **Canary** overview retained. Settings search also finds Window, Background, Effects, Typography, Storage and Account. Global and per-instance Java, RAM, arguments and resolution are supported. Profiles and settings persist in the platform app-data folder. Instance storage can be selected on another drive; Settings offers verified migration or keeping existing instances in their original folders.

Ely.by sign-in is available through **Account → Sign in to Ely.by**, including the documented two-factor retry. Passwords are used once; session tokens go into Windows Credential Manager rather than JSON/localStorage. Microsoft uses browser Authorization Code + PKCE, Xbox/XSTS and Minecraft entitlement/profile checks, with refresh tokens in OS secure storage. `CANARY_MICROSOFT_CLIENT_ID` overrides the registered public client. A licensed account and Minecraft-services permission for the application are required. CurseForge search, content, modpack installation, repair and updates are enabled when this build has a configured public gateway. Users do not enter an API key. The launcher owner deploys the [Cloudflare gateway](services/curseforge-gateway/README.md) and sets the non-secret CANARY_CURSEFORGE_PROXY_URL build variable; the publisher key stays in the Worker secret store. Builds without a gateway show CurseForge as unavailable.

Use **Library → + Content** to manage an instance’s mods, shaders, resource packs and world-specific datapacks. Provider browsing prefills the Minecraft version/loader, resolves required dependencies and verifies downloads. Local JAR/ZIP import, scoped file drop, enable/disable, bulk actions, compatible updates, snapshots, rollback and recent changes are supported. Modpack updates reuse the existing installer in isolated staging, preserve user additions/worlds/configuration and block conflicting user files.

See the [implementation and QA report](docs/FOLLOWUP_INTEGRATION_QA.md) for current changes, executed tests, native screenshots and remaining account/platform checks. The [earlier integration report](docs/FINAL_INTEGRATION_QA.md), [account/content report](docs/CONTENT_ACCOUNTS_PHASE.md) and [runtime backend report](docs/BACKEND_PHASE.md) document the preserved pipeline. Successful Ely.by account/game authentication requires an owner-driven credential test; it is not inferred from the negative API and storage tests.

Appearance includes Dark, Light, AMOLED and live System mode, seven independent surface materials (Solid, Soft, Vibrancy, Glass, Clear Glass, Liquid Glass, Transparent), native Windows Acrylic/Mica/Mica Alt with supported fallbacks, titlebar branding/control styles, glass dropdowns, rotating application artwork in Home, snow/sakura/autumn effects and persisted typography sizing. Low quality disables UI backdrop blur/frost and limits particles; reduced motion and focus mode stop ambient motion. Linux reports a Solid fallback for Windows-only materials. Project descriptions/changelogs use safe Markdown or sanitized CurseForge HTML. Custom backgrounds use a native image picker and managed copies. F11 toggles real launcher fullscreen and restores previous geometry/maximized state, independently of Minecraft fullscreen.

## After moving or renaming the checkout

Cargo build output can retain absolute paths to the old directory, including Tauri-generated plugin permissions and native dependency libraries. If a build references the old path, regenerate the local build cache from the repository root:

~~~powershell
cargo clean --manifest-path src-tauri/Cargo.toml
npm run tauri build
~~~

This removes generated Rust build artifacts; launcher profiles, accounts and installed Minecraft instances are stored separately. For a release-only failure, add `--release` to the clean command. The first rebuild will take longer.

## Checks

```sh
npm run build
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
npx playwright install chromium
npm test
```

For an already installed Chromium, use `BROWSER_EXECUTABLE_PATH=/usr/bin/chromium npm test`. Browser tests use deterministic API responses to exercise pagination, stale responses, resize, themes, Markdown and native error handling; they do not validate backend downloads.

An explicit integration test downloads a real Fabulously Optimized release, checks its files/metadata, verifies reusing the completed installation, and removes its temporary instance:

```sh
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib real_modrinth_install -- --ignored --nocapture
```

This test needs HTTPS access to `api.modrinth.com` and `cdn.modrinth.com`. Creator-provided Markdown images and modpack file URLs may use additional hosts. The network test is intentionally ignored in the default offline suite.

## Installation diagnostics

Rust reports named stages, HTTP errors, path/URL context, checksums and the error cause chain. Downloads and configuration extraction happen in a temporary instance; the completed folder is published after metadata is written. ZIP directory entries are created as directories, and client overrides take precedence. The returned path is saved in Library only after native completion. A failed local library write can be retried without overwriting the completed instance.

Instance metadata is stored at `<local app data>/Canary/instances/<project>-<version>/canary-instance.json`. Existing legacy instances/local library entries are preserved. Error toasts offer Retry and Details; diagnostics can be selected or copied.

## Cloud desktop testing

The prepared cloud environment has native dependencies under `/workspace/.toolchains`. Source `/workspace/.toolchains/canary-env.sh` before Cargo commands. Use the environment's saved startup instructions for Xvfb and the PRoot WebKit helper-path mapping; these are machine setup details, not dependencies for ordinary Windows/Linux development.

In this headless machine, WebKit's GPU compositing crashed its web process during animated navigation. `WEBKIT_DISABLE_COMPOSITING_MODE=1` selects software rendering for Xvfb. Cargo's target runner can map the extracted WebKit helpers while `npm run tauri dev` remains outside PRoot. Keep TLS verification enabled.

See [validation notes](docs/QA.md) for the verified scenario and remaining platform limits. The [material ownership and install-state report](docs/MATERIAL_INSTALL_STATE_QA.md) covers independent sidebar layout, preset identities and project-scoped task state. The earlier [visual stabilization report](docs/VISUAL_STABILIZATION_QA.md) records renderer and native CI coverage; use the [visual regression checklist](docs/VISUAL_REGRESSION_CHECKLIST.md) before adding themes.

## Releases

Each push to main runs **Desktop verification** on Windows/Linux, builds EXE/MSI/DEB artifacts, and checks real packaged Windows window transitions, materials and themes through its WebView2. Windows screenshots/results are uploaded as artifacts. Receipts are saved in `refs/notes/qa-windows` and `refs/notes/qa-linux`.

Pushing a `v<version>` tag matching `package.json` and the Tauri configuration builds Windows x64 EXE/MSI and Linux x64 DEB/AppImage through GitHub Actions. The workflow publishes a GitHub Release only after both platform builds pass, with `SHA256SUMS` and [release notes](docs/RELEASE.md). No signing certificate is configured.

If a tag push does not trigger Actions, open **Actions → Desktop release → Run workflow**, select branch `main`, enter the existing tag (initially `v0.1.0`), and choose `windows` or `windows-and-linux`. The manual run defaults to Windows EXE/MSI and publishes the selected platform builds after they pass. It builds the tagged source, even when the workflow is launched from `main`.

If installers built successfully but publication failed, enter that run's numeric ID in `reuse_run` to retry publication from its saved artifacts without compiling again. Keep the same tag and platform selection as the original run.

The publication receipt is saved in `refs/notes/releases` on the tagged commit, including the workflow URL, release URL and asset metadata. This allows checking publication through Git when the cloud environment cannot access the GitHub REST API:

```sh
git fetch origin refs/notes/releases:refs/notes/releases
git notes --ref=releases show 'v0.1.0^{}'
```
