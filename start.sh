#!/usr/bin/env bash
set -uo pipefail

# Enhanced Stream Sprites Server Startup Script (Bash)
# Equivalent to start.ps1 for Linux/macOS

NO_PROMPT=false
SKIP_DEPS=false
AUDIT_FIX=false

for arg in "$@"; do
    case "$arg" in
        --no-prompt) NO_PROMPT=true ;;
        --skip-deps) SKIP_DEPS=true ;;
        --audit-fix) AUDIT_FIX=true ;;
        --help|-h)
            echo "Usage: $0 [--no-prompt] [--skip-deps] [--audit-fix]"
            echo ""
            echo "  --no-prompt  Auto-restart without waiting for keypress"
            echo "  --skip-deps  Skip dependency installation"
            echo "  --audit-fix  Run npm audit fix after installing dependencies"
            exit 0
            ;;
        *)
            echo "Unknown argument: $arg"
            exit 1
            ;;
    esac
done

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$PROJECT_ROOT/server"
ENV_FILE="$SERVER_DIR/.env"

cd "$PROJECT_ROOT"

# ── Color helpers ──────────────────────────────────────────────────────────
log_cyan()   { echo -e "\033[36m$*\033[0m"; }
log_green()  { echo -e "\033[32m$*\033[0m"; }
log_yellow() { echo -e "\033[33m$*\033[0m"; }
log_red()    { echo -e "\033[31m$*\033[0m"; }

# ── Read server port from .env file ────────────────────────────────────────
SERVER_PORT=8080
if [[ -f "$ENV_FILE" ]]; then
    ENV_SERVER_PORT=""
    if grep -qE '^serverPort=' "$ENV_FILE"; then
        ENV_SERVER_PORT=$(grep -oP '^serverPort=\K.*' "$ENV_FILE" 2>/dev/null || true)
    fi
    if [[ -n "$ENV_SERVER_PORT" ]]; then
        SERVER_PORT="$ENV_SERVER_PORT"
        log_green "Using port $SERVER_PORT from .env file"
    else
        log_yellow "serverPort not found in .env, using default 8080"
    fi
else
    log_yellow ".env file not found, using default port 8080"
fi

# ── Check if Node.js is installed ──────────────────────────────────────────
log_cyan "Checking for Node.js installation..."
NODE_JUST_INSTALLED=false

if command -v node &>/dev/null; then
    NODE_VERSION=$(node --version 2>/dev/null || true)
    log_green "Node.js is installed: $NODE_VERSION"
else
    log_yellow "Node.js is not installed. Attempting to install..."

    if command -v apt-get &>/dev/null; then
        log_cyan "Installing Node.js using apt..."
        sudo apt-get update -qq
        sudo apt-get install -y -qq nodejs npm 2>/dev/null || {
            log_cyan "Trying NodeSource repository..."
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
            sudo apt-get install -y -qq nodejs
        }
        NODE_JUST_INSTALLED=true
    elif command -v dnf &>/dev/null; then
        log_cyan "Installing Node.js using dnf..."
        sudo dnf install -y nodejs
        NODE_JUST_INSTALLED=true
    elif command -v brew &>/dev/null; then
        log_cyan "Installing Node.js using Homebrew..."
        brew install node
        NODE_JUST_INSTALLED=true
    else
        log_red "Please install Node.js manually from https://nodejs.org/"
        if [[ "$NO_PROMPT" == true ]]; then
            exit 1
        fi
        echo "Press Enter to exit..."
        read -r
        exit 1
    fi

    log_cyan "Installation command completed. Continuing..."

    # Verify installation with retries
    MAX_RETRIES=3
    RETRY_COUNT=0
    INSTALLED=false
    while [[ $RETRY_COUNT -lt $MAX_RETRIES && "$INSTALLED" == false ]]; do
        if command -v node &>/dev/null; then
            NODE_VERSION=$(node --version 2>/dev/null || true)
            log_green "Node.js installed successfully: $NODE_VERSION"
            INSTALLED=true
            NODE_JUST_INSTALLED=true
        else
            RETRY_COUNT=$((RETRY_COUNT + 1))
            if [[ $RETRY_COUNT -lt $MAX_RETRIES ]]; then
                log_yellow "Node.js not yet available in PATH. Retrying in 2 seconds... ($RETRY_COUNT/$MAX_RETRIES)"
                sleep 2
            fi
        fi
    done

    if [[ "$INSTALLED" == false ]]; then
        log_yellow "Node.js installation verification failed. Continuing anyway to test..."
        NODE_JUST_INSTALLED=true
    fi
fi

