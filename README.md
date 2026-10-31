# Stream Sprites

Copyright 2026 SuperFurias | [Apache License 2.0](LICENSE)

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://github.com/SuperFurias/stream-sprites/actions/workflows/ci.yml/badge.svg)](https://github.com/SuperFurias/stream-sprites/actions/workflows/ci.yml)

Stream Sprites is a powerful, feature-rich Twitch overlay application that transforms chat participation into an interactive visual experience. Each viewer receives a personalized sprite with realistic physics, creating a living, breathing community representation on your stream.

![Stream Sprites Demo](assets/skins/default.gif)

---

## ✨ Features

### Core Functionality
- **Real-time Twitch Integration** – Live chat-to-sprite conversion with WebSocket communication
- **Server-Authoritative State** – Centralized sprite management prevents duplicates and ensures consistency
- **Advanced Physics Engine** – Gravity, collisions, friction, bouncing, and spatial awareness
- **Dynamic Skin System** – Automatic detection from `assets/skins/` with support for PNG, JPG, GIF, WebP, and WebM
- **User Skin Assignments** – Persistent per-user skin preferences stored in SQLite or PostgreSQL
- **Admin Dashboard** – Full-featured web interface for configuration and management

### Interactive Commands
Users can control their sprites via Twitch chat:
- `!jump` – Make your sprite jump
- `!sit` / `!unsit` – Sit down or stand up (height scaling)
- `!boom` – Trigger an explosion affecting all sprites
- `!skin <skinId>` – Change your assigned skin
- `!skins` – List all available skins
- `!spawn [quantity] [skin] [username]` – Broadcaster/mod spawn (additive)

### Physics & Behavior
- **Collision System** – Probabilistic collisions with spatial hash optimization
- **Size-Based Social Dynamics** – Similar-sized sprites repel; different sizes attract
- **Zone Distribution** – Automatic balancing to prevent overcrowding
- **Roaming Behavior** – Idle sprites explore underpopulated areas
- **Drag-and-Drop** – Direct manipulation of sprites in the overlay
- **Explosion Particles** – Visual feedback with configurable particle physics

