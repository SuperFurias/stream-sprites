# Stream Sprites

**Version 1.0.1** | Copyright 2026 SuperFurias | Apache License 2.0

Stream Sprites is an interactive overlay application that brings your Twitch chat to life with animated sprites. Each viewer gets their own sprite that appears on your overlay, creating a dynamic and engaging experience for your stream.

![Stream Sprites Demo](assets/skins/default.png)

---

## Quick Start

### Windows (Recommended)

```powershell
.\start.ps1
```

The script automatically:
- Checks/installs Node.js 18+ (via winget, Chocolatey, or prompts manual download)
- Installs npm dependencies on first run
- Starts the server with auto-restart on crashes
- Opens the dashboard in your browser
- Handles port conflicts (kills existing processes on port 3000)

### Manual Setup (Any Platform)

1. Ensure Node.js 18+ is installed: `node --version`
2. Install dependencies:
   ```bash
   cd server
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000` in your browser

---

## First-Time Configuration

1. Open the dashboard at `http://localhost:3000`
2. Go to the **Config** tab
3. Enter your Twitch credentials:
   - **Client ID** and **Client Secret** (from your Twitch developer application)
   - **Bot Username** (the Twitch account that will connect to chat)
   - **Channel** (your Twitch channel name)
4. Click **Save Config**
5. Click **Generate OAuth Token** to authenticate the bot
6. Click **Connect to Twitch** to start the bot

The `.env` file is created automatically in the `server/` directory.

---

## Configuration

Configuration is stored in `server/.env` (JSON format):

```json
{
  "useServer": true,
  "serverPort": 3000,
  "autoOpenBrowser": true,
  "twitch": {
    "clientId": "",
    "clientSecret": "",
    "botOAuthToken": "",
    "redirectUri": "http://localhost:3000/auth/callback"
  },
  "channel": "",
  "botUsername": "",
  "persistOAuthToken": false,
  "debug": {
    "serverDebug": false,
    "twitchDebug": false,
    "twitchAuthErrors": false,
    "twitchOtherErrors": false,
    "verboseMessages": false,
    "logToFile": false
  },
  "overlay": {
    "canvasWidth": 1920,
    "canvasHeight": 1080,
    "groundY": 920,
    "gravity": 0.6,
    "airResistance": 0.992,
    "groundFriction": 0.92,
    "bounceDamping": 0.65,
    "minVelocity": 0.15,
    "maxAvatars": 1500,
    "maxSpawnQuantity": 100,
    "spawnThrottleMs": 700,
    "spriteSizeMin": 30,
    "spriteSizeMax": 80,
    "collisionPersonalSpaceThreshold": 0.1,
    "collisionForceMultiplier": 0.02,
    "explosionForceMultiplier": 60,
    "explosionRadiusBase": 400,
    "explosionRadiusVar": 300,
    "explosionUpwardBias": 0.7,
    "spinStrengthFactor": 0.05,
    "randomJitterFactor": 0.2,
    "particleCountBase": 30,
    "particleCountVar": 20,
    "particleSpeedBase": 2,
    "particleSpeedVar": 4,
    "particleGravity": 0.1,
    "particleDecayBase": 0.01,
    "particleDecayVar": 0.02,
    "particleSizeBase": 3,
    "particleSizeVar": 5,
    "particleHueBase": 10,
    "particleHueRange": 60
  }
}
```

### Core Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useServer` | boolean | `true` | Enable/disable Twitch bot connection |
| `serverPort` | number | `3000` | Port for the web server |
| `autoOpenBrowser` | boolean | `true` | Auto-open dashboard on server start |
| `persistOAuthToken` | boolean | `false` | Save OAuth token to disk (false = memory only) |
| `twitch.clientId` | string | `""` | Twitch application client ID |
| `twitch.clientSecret` | string | `""` | Twitch application client secret |
| `twitch.botOAuthToken` | string | `""` | Bot OAuth token (generated via UI) |
| `channel` | string | `""` | Your Twitch channel name |
| `botUsername` | string | `""` | Bot's Twitch username |

### Debug Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `debug.serverDebug` | boolean | `false` | Enable server-side debug logging |
| `debug.twitchDebug` | boolean | `false` | Enable Twitch client debug logging |
| `debug.twitchAuthErrors` | boolean | `false` | Log authentication errors |
| `debug.twitchOtherErrors` | boolean | `false` | Log other Twitch errors |
| `debug.verboseMessages` | boolean | `false` | Log all chat messages |
| `debug.logToFile` | boolean | `false` | Write logs to `logs/debug.log` |

---

## Dashboard

Access the dashboard at `http://localhost:3000` to manage your Stream Sprites instance.

### Tabs

- **Dashboard**: Overview with statistics and quick actions
- **Config**: Twitch credentials and bot settings
- **Skins**: View all available skins and their assignments
- **Users**: Manage user exclusions and skin assignments
- **Settings**: Comprehensive overlay configuration (50+ parameters)
- **Help**: Documentation and troubleshooting

### Settings Tab

The Settings tab provides full control over every aspect of the overlay:

**Canvas**
- Width (800-3840px), Height (600-2160px), Ground position