# ── Dependency management function ─────────────────────────────────────────
install_dependencies() {
    cd "$SERVER_DIR"

    local package_json="$SERVER_DIR/package.json"
    local lock_file="$SERVER_DIR/package-lock.json"
    local node_modules="$SERVER_DIR/node_modules"

    local needs_install=false

    if [[ ! -d "$node_modules" ]]; then
        log_yellow "node_modules not found. Full install required."
        needs_install=true
    elif [[ -f "$lock_file" ]]; then
        if [[ "$package_json" -nt "$node_modules" ]]; then
            log_yellow "package.json changed since last install. Updating dependencies..."
            needs_install=true
        fi
    else
        log_yellow "No package-lock.json found. Doing fresh install..."
        needs_install=true
    fi

    if [[ "$needs_install" == false ]]; then
        log_green "Dependencies are up to date."
        return 0
    fi

    log_cyan "Installing dependencies..."
    if ! npm install; then
        log_red "npm install failed"
        log_yellow "Check server/package.json for invalid version ranges."
        return 1
    fi

    log_green "Dependencies installed successfully."

    if [[ "$AUDIT_FIX" == true ]]; then
        log_cyan "Running npm audit fix..."
        if npm audit fix --force; then
            log_green "Vulnerabilities patched."
        else
            log_yellow "Some vulnerabilities could not be auto-fixed."
        fi
    fi

    return 0
}

# ── Port conflict check with detailed info ─────────────────────────────────
check_port_conflict() {
    local port=$1
    local pids=()

    if command -v ss &>/dev/null; then
        while IFS= read -r pid; do
            if [[ -n "$pid" ]]; then
                pids+=("$pid")
            fi
        done < <(ss -tlnp "sport = :$port" 2>/dev/null | grep LISTEN | grep -oP 'pid=\K\d+' || true)
    elif command -v lsof &>/dev/null; then
        while IFS= read -r pid; do
            if [[ -n "$pid" ]]; then
                pids+=("$pid")
            fi
        done < <(lsof -t -i :"$port" -sTCP:LISTEN 2>/dev/null || true)
    fi

    # Deduplicate PIDs
    local unique_pids=()
    if [[ ${#pids[@]} -gt 0 ]]; then
        IFS=' ' read -ra unique_pids <<< "$(printf '%s\n' "${pids[@]}" | sort -u | tr '\n' ' ')"
    fi

    if [[ ${#unique_pids[@]} -eq 0 ]]; then
        log_green "Port $port is available."
        return 0
    fi

    local proc_info=""
    for pid in "${unique_pids[@]}"; do
        local name
        name=$(ps -p "$pid" -o comm= 2>/dev/null || echo "Unknown")
        proc_info+="$name (PID: $pid), "
    done
    proc_info=${proc_info%, }

    log_red "Port $port is already in use by: $proc_info"
    log_yellow "Attempting to free port..."

    for pid in "${unique_pids[@]}"; do
        if kill -9 "$pid" 2>/dev/null; then
            log_yellow " Killed PID $pid"
        else
            log_red " Failed to kill PID $pid"
        fi
    done

    # Wait for port to be released
    local waited=0
    while [[ $waited -lt 10 ]]; do
        local still_in_use=false
        if command -v ss &>/dev/null; then
            if ss -tlnp "sport = :$port" 2>/dev/null | grep -q LISTEN; then
                still_in_use=true
            fi
        elif command -v lsof &>/dev/null; then
            if lsof -t -i :"$port" -sTCP:LISTEN 2>/dev/null | grep -q .; then
                still_in_use=true
            fi
        fi

        if [[ "$still_in_use" == false ]]; then
            log_green "Port $port is now free."
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done

    log_red "Port $port could not be freed. Server will fail to start."
    return 1
}

# ── Read single keypress with timeout ──────────────────────────────────────
read_key_with_timeout() {
    local timeout_secs=$1
    if read -t "$timeout_secs" -n 1 -s 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# ── Main server loop ──────────────────────────────────────────────────────
DEPS_OK=false

while true; do
    log_cyan "========================================"
    log_cyan "Starting Enhanced Stream Sprites Server"
    log_cyan "========================================"

    # Check and free port
    if ! check_port_conflict "$SERVER_PORT"; then
        log_red "Cannot proceed — port $SERVER_PORT is still in use."
        if [[ "$NO_PROMPT" == true ]]; then
            sleep 5
            continue
        fi
        echo "Press Enter to exit..."
        read -r
        break
    fi

    # Wait a moment for ports to release
    sleep 1

    # Install dependencies if needed (only once per session unless package.json changes)
    if [[ "$DEPS_OK" == false && "$SKIP_DEPS" == false ]]; then
        if ! install_dependencies; then
            log_red "Dependency installation failed. Fix package.json and try again."
            if [[ "$NO_PROMPT" == true ]]; then
                sleep 5
                continue
            fi
            echo "Press Enter to exit..."
            read -r
            break
        fi
        DEPS_OK=true
    fi

    # Start server
    cd "$SERVER_DIR"
    log_green "Starting server on port $SERVER_PORT..."
    export PORT="$SERVER_PORT"
    npm start || true

    # Reset deps check on restart so we re-evaluate
    DEPS_OK=false

    if [[ "$NO_PROMPT" == true ]]; then
        log_cyan "Auto-restarting in 2 seconds..."
        sleep 2
        continue
    fi

    echo -e "\033[90mPress any key to exit... (auto-restarting in 5 seconds)\033[0m"

    if read_key_with_timeout 5; then
        log_cyan "Exiting..."
        break
    else
        log_cyan "Auto-restarting..."
        sleep 1
    fi
done