### Configuration & Customization
- **70+ Tunable Parameters** – Fine-tune physics, visuals, spawning, and behavior
- **Dynamic Updates** – Changes apply without server restart
- **Debug Logging** – Console and file-based logging with granular control
- **OAuth Management** – Automatic token generation with refresh token persistence
- **User Exclusion System** – Ban users with custom reason tracking
- **Skin Assignment Manager** – Bulk user skin management with pagination

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 22+** – [Download from nodejs.org](https://nodejs.org/)
- **Twitch Account** – For bot credentials and OAuth

### Installation (Windows – Recommended)

1. **Clone or download** this repository to your local machine

2. **Run the startup script** (PowerShell):
   ```powershell
   cd "Stream Sprites"
   .\start.ps1
   ```

   The script will:
   - Check for Node.js and offer to install if missing (via winget or Chocolatey)
   - Install server dependencies (`npm install`)
   - Start the server on port 8080 (or configured port)
   - Optionally open the dashboard in your default browser

### Manual Setup (All Platforms)

```bash
# From the project root
npm install

# Start the server
npm start
```

Run tests with `npm test`. Run `npm run soak` for a 10-second live-server load test that spawns 300+ sprites, drives every command, and verifies snapshots keep flowing. For isolated development or alternate deployments, these environment variables override default paths:

| Variable | Purpose |
|----------|---------|
| `STREAM_SPRITES_CONFIG` | Alternate config file (JSON) |
| `STREAM_SPRITES_DATA_DIR` | Alternate SQLite/database data directory |
| `STREAM_SPRITES_ASSETS_DIR` | Alternate skin/media directory |
| `STREAM_SPRITES_STORAGE_CONFIG` | Alternate storage backend file |
| `STREAM_SPRITES_SUPERVISED` | Set to `1` when an external supervisor handles restarts (PM2 and systemd are detected automatically) |
| `STREAM_SPRITES_NO_COMPRESSION` | Set to `1` to disable WebSocket snapshot compression if CPU-bound |

The HTTP integration test uses all four so it never touches live data.

The server will:
- Create `server/.env` with default configuration on first run
- Initialize the active storage backend (SQLite at `server/db/sa.db`, or PostgreSQL)
- Start listening on `http://localhost:8080`

---

## ⚙️ Configuration

### Initial Setup

1. **Open the dashboard**: Navigate to `http://localhost:8080` in your browser

2. **Configure Twitch credentials** (Config tab):
   - **Client ID** – From your Twitch Developer Application
   - **Client Secret** – From your Twitch Developer Application
   - **Bot Username** – The Twitch account that will connect to chat
   - **Channel** – Your Twitch channel name

3. **Generate OAuth Token**:
   - Click "Generate OAuth Token"
   - Authorize the application in the Twitch popup
   - The refresh token is saved automatically for future auto-connection

4. **Connect to Twitch**:
   - Click "Connect to Twitch"
   - Verify connection status shows success
   - (Optional) Enable **Auto-Generate OAuth** and **Auto-Connect** toggles to skip manual steps on future server starts

5. **Add Overlay to OBS**:
   - Open OBS Studio
   - Add a **Browser Source** to your scene
   - URL: `http://localhost:8080/overlay/overlay.html`
   - Width: `1920`, Height: `1080` (or match your canvas settings)
   - Check "Control audio via OBS" if you want audio control (optional)
   - Click "OK"

### Overlay Settings

Access the **Settings** tab in the dashboard to customize:

#### Canvas & Display
- Canvas dimensions (width/height)
- Ground Y position
- Sprite size range (min/max)

#### Physics Parameters
- Gravity, air resistance, ground friction
- Bounce damping, minimum velocity
- Mass and inertia calculations

#### Collision & Behavior
- Personal space threshold
- Collision force multiplier
- Size-based attraction/repulsion
- Zone distribution settings
- Spatial hash cell size

#### Explosion Effects
- Force multiplier, radius (base + variance)
- Upward bias, spin strength
- Timing jitter

#### Roaming & Idle
- Walk force, steering behavior
- Random movement chance
- Duration ranges

#### Visual Effects
- Text padding, wiggle range
- Particle count, speed, gravity, decay
- Hue ranges for explosion particles

#### Performance
- Maximum sprites (default: 1500)
- Sprite lifetime (default: 30 minutes)
- Spawn throttle (default: 700ms)
- Cleanup thresholds

### Debug & Logging

Enable in Settings tab:
- **Server Debug** – Verbose server-side logging
- **Twitch Debug** – Chat message logging
- **Auth Error Logging** – Authentication failures
- **Other Error Logging** – Non-auth Twitch errors
- **Verbose Messages** – Detailed message processing
- **Log to File** – Write logs to `logs/debug.log`

---

## 📖 User Guide

### Chat Commands

| Command | Description | Permissions |
|---------|-------------|-------------|
| `!jump` | Makes your sprite jump with upward velocity | All viewers |
| `!sit` | Reduces sprite height to 75%, stops movement | All viewers |
| `!unsit` | Restores full height and resumes movement | All viewers |
| `!boom` | Triggers explosion affecting all sprites | All viewers |
| `!skin <id>` | Changes your sprite's skin (must be available) | All viewers |
| `!skins` | Lists all available skin IDs | All viewers |
| `!spawn [qty] [skin] [user]` | Spawns sprites (additive). Arguments can be in any order. | Broadcaster/Mods |

**Examples:**
- `!spawn` – Spawns 1 random sprite
- `!spawn Yae_Kibo` – Spawns 1 default skin sprite named Yae_Kibo
- `!spawn 5` – Spawns 5 default skin sprites
- `!spawn 3 custom_skin` – Spawns 3 with specified skin
- `!spawn 2 custom_skin username` – Spawns 2 as another user
- `!spawn custom_skin 5 username` – Arguments in any order work

### Skin Management

1. **Add Skins**: Place image files (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.webm`) in `assets/skins/`
2. **Auto-Detection**: Skins are automatically detected on server startup and dashboard load
3. **Preview**: Visit the Skins tab in the dashboard to see all available skins
4. **Assign**: Use the Users tab to assign specific skins to users
5. **Default**: Users without assignments get the "default" skin

**Note**: GIF and WebM files are animated in the overlay. WebM videos use `<video>` elements for smooth playback.

### User Management

#### Assigning Skins
1. Go to **Users** tab
2. Enter username in "Assign Skin to User"
3. Select skin from dropdown
4. Click "Assign"

#### Editing Assignments
- Click "Edit" next to any user in the table
- Select new skin from modal dropdown
- Click "Save"

#### Removing Assignments
- Click "Remove" next to a user to reset to default

#### Excluding Users
1. Go to **Exclusions** tab (or Users tab → Excluded section)
2. Enter username and optional reason
3. Click "Exclude"
4. Excluded users cannot spawn sprites

**Edit/View Reasons**: Click the reason text in the table to view full reason or edit.

---

## 🔧 Administration

### Dashboard Tabs

| Tab | Purpose |
|-----|---------|
| **Config** | Twitch credentials, OAuth, connection management |
| **Settings** | Overlay physics, visuals, performance tuning |
| **Users** | View all users, assign/edit skins, manage exclusions |
| **Assets** | Upload, preview, and delete skins and media |
| **Storage** | Switch between SQLite and PostgreSQL-compatible databases |
| **Help** | Command reference and troubleshooting |

### Control API Endpoints

Local requests are trusted. Remote requests require the dashboard password, and all mutating requests are same-origin only. Endpoints live under `/api/local/*` and `/api/dashboard/*`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/local/saveConfig` | POST | Save configuration to the active store (`.env` or PostgreSQL) |
| `/api/local/connectTwitch` | POST | Initiate Twitch connection |
| `/api/local/disconnectTwitch` | POST | Disconnect Twitch |
| `/api/local/users` | GET | List all users with assignments |
| `/api/local/assignSkin` | POST | `{userId, skinId}` – Assign skin |
| `/api/local/resetUser` | POST | `{id}` – Remove user assignment |
| `/api/local/resetAll` | POST | Delete all user assignments |
| `/api/local/excluded` | GET | List excluded users |
| `/api/local/exclude` | POST | `{userId, reason}` – Exclude user |
| `/api/local/unexclude` | POST | `{userId}` – Remove from exclusion |
| `/api/local/updateExclusionReason` | POST | `{userId, reason}` – Edit reason |

### Server Controls

From the dashboard or via API:
- **Clear All Sprites** – Removes all sprites from overlay
- **Refresh All Overlays** – Forces all connected overlays to reload
- **Restart Server** – Gracefully restarts the Node.js process

---

## 🏗️ Architecture

### Technology Stack

**Server:**
- Node.js + Express.js
- WebSocket (ws) for real-time communication
- better-sqlite3 for persistent storage
- tmi.js for Twitch chat integration
- axios for HTTP requests

**Client (Overlay):**
- Vanilla JavaScript (ES6 modules)
- HTML5 Canvas for rendering
- WebSocket client with TMI.js fallback
- CSS3 for UI overlay

**Dashboard:**
- Plain HTML/CSS/JavaScript
- RESTful API consumption
- Responsive design

### Data Flow

```
Twitch Chat → TMI.js → Server → WebSocket → Overlay Client
                                     ↓
                              SQLite / PostgreSQL
                                     ↓
                              Dashboard (REST API)
```

1. **Chat messages** arrive via TMI.js
2. **Server** processes commands and simulates physics authoritatively at 60 Hz
3. **WebSocket** broadcasts compressed interpolated snapshots at a configurable rate (default 30 Hz)
4. **Overlay clients** interpolate and render sprites; they never own physics state
5. **Dashboard** reads/writes configuration and user data via REST

### Sprite Lifecycle

1. **Spawn** – User types in chat or broadcaster/mod uses `!spawn`
2. **Validation** – Server checks throttle, max sprites, exclusions
3. **Creation** – Server creates the sprite using the assigned skin from the active database
4. **Physics** – Simulated server-side every frame (gravity, collisions, roaming)
5. **Lifetime** – Auto-removed after configurable timeout (default 30 min)
6. **Sync** – Server-authoritative; clients reconcile state on connect and after network loss

---

## 🛠️ Development

### Project Structure

```
Stream Sprites/
├── index.html                  # Dashboard shell (authenticated route)
├── server.js                   # Node entry point
├── package.json                # Scripts and dependencies
├── test/                       # node:test unit + HTTP integration tests
├── tools/soak.js               # Live-server load/soak test
├── server/
│   ├── server.js               # Express + WebSocket bootstrap
│   ├── routes.js               # REST, auth, assets, OAuth, storage
│   ├── websocket.js            # Authoritative simulation + snapshots
│   ├── physics.js              # Physics engine (live-configurable)
│   ├── twitch.js               # TMI connection and chat commands
│   ├── db.js                   # Database facade
│   ├── restart-helper.js       # Detached self-restart helper
│   ├── config.js               # Defaults and config loading
│   ├── .env                    # Runtime config (created automatically)
│   ├── storage-config.json     # Selected backend (created after switching)
│   ├── db/sa.db                # Local SQLite database
│   ├── lib/
│   │   ├── util.js             # Validation, merge, rate limiting
│   │   ├── logger.js           # Filtered/file logging with rotation
│   │   ├── asset-paths.js      # Traversal-safe asset paths
│   │   ├── config-safety.js    # Config whitelist and token handling
│   │   └── password.js         # scrypt hash/verify helpers
│   └── storage/
│       ├── index.js            # Driver selection/switching
│       ├── sqlite-driver.js
│       └── postgres-driver.js
├── overlay/
│   ├── overlay.html            # OBS browser source entry
│   ├── overlay.css
│   ├── overlay_client.js       # Overlay entry point
│   └── js/
│       ├── config.js           # Constants derived from /env
│       ├── canvas.js
│       ├── core.js             # Game loop and skin cache
│       ├── sprite.js
│       ├── renderer.js         # Canvas drawing
│       ├── animatedMediaRenderer.js  # GIF/WebM layer
│       ├── explosion.js        # Particles
│       ├── connection.js       # WebSocket connection/reconnect
│       ├── input.js            # Drag/toss interaction
│       ├── skins.js
│       └── utils.js
├── dashboard/                  # Admin tabs and shared JS
├── assets/
│   └── skins/                  # Skin media
├── logs/debug.log              # Optional rotated file logging
├── README.md
├── CHANGELOG.md
├── LICENSE
└── NOTICE
```

### Key Modules

**Server (`server/server.js`, `server/routes.js`)**
- Auth, same-origin protection, and dashboard sessions
- Traversal-safe asset upload/list/delete/serve
- OAuth and token-refresh handling
- Database operations (users, exclusions, skins, assets)
- Storage backend switching with rollback

**Simulation (`server/websocket.js`, `server/physics.js`)**
- 60 Hz authoritative server simulation
- Configurable snapshot rate (default 30 Hz)
- Spatial hash grid for collision optimization
- Sprite physics integration (velocity, gravity, friction)
- Collision, avoidance, zone density, and roaming behavior
- Fight resolution, drag authority, and lifetime management

**Overlay Client (`overlay/overlay_client.js`)**
- Module loader and initializer
- Config fetch and constant derivation
- Canvas setup and resize handling
- Game loop (requestAnimationFrame)
- WebSocket connection with reconnection
- Snapshot interpolation and sprite state synchronization

**Renderer (`overlay/js/renderer.js`)**
- Canvas clearing and sorting (by Y depth)
- Sprite drawing with rotation and flip
- Shadow rendering
- Username text with shadow
- State emojis (dance)
- Explosion particle rendering

---

## 🔒 Security Notes

- **Remote access requires a dashboard password.** Loopback requests are trusted after validating the peer address, Host header, proxy headers, and origin. Set a password from the local machine before exposing the server through a tunnel.
- **Same-origin protection**: mutating API calls and dashboard data reject cross-origin requests. Only public read-only overlay endpoints (`/env`, skins, viewer skins, and media) are CORS-readable without credentials.
- **OAuth tokens**: access tokens are kept in memory only and are never written to `.env` or the database. Refresh tokens may be persisted so the bot can reconnect. Enabling **Auto-Generate OAuth** with **Auto-Connect** uses them at startup.
- **Static files**: only `index.html`, `favicon.ico`, `dashboard/`, `overlay/`, and `assets/` are served. Server config, databases, logs, and source files are not reachable over HTTP.
- **Uploads**: filenames and folders are sanitized and resolved inside `assets/`; path traversal is rejected.
- **Secrets file**: `server/.env` and storage connection settings are gitignored. Never commit credentials.
- **Input validation**: server-side validation applies to usernames, skin IDs, settings, drag coordinates, and API payloads.

If exposing the server beyond localhost, use HTTPS (the built-in Cloudflare quick tunnel is supported) and set a strong dashboard password first.

---

## 🐛 Troubleshooting

### Server won't start
- Ensure Node.js 22+ is installed: `node --version`
- Run `npm install` after upgrading Node so native modules (`better-sqlite3`) match the runtime
- Check port 8080 (or configured) is not in use
- Verify `server/.env` exists and is valid JSON
- Check logs in `logs/debug.log` if enabled

### Overlay not showing in OBS
- Verify server is running and dashboard accessible
- Check OBS browser source URL is correct
- Ensure "Control audio via OBS" is unchecked unless needed
- Try setting width/height to 1920x1080
- Check browser console (Ctrl+Shift+I in OBS source properties)

### No sprites appearing
- Confirm Twitch connection in dashboard (Config tab)
- Check bot is in your channel
- Verify chat commands are being sent (use `!skins` to test)
- Enable debug logging to see message processing

### Skins not detected
- Place image files in `assets/skins/` or upload them from the **Assets** tab
- Supported formats: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.webm`, `.avif`
- Refresh the Assets tab or restart the server
- Check server console for detection logs

### WebSocket connection failed
- Ensure `useServer: true` in config
- Check firewall allows port 8080
- Verify no proxy interfering
- The overlay retries the WebSocket connection automatically

### High CPU usage
- Reduce `maxSprites` in Settings
- Lower **Network Snapshot Rate** (30 Hz default; 15-20 Hz is fine on slower machines)
- Increase `spawnThrottleMs`
- Disable file logging (`logToFile: false`)
- Reduce canvas size if running at high resolution

---

## 📚 Documentation

For in-depth documentation, see the **Help** tab in the dashboard after starting the server.

### Additional Resources
- **Changelog**: [CHANGELOG.md](CHANGELOG.md) – Version history and release notes
- **License**: [LICENSE](LICENSE) – Apache License 2.0
- **Notices**: [NOTICE](NOTICE) – Third-party attributions

---

## 🤝 Contributing

This project is maintained by SuperFurias. For bug reports, feature requests, or contributions, please open an issue on the repository.

---

## 📄 License

Copyright 2026 SuperFurias

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at:

[http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

See [LICENSE](LICENSE) and [NOTICE](NOTICE) for details.

---

## Versioning

The current release line is **2.5.x**. See [CHANGELOG.md](CHANGELOG.md) for the full history. Revert points are tagged and pushed as the project is improved.