**Physics**
- Gravity, Air resistance, Ground friction, Bounce damping, Minimum velocity

**Spawning**
- Max avatars (up to 1500), Spawn quantity (up to 100), Throttle timing, Sprite size ranges, Spawn position jitter

**Collision**
- Personal space threshold, Force multipliers, Probability scaling (low/medium/high density thresholds)

**Explosions**
- Force strength, Radius (base + variation), Upward bias, Spin strength, Random jitter

**Roaming**
- Zone settings, Walk/steer forces, Random movement, Arrival thresholds

**Particles**
- Count, Speed, Gravity, Decay, Size range, Color hue (base + range)

**Advanced**
- Mass divisor, Moment of inertia, Tilt recovery, Spatial hash cell size, Zone count, Avoidance radius, Size-based attraction/repulsion parameters

**Visual**
- Text padding, Idle wiggle range

**Debug**
- All debug logging options

Features:
- Collapsible sections with localStorage persistence
- Real-time configuration preview
- Reset to defaults functionality
- Dynamic application (debug settings apply without restart)

---

## Overlay

The overlay is available at `http://localhost:3000/overlay/overlay.html`.

### OBS Setup

1. In OBS Studio, add a **Browser Source** to your scene
2. Set the URL to: `http://localhost:3000/overlay/overlay.html`
3. Set width to `1920` and height to `1080` (matches default 1080p canvas)
4. Check **"Control audio via OBS"** (optional)
5. The overlay will display sprites and chat messages in real-time

**Note:** The overlay connects via WebSocket to the server. Ensure your firewall allows connections on port 3000.

### Features

- **Physics-based movement**: Gravity, friction, bouncing, collisions
- **Size-based social dynamics**: Similar-sized sprites repel, different-sized attract
- **Zone distribution**: Sprites roam to balance distribution across the canvas
- **Explosion effects**: Particle system with configurable force and visuals
- **Animated GIF support**: GIF skins animate automatically in the overlay
- **Mouse interaction**: Drag sprites to reposition them
- **Real-time chat**: Messages appear with usernames
- **Server-authoritative**: All avatar state managed by server for consistency

---

## Chat Commands

Viewers can interact with the overlay using these commands:

| Command | Description | Permissions |
|---------|-------------|-------------|
| `!jump` | Makes your sprite jump | Everyone |
| `!sit` | Makes your sprite sit (smaller size) | Everyone |
| `!unsit` | Returns your sprite to normal size | Everyone |
| `!boom` | Triggers an explosion effect on all sprites | Everyone |
| `!skins` | Lists all available skins | Everyone |
| `!skin <name>` | Changes your sprite's skin (e.g., `!skin cat`) | Everyone |
| `!spawn [quantity] [skin] [name]` | Spawns new sprites (mods/broadcaster only) | Moderators & Broadcaster |

**Note:** Skin names are case-insensitive. Use the names shown by the `!skins` command.

---

## Skins

Place your skin images in the `assets/skins/` directory. Supported formats:
- PNG
- GIF (animated sprites supported)
- JPG/JPEG
- WebP

Skins are automatically detected on startup and when the `/api/skins/auto` endpoint is called.

### Naming Conventions

- Use descriptive filenames (e.g., `cat.png`, `ninja.gif`)
- Avoid spaces and special characters (converted to underscores)
- The `default.png` skin is always available

---

## API Endpoints

### Public Endpoints

- `GET /env` - Returns merged configuration (`.env` + auto-detected skins + overlay defaults)
- `GET /api/skins` - List all available skins
- `GET /api/skins/auto` - Auto-detect skins from assets folder
- `GET /api/user/:id` - Get user's assigned skin
- `GET /healthz` - Health check endpoint

### Admin Endpoints (no auth in development)

- `POST /api/admin/saveConfig` - Save configuration
- `POST /api/admin/connectTwitch` - Connect Twitch bot
- `POST /api/admin/disconnectTwitch` - Disconnect Twitch bot
- `POST /api/admin/assignSkin` - Assign skin to user
- `POST /api/admin/resetUser` - Remove user's skin assignment
- `POST /api/admin/resetAll` - Reset all user assignments
- `GET /api/admin/users` - List all users with assignments
- `POST /api/admin/exclude` - Exclude user
- `POST /api/admin/unexclude` - Remove user from exclusions
- `GET /api/admin/excluded` - List excluded users
- `POST /api/admin/updateExclusionReason` - Update exclusion reason
- `GET /api/stats` - Get statistics (total users, custom/default skin counts)
- `POST /api/admin/refreshAllOverlays` - Force refresh all overlay clients
- `POST /api/admin/clearAvatars` - Clear all avatars from overlay
- `POST /api/admin/restartServer` - Restart the server
- `POST /api/admin/applySettings` - Apply debug settings dynamically

### OAuth Endpoints

- `GET /auth/twitch` - Initiate Twitch OAuth flow
- `GET /auth/callback` - OAuth callback handler

---

## Troubleshooting

### Port Already in Use

If you see `Port 3000 in use`, change the `serverPort` in your `.env` file or stop the other process.

