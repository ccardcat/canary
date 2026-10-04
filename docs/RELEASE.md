Canary desktop preview for Windows x64 and Linux x64.

This release adds a separate Home page, responsive glass sidebar, live System/Light/Dark/AMOLED themes, reduced-motion support, safe Markdown, corrected catalog pagination, and reliable Modrinth modpack installation with progress, diagnostics and retry. Completed installations appear immediately in Library.

## Downloads

- **Windows:** use the `.exe` installer, or `.msi` for managed installation. Installers include WebView2 bootstrap support. They are not code signed.
- **Linux:** use `.deb` on Debian/Ubuntu, or make the `.AppImage` executable and run it. The Debian package uses the system GTK/WebKit dependencies; AppImage may require FUSE or `--appimage-extract-and-run` on systems without FUSE.
- **SHA256SUMS:** checksums of every installer.

Minecraft launching, Microsoft authentication, Java management and CurseForge are not included in this preview. The current Library manages installed Modrinth modpacks.

Validation before release: production frontend build, seven browser regression tests, five Rust tests, a real 45-file modpack installation reaching 100% and Library, and native Linux UI checks. The release workflow runs Rust tests on both operating systems before bundling; Windows visual testing has not been performed.
