# Enhanced Stream Sprites Server Startup Script (PowerShell)

param(
    [switch]$NoPrompt,
    [switch]$SkipDeps,
    [switch]$AuditFix
)

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

# ── Read server port from .env file ────────────────────────────────────────
$envFile = Join-Path $projectRoot "server\.env"
$serverPort = 8080  # default fallback
if (Test-Path $envFile) {
    try {
        $envContent = Get-Content $envFile -Raw | ConvertFrom-Json
        if ($envContent.serverPort) {
            $serverPort = $envContent.serverPort
            Write-Host "Using port $serverPort from .env file" -ForegroundColor Green
        } else {
            Write-Host "serverPort not found in .env, using default 8080" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Failed to parse .env file, using default port 8080" -ForegroundColor Yellow
    }
} else {
    Write-Host ".env file not found, using default port 8080" -ForegroundColor Yellow
}

# ── Check if Node.js is installed ──────────────────────────────────────────
Write-Host "Checking for Node.js installation..." -ForegroundColor Cyan
$nodeJustInstalled = $false
try {
    $nodeVersion = node --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Node.js not found"
    }
    Write-Host "Node.js is installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Node.js is not installed. Attempting to install..." -ForegroundColor Yellow
    
    # Try winget first (Windows 11 default)
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "Installing Node.js using winget..." -ForegroundColor Cyan
        try {
            $process = Start-Process -FilePath "winget" -ArgumentList "install OpenJS.NodeJS -e --accept-source-agreements --accept-package-agreements" -Wait -PassThru -NoNewWindow
            if ($process.ExitCode -ne 0) {
                Write-Host "Winget installation returned exit code $($process.ExitCode)" -ForegroundColor Red
            }
        } catch {
            Write-Host "Winget installation failed: $_" -ForegroundColor Red
        }
    }
    # Try Chocolatey
    elseif (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-Host "Installing Node.js using Chocolatey..." -ForegroundColor Cyan
        try {
            $process = Start-Process -FilePath "powershell" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command choco install nodejs -y" -Wait -PassThru -NoNewWindow
            if ($process.ExitCode -ne 0) {
                Write-Host "Chocolatey installation returned exit code $($process.ExitCode)" -ForegroundColor Red
            }
        } catch {
            Write-Host "Chocolatey installation failed: $_" -ForegroundColor Red
        }
    }
    # Manual download fallback
    else {
        Write-Host "Please install Node.js manually from https://nodejs.org/" -ForegroundColor Red
        Write-Host "Press any key to exit..." -ForegroundColor Gray
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        exit 1
    }
    
    Write-Host "Installation command completed. Continuing..." -ForegroundColor Cyan
    
    # Refresh PATH from registry to pick up newly installed Node.js
    Write-Host "Refreshing PATH..." -ForegroundColor Cyan
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
    
    # Verify installation with retries (PATH may need time to update)
    $maxRetries = 3
    $retryCount = 0
    $installed = $false
    while ($retryCount -lt $maxRetries -and -not $installed) {
        try {
            $nodeVersion = node --version
            Write-Host "Node.js installed successfully: $nodeVersion" -ForegroundColor Green
            $installed = $true
            $nodeJustInstalled = $true
        } catch {
            $retryCount++
            if ($retryCount -lt $maxRetries) {
                Write-Host "Node.js not yet available in PATH. Retrying in 2 seconds... ($retryCount/$maxRetries)" -ForegroundColor Yellow
                Start-Sleep -Seconds 2
            }
        }
    }
    if (-not $installed) {
        Write-Host "Node.js installation verification failed. Continuing anyway to test..." -ForegroundColor Yellow
        $nodeJustInstalled = $true
    }
}

# If Node.js was just installed, refresh PATH to pick up the new installation
if ($nodeJustInstalled) {
    Write-Host "Refreshing PATH to load Node.js..." -ForegroundColor Cyan
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
    
    Start-Sleep -Seconds 2
}

# ── Dependency management function ─────────────────────────────────────────
function Install-Dependencies {
    Set-Location $projectRoot
    
    $packageJson = Join-Path $projectRoot "package.json"
    $lockFile = Join-Path $projectRoot "package-lock.json"
    $nodeModules = Join-Path $projectRoot "node_modules"
    
    $needsInstall = $false
    
    if (-not (Test-Path $nodeModules)) {
        Write-Host "node_modules not found. Full install required." -ForegroundColor Yellow
        $needsInstall = $true
    }
    elseif (Test-Path $lockFile) {
        # Use npm's install stamp so dependency changes are detected reliably.
        $installStamp = Join-Path $nodeModules ".package-lock.json"
        $packageTime = (Get-Item $packageJson).LastWriteTime
        $modulesTime = if (Test-Path $installStamp) {
            (Get-Item $installStamp).LastWriteTime
        } else {
            (Get-Item $nodeModules).LastWriteTime
        }
        if ($packageTime -gt $modulesTime) {
            Write-Host "package.json changed since last install. Updating dependencies..." -ForegroundColor Yellow
            $needsInstall = $true
        }
    }
    else {
        # No lock file — do a fresh install
        Write-Host "No package-lock.json found. Doing fresh install..." -ForegroundColor Yellow
        $needsInstall = $true
    }
    
    if (-not $needsInstall) {
        Write-Host "Dependencies are up to date." -ForegroundColor Green
        return $true
    }
    
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    $npmProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm install" -Wait -PassThru -NoNewWindow
    
    if ($npmProcess.ExitCode -ne 0) {
        Write-Host "npm install failed with exit code $($npmProcess.ExitCode)" -ForegroundColor Red
        Write-Host "Check server/package.json for invalid version ranges." -ForegroundColor Yellow
        return $false
    }
    
    Write-Host "Dependencies installed successfully." -ForegroundColor Green
    
    # Optional: run audit fix
    if ($AuditFix) {
        Write-Host "Running npm audit fix..." -ForegroundColor Cyan
        $auditProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm audit fix" -Wait -PassThru -NoNewWindow
        if ($auditProcess.ExitCode -eq 0) {
            Write-Host "Vulnerabilities patched." -ForegroundColor Green
        } else {
            Write-Host "Some vulnerabilities could not be auto-fixed." -ForegroundColor Yellow
        }
    }
    
    return $true
}

