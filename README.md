# Canary

A Tauri 2 desktop app for discovering Minecraft content and installing Modrinth modpacks. React, TypeScript, Rust and Vite; local Nunito typography and Canary artwork.

## Development

Use the existing checkout. Install Node.js 24, Rust (validated with 1.99.0) and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). Linux needs GTK 3 and WebKitGTK 4.1 development libraries.

```sh
npm ci
npm run tauri dev
```

`npm run dev` runs frontend-only inspection on port 1420. Installation requires the native Tauri window. Home and Discover are separate; Discover uses 12 results per page and preserves search, filters and sort through pagination. Servers, Microsoft authentication, Java management and Minecraft launching are not implemented in this phase.

Appearance includes Dark, Light, AMOLED and live System mode, surface presets, accents, compact navigation and reduced motion. Settings and the library are stored locally. Project descriptions/changelogs use safe Markdown; raw HTML and unsafe link protocols are not enabled.

## Checks

```sh
npm run build
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
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

See [validation notes](docs/QA.md) for the verified scenario and remaining platform limits.

## Releases

Pushing a `v<version>` tag matching `package.json` and the Tauri configuration builds Windows x64 EXE/MSI and Linux x64 DEB/AppImage through GitHub Actions. The workflow publishes a GitHub Release only after both platform builds pass, with `SHA256SUMS` and [release notes](docs/RELEASE.md). No signing certificate is configured.

If a tag push does not trigger Actions, open **Actions → Desktop release → Run workflow**, select branch `main`, enter the existing tag (initially `v0.1.0`), and choose `windows` or `windows-and-linux`. The manual run defaults to Windows EXE/MSI and publishes the selected platform builds after they pass. It builds the tagged source, even when the workflow is launched from `main`.

The publication receipt is saved in `refs/notes/releases` on the tagged commit, including the workflow URL, release URL and asset metadata. This allows checking publication through Git when the cloud environment cannot access the GitHub REST API:

```sh
git fetch origin refs/notes/releases:refs/notes/releases
git notes --ref=releases show 'v0.1.0^{}'
```