### Bot Not Connecting

- Verify your Client ID and Client Secret are correct
- Ensure the bot username is registered with your Twitch application
- Check that the OAuth token was generated successfully
- Enable `debug.twitchDebug` and `debug.serverDebug` for detailed logs

### Skins Not Appearing

- Place skin images in `assets/skins/`
- Supported formats: PNG, GIF, JPG, JPEG, WebP
- Restart the server or call `/api/skins/auto`
- Check the browser console for errors

### Logs

Logs are written to `logs/debug.log` when `debug.logToFile` is enabled. View them in real-time:

```powershell
Get-Content logs/debug.log -Wait  # PowerShell
```

---

## What's New in v1.0.1

- **Comprehensive Overlay Settings UI**: Full-featured Settings tab with 50+ tunable parameters
- **Server-Authoritative Spawning**: Prevents duplicate avatars and ensures consistency across multiple overlay clients
- **Expanded Configuration**: All overlay defaults moved to client-side `config.js` for better maintainability
- **Increased Spawn Limit**: Max spawn quantity increased from 10 to 100
- **Bug Fixes**: Fixed `!spawn` additive behavior, stale message filtering, and client command handling
- **Improved Settings Management**: Collapsible sections with localStorage persistence and real-time configuration preview

See [CHANGELOG.md](CHANGELOG.md) for full details.

---

## Project Structure

```
stream-sprites/
├── assets/
│   └── skins/              # Sprite images (PNG, GIF, JPG, WebP)
├── dashboard/              # Admin dashboard (HTML/JS/CSS)
│   ├── index.html
│   ├── config.html/js
│   ├── settings.html/js
│   ├── skins.html/js
│   ├── users.html/js
│   ├── userSkinAssignmentManager.js
│   └── userExclusionManager.js
├── overlay/                # Overlay page (HTML/JS/CSS)
│   ├── overlay.html
│   ├── overlay.css
│   ├── overlay_client.js
│   └── js/
│       ├── config.js
│       ├── canvas.js
│       ├── avatar.js
│       ├── commands.js
│       ├── connection.js
│       ├── explosion.js
│       ├── gifRenderer.js
│       ├── input.js
│       ├── loop.js
│       ├── physics.js
│       ├── renderer.js
│       ├── skins.js
│       ├── spatialHash.js
│       ├── userSkinCache.js
│       └── utils.js
├── server/
│   ├── server.js          # Main server file
│   ├── package.json
│   ├── .env               # Configuration (ignored by git)
│   ├── db/                # SQLite database (auto-created)
│   └── logs/              # Log files (auto-created)
├── start.ps1              # Windows startup script (recommended)
├── README.md
├── CHANGELOG.md
├── LICENSE
└── NOTICE
```

---

## Running the Server

### Windows (Recommended)

```powershell
.\start.ps1
```

The `start.ps1` script provides:
- Automatic Node.js installation if missing
- Dependency installation on first run
- Auto-restart on crashes
- Port conflict resolution
- Browser auto-launch

### Any Platform

```bash
cd server
npm start
```

---

## Security Notes

- The `.env` file contains sensitive credentials and is **ignored by git**
- Never commit your `.env` file to version control
- Use the `persistOAuthToken` setting carefully:
  - `false` (default): Token stored in memory only, cleared on shutdown
  - `true`: Token saved to `.env` and survives restarts
- Admin endpoints have no authentication in development - consider adding auth for production use

---

## Development

### Technology Stack

**Backend:**
- Node.js + Express
- WebSocket (ws library)
- Twitch IRC (tmi.js)
- SQLite (better-sqlite3)
- OAuth 2.0 flow

**Frontend:**
- Vanilla JavaScript (ES6 modules)
- Canvas 2D API
- WebSocket client
- CSS3

**Deployment:**
- PowerShell script for Windows with auto-install capabilities

### Key Architecture Decisions

- **Server-authoritative state**: All avatar spawns and state changes validated by server to prevent duplicates across multiple overlay clients
- **Modular client code**: 13 separate JS modules for maintainability
- **Spatial hashing**: Efficient O(n) collision detection instead of O(n²)
- **Size-based social dynamics**: Attraction between different-sized sprites, repulsion between similar-sized sprites
- **Zone-based roaming**: Prevents clustering by encouraging distribution across horizontal zones
- **Configuration as code**: All defaults defined in client-side `config.js`, saved to `.env` on server

---

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

---

## License

Apache License 2.0 - see [LICENSE](LICENSE) and [NOTICE](NOTICE) files for details.

---

## Attribution

If you use, modify, or distribute this software, please retain the original copyright notice and attribution in all copies or substantial portions of the work. This includes keeping the NOTICE file intact when redistributing.

Stream Sprites is developed by SuperFurias and the community. If you fork or create a derivative work, please credit the original project:

> Stream Sprites - https://github.com/SuperFurias/stream-sprites

---

## Acknowledgments

- Built with [Express](https://expressjs.com/), [tmi.js](https://tmijs.com/), and [ws](https://github.com/websockets/ws)
- Thanks to the Twitch community for inspiration and support

---

**Made with ❤️ for streamers**