$ErrorActionPreference = 'Stop'

$desktopDir = $PSScriptRoot
$appDir = Split-Path -Parent $desktopDir
$repoRoot = Split-Path -Parent $appDir
$project = Join-Path $desktopDir 'StreamSprites.Desktop.csproj'
$publishDir = Join-Path $desktopDir 'bin\publish'
$package = Get-Content -LiteralPath (Join-Path $appDir 'package.json') -Raw | ConvertFrom-Json
$version = [string]$package.version

if (Test-Path -LiteralPath $publishDir) {
    Remove-Item -LiteralPath $publishDir -Recurse -Force
}

dotnet publish $project -c Release -r win-x64 --self-contained false -o $publishDir `
    -p:Version=$version -p:FileVersion="$version.0" -p:AssemblyVersion="$version.0"
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed with exit code $LASTEXITCODE" }

$builtExe = Join-Path $publishDir 'Stream Sprites.exe'
if (-not (Test-Path -LiteralPath $builtExe)) {
    throw "Expected executable not found: $builtExe"
}

$targetExe = Join-Path $repoRoot 'Stream Sprites.exe'
Copy-Item -LiteralPath $builtExe -Destination $targetExe -Force

$cert = Get-ChildItem Cert:\CurrentUser\My -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Subject -eq 'CN=SuperFurias' -and
        $_.HasPrivateKey -and
        $_.EnhancedKeyUsageList.ObjectId.Value -contains '1.3.6.1.5.5.7.3.3'
    } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1

if ($cert) {
    $signTool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
        Sort-Object FullName -Descending |
        Select-Object -First 1

    if (-not $signTool) {
        throw 'Signing certificate found, but signtool.exe was not found in the Windows SDK.'
    }

    Write-Host "Signing with $($cert.Subject)..." -ForegroundColor Cyan
    & $signTool.FullName sign /sha1 $cert.Thumbprint /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com /v $targetExe
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'Timestamped signing failed; retrying without a timestamp.'
        & $signTool.FullName sign /sha1 $cert.Thumbprint /fd SHA256 /v $targetExe
    }
    if ($LASTEXITCODE -ne 0) {
        throw "signtool failed with exit code $LASTEXITCODE"
    }

    $signature = Get-AuthenticodeSignature -LiteralPath $targetExe
    Write-Host "Signature: $($signature.Status)" -ForegroundColor Green
} else {
    Write-Warning 'No SuperFurias code-signing certificate found; building an unsigned executable.'
}

$sizeMb = [math]::Round((Get-Item -LiteralPath $targetExe).Length / 1MB, 2)
Write-Host "Built $targetExe ($sizeMb MB)"
