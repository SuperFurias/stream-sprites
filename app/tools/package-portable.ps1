param(
    [string]$WebView2RuntimePath = '',
    [string]$NodeExePath = '',
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

$toolsDir = $PSScriptRoot
$appDir = Split-Path -Parent $toolsDir
$repoRoot = Split-Path -Parent $appDir
$desktopProject = Join-Path $appDir 'desktop\StreamSprites.Desktop.csproj'
$package = Get-Content -LiteralPath (Join-Path $appDir 'package.json') -Raw | ConvertFrom-Json
$version = [string]$package.version

if ([string]::IsNullOrWhiteSpace($WebView2RuntimePath)) {
    $runtimeCandidates = Get-ChildItem -LiteralPath (Join-Path $appDir 'Temp\webview2\extracted') -Directory -Filter 'Microsoft.WebView2.FixedVersionRuntime.*' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending
    if ($runtimeCandidates.Count -gt 0) {
        $WebView2RuntimePath = $runtimeCandidates[0].FullName
    }
}
if ([string]::IsNullOrWhiteSpace($WebView2RuntimePath) -or
    -not (Test-Path -LiteralPath (Join-Path $WebView2RuntimePath 'msedgewebview2.exe'))) {
    throw 'A fixed WebView2 runtime is required. Pass -WebView2RuntimePath or extract one under app\Temp\webview2\extracted.'
}

if ([string]::IsNullOrWhiteSpace($NodeExePath)) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand) { $NodeExePath = $nodeCommand.Source }
}
if ([string]::IsNullOrWhiteSpace($NodeExePath) -or -not (Test-Path -LiteralPath $NodeExePath)) {
    throw 'A Node.js executable is required to bundle. Pass -NodeExePath.'
}

$tempRoot = Join-Path $appDir 'Temp\portable'
$zipRoot = Join-Path $tempRoot 'zip'
$stage = Join-Path $zipRoot "Stream Sprites-$version"
$appStage = Join-Path $stage 'app'
$publishDir = Join-Path $tempRoot 'publish'
$zipPath = Join-Path $appDir "Temp\StreamSprites-$version-win64.zip"

if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage, $appStage | Out-Null

dotnet publish $desktopProject -c Release -r win-x64 --self-contained true -o $publishDir `
    -p:Version=$version -p:FileVersion="$version.0" -p:AssemblyVersion="$version.0" `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed with exit code $LASTEXITCODE" }

Copy-Item -LiteralPath (Join-Path $publishDir 'Stream Sprites.exe') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repoRoot 'CHANGELOG.md') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repoRoot 'LICENSE') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repoRoot 'NOTICE') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repoRoot 'README.md') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repoRoot 'docs') -Destination $stage -Recurse

foreach ($dir in @('accounts', 'assets', 'dashboard', 'overlay', 'server')) {
    Copy-Item -LiteralPath (Join-Path $appDir $dir) -Destination (Join-Path $appStage $dir) -Recurse
}
foreach ($file in @('favicon.ico', 'index.html', 'package.json', 'package-lock.json', 'server.js', 'start.ps1', 'start.sh')) {
    Copy-Item -LiteralPath (Join-Path $appDir $file) -Destination $appStage
}

foreach ($relative in @(
    'server\.env',
    'server\db',
    'server\profiles',
    'server\accounts.db',
    'server\accounts.db-shm',
    'server\accounts.db-wal',
    'server\active-profile.json',
    'server\storage.json',
    'server\storage.json.bak',
    'server\storage-config.json'
)) {
    $target = Join-Path $appStage $relative
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
}

if (-not $SkipInstall) {
    Push-Location $appStage
    try {
        npm ci --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
}

$prebuilds = Join-Path $appStage 'node_modules\better-sqlite3\prebuilds'
if (Test-Path -LiteralPath $prebuilds) {
    Get-ChildItem -LiteralPath $prebuilds -File |
        Where-Object { $_.Name -ne 'win32-x64.node' } |
        Remove-Item -Force
}

$nodeDir = Join-Path $stage 'node'
New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null
Copy-Item -LiteralPath $NodeExePath -Destination (Join-Path $nodeDir 'node.exe')
foreach ($dll in @('msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll', 'concrt140.dll')) {
    $source = Join-Path $WebView2RuntimePath $dll
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $nodeDir }
}
$nodeVersion = (& $NodeExePath --version).Trim()
$nodeLicenseUrl = "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE"
Invoke-WebRequest -Uri $nodeLicenseUrl -OutFile (Join-Path $nodeDir 'LICENSE.txt') -UseBasicParsing -TimeoutSec 120

Copy-Item -LiteralPath $WebView2RuntimePath -Destination (Join-Path $stage 'webview2') -Recurse

$running = @"
Stream Sprites $version

Requirements:
- Windows 10 or 11 (64-bit)

Everything needed to run is included:
- The native launcher is self-contained.
- The Node.js runtime is bundled in the node folder.
- The Microsoft Edge WebView2 runtime is bundled in the webview2 folder.

How to run:
1. Keep Stream Sprites.exe, the app folder, the node folder, and the webview2 folder together.
2. Run Stream Sprites.exe.
3. Continue as Guest, sign in, or create an account.

The app stores accounts, profiles, config, databases, skins, logs, and window state in:
%APPDATA%\Stream Sprites

Only one profile is active at a time. Log out to switch accounts.
The executable is unsigned, so Windows may show an Unknown publisher prompt.
"@
Set-Content -LiteralPath (Join-Path $stage 'RUNNING.txt') -Value $running -Encoding utf8

$forbidden = Get-ChildItem -LiteralPath $stage -Recurse -Force -File |
    Where-Object {
        $_.Name -eq '.env' -or
        $_.Name -like '.env.*' -or
        $_.Name -like '*.db' -or
        $_.Name -like '*.log' -or
        $_.Name -eq 'active-profile.json'
    }
if ($forbidden) {
    throw "Refusing to package sensitive or generated files: $($forbidden.FullName -join ', ')"
}

if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($zipRoot, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath
Write-Host "Built $zipPath"
Write-Host "Size: $((Get-Item -LiteralPath $zipPath).Length) bytes"
Write-Host "SHA256: $($hash.Hash)"
