$ErrorActionPreference = 'Stop'
$runtimeRoots = @(
  "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application",
  "$env:ProgramFiles\Microsoft\EdgeWebView\Application",
  "$env:LOCALAPPDATA\Microsoft\EdgeWebView\Application"
)
function Find-WebView2 {
  foreach ($root in $runtimeRoots) {
    foreach ($version in @(Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue)) {
      $binary = Join-Path $version.FullName 'msedgewebview2.exe'
      if (Test-Path -LiteralPath $binary) { return $binary }
    }
  }
  return $null
}
$runtime = Find-WebView2
if (!$runtime) {
  # Install the official Evergreen runtime before launching the raw built EXE.
  # Installer bootstrap support is exercised only when an end user installs it.
  $installer = Join-Path $env:RUNNER_TEMP 'MicrosoftEdgeWebview2Setup.exe'
  Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $installer
  $install = Start-Process -FilePath $installer -ArgumentList '/silent', '/install' -Wait -PassThru
  if ($install.ExitCode -notin @(0, 1638, 3010)) { throw "WebView2 installation failed: $($install.ExitCode)" }
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $runtime = Find-WebView2
    if ($runtime) { break }
    Start-Sleep -Seconds 1
  }
}
if (!$runtime) { throw 'Official WebView2 runtime is unavailable after installation' }
Write-Host "WebView2 runtime: $runtime"
Write-Host "Version: $((Get-Item -LiteralPath $runtime).VersionInfo.ProductVersion)"