# ── Port conflict check with detailed info ─────────────────────────────────
function Test-PortConflict {
    param([int]$Port)
    
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
    
    if ($connections) {
        $conflictingProcesses = @()
        foreach ($conn in $connections) {
            try {
                $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
                if ($proc) {
                    $conflictingProcesses += "$($proc.ProcessName) (PID: $($conn.OwningProcess))"
                } else {
                    $conflictingProcesses += "Unknown (PID: $($conn.OwningProcess))"
                }
            } catch {
                $conflictingProcesses += "Unknown (PID: $($conn.OwningProcess))"
            }
        }
        
        Write-Host "Port $Port is already in use by: $($conflictingProcesses -join ', ')" -ForegroundColor Red
        Write-Host "Attempting to free port..." -ForegroundColor Yellow
        
        $connections | ForEach-Object {
            try {
                Stop-Process -Id $_.OwningProcess -Force -ErrorAction Stop
                Write-Host "  Killed PID $($_.OwningProcess)" -ForegroundColor Yellow
            } catch {
                Write-Host "  Failed to kill PID $($_.OwningProcess): $_" -ForegroundColor Red
            }
        }
        
        # Wait for port to be released
        $waited = 0
        while ($waited -lt 10) {
            $stillInUse = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
            if (-not $stillInUse) {
                Write-Host "Port $Port is now free." -ForegroundColor Green
                return $true
            }
            Start-Sleep -Seconds 1
            $waited++
        }
        
        Write-Host "Port $Port could not be freed. Server will fail to start." -ForegroundColor Red
        return $false
    }
    
    Write-Host "Port $Port is available." -ForegroundColor Green
    return $true
}

# ── Main server loop ──────────────────────────────────────────────────────
$depsOk = $false
while ($true) {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Starting Enhanced Stream Sprites Server" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    # Check and free port
    $portOk = Test-PortConflict -Port $serverPort
    if (-not $portOk) {
        Write-Host "Cannot proceed — port $serverPort is still in use." -ForegroundColor Red
        if ($NoPrompt) {
            Start-Sleep -Seconds 5
            continue
        }
        Write-Host "Press any key to exit..." -ForegroundColor Gray
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        break
    }

    # Wait a moment for ports to release
    Start-Sleep -Seconds 1

    # Install dependencies if needed (only once per session unless package.json changes)
    if (-not $depsOk -and -not $SkipDeps) {
        $depsOk = Install-Dependencies
        if (-not $depsOk) {
            Write-Host "Dependency installation failed. Fix package.json and try again." -ForegroundColor Red
            if ($NoPrompt) {
                Start-Sleep -Seconds 5
                continue
            }
            Write-Host "Press any key to exit..." -ForegroundColor Gray
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            break
        }
    }

    # Start server
    Set-Location $projectRoot
    Write-Host "Starting server on port $serverPort..." -ForegroundColor Green
    node server/server.js
    
    # Reset deps check on restart so we re-evaluate
    $depsOk = $false
    
    if ($NoPrompt) {
        Write-Host "Auto-restarting in 2 seconds..." -ForegroundColor Cyan
        Start-Sleep -Seconds 2
        continue
    }
    
    Write-Host "Press any key to exit... (auto-restarting in 5 seconds)" -ForegroundColor Gray
    
    # Clear any buffered input
    try {
        while ([Console]::KeyAvailable) {
            $null = [Console]::ReadKey($true)
        }
    } catch { }
    
    # Wait up to 5 seconds for a key press
    $keyPressed = $false
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    while ($stopwatch.Elapsed.TotalSeconds -lt 5) {
        try {
            if ([Console]::KeyAvailable) {
                $null = [Console]::ReadKey($true)
                $keyPressed = $true
                break
            }
        } catch {
            # Ignore errors
        }
        Start-Sleep -Milliseconds 100
    }
    $stopwatch.Stop()
    
    if ($keyPressed) {
        Write-Host "Exiting..." -ForegroundColor Cyan
        break
    } else {
        Write-Host "Auto-restarting..." -ForegroundColor Cyan
        Start-Sleep -Seconds 1
    }
}
