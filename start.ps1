# Enhanced Stream Sprites Server Startup Script (PowerShell)

param(
    [switch]$NoPrompt
)

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

# Check if Node.js is installed
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
    # Refresh PATH from registry to pick up newly installed Node.js
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
    
    Start-Sleep -Seconds 2
}

# Main server loop
while ($true) {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Starting Enhanced Stream Sprites Server" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    # Kill any existing node processes on port 3000
    Write-Host "Checking for existing server processes..." -ForegroundColor Yellow
    $connections = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
    if ($connections) {
        $connections | ForEach-Object {
            Write-Host "Killing process $($_.OwningProcess)" -ForegroundColor Yellow
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-Host "No processes found on port 3000" -ForegroundColor Gray
    }

    # Wait a moment for ports to release
    Start-Sleep -Seconds 2

    # Navigate to server directory from project root
    Set-Location $projectRoot
    Set-Location "server"

    # Check if node_modules exists, if not install dependencies
    if (-not (Test-Path "node_modules")) {
        Write-Host "Dependencies not found. Installing..." -ForegroundColor Yellow
        npm install
    }

    Write-Host "Starting server..." -ForegroundColor Green
    npm start

    # Server has stopped - either crashed or was stopped via admin command
    Write-Host "Server stopped." -ForegroundColor Yellow
    
    if ($NoPrompt) {
        # In no-prompt mode, restart immediately after 2 seconds
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
