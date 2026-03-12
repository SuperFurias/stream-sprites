# Stream Sprites

**Version 1.0.1**

Copyright 2026 SuperFurias

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

Stream Sprites is an interactive overlay application that brings your Twitch chat to life with animated sprites. Each viewer gets their own sprite that appears on your overlay, creating a dynamic and engaging experience for your stream.

![Stream Sprites Demo](assets/skins/default.png)

**Quickest way to start (Windows):** `.\start.ps1`
**Dashboard:** `http://localhost:3000`
**Overlay:** `http://localhost:3000/overlay/overlay.html`

## Features

- **Real-time Chat Integration**: Connects to your Twitch channel and displays chat messages through animated sprites
- **Automatic Skin Detection**: Automatically discovers and loads skins from the `assets/skins/` directory
- **User Skin Assignment**: Assign custom skins to specific users via the admin dashboard
- **Exclusion System**: Exclude users from appearing on the overlay
- **Persistent Configuration**: Configuration stored in `.env` file with sensitive data protection
- **Dynamic Settings**: Adjust debug settings and server options without restarting
- **OAuth Token Management**: Secure token generation with optional persistence
- **WebSocket Communication**: Real-time updates to overlay clients
- **SQLite Database**: Lightweight, file-based storage for user assignments and exclusions
- **Comprehensive Overlay Settings UI**: Full control over all overlay parameters (physics, spawning, collision, explosions, roaming, particles, and more) via the dashboard Settings tab
- **Server-Authoritative Spawning**: Server-side validation prevents duplicate avatars and ensures consistency across multiple overlay clients
- **50+ Tunable Parameters**: Customize every aspect of the overlay behavior including canvas size, gravity, friction, spawn rates, collision forces, explosion effects, and particle systems

## Quick Start

### Option 1: Automated Setup (Recommended - Windows)

Simply run the startup script and let it handle everything:

```powershell
.\start.ps1
```

The script will automatically:
- Check for Node.js 18+ and install it if missing (using winget, Chocolatey, or prompt manual download)
- Install all npm dependencies on first run
- Start the server with auto-restart on crashes
- Open the dashboard in your browser
- Handle port conflicts by killing existing processes on port 3000

### Option 2: Manual Setup

If you prefer manual control or are on a non-Windows system:

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

4. Open your browser to `http://localhost:3000`

### First-Time Configuration

1. The dashboard opens at `http://localhost:3000` (auto-opened by the script or manually navigate)
2. Go to the **Config** tab
3. Enter your Twitch credentials:
   - **Client ID** and **Client Secret** from your Twitch developer application
   - **Bot Username** (the Twitch account that will connect to chat)
   - **Channel** (your Twitch channel name)
4. Click **Save Config**
5. Click **Generate OAuth Token** to authenticate the bot
6. Click **Connect to Twitch** to start the bot

**Note**: The `.env` file is created automatically in the `server/` directory on first run if it doesn't exist.

## Configuration

The configuration file (`server/.env`) is created automatically on first run with default values. It uses JSON format:

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
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useServer` | boolean | `true` | Enable/disable Twitch bot connection |
| `serverPort` | number | `3000` | Port for the web server |
| `autoOpenBrowser` | boolean | `true` | Automatically open dashboard in browser when server starts (managed by server) |
| `twitch.clientId` | string | `""` | Twitch application client ID |
| `twitch.clientSecret` | string | `""` | Twitch application client secret |
| `twitch.botOAuthToken` | string | `""` | Bot OAuth token (generated via UI) |
| `twitch.redirectUri` | string | `http://localhost:3000/auth/callback` | OAuth redirect URI |
| `channel` | string | `""` | Your Twitch channel name |
| `botUsername` | string | `""` | Bot's Twitch username |
| `persistOAuthToken` | boolean | `false` | Save OAuth token to disk (true) or memory only (false) |
| `debug.serverDebug` | boolean | `false` | Enable server-side debug logging |
| `debug.twitchDebug` | boolean | `false` | Enable Twitch client debug logging |
| `debug.twitchAuthErrors` | boolean | `false` | Log authentication errors |
| `debug.twitchOtherErrors` | boolean | `false` | Log other Twitch errors |
| `debug.verboseMessages` | boolean | `false` | Log all chat messages |
| `debug.logToFile` | boolean | `false` | Write logs to `logs/debug.log` |

## Dashboard

Access the dashboard at `http://localhost:3000` to manage your Stream Sprites instance.

### Tabs

- **Config**: Manage Twitch credentials and bot settings
- **Skins**: View available skins and their assignments
- **Users**: Manage user exclusions and skin assignments
- **Settings**: Comprehensive overlay configuration including:
  - Canvas settings (width, height, ground position)
  - Physics parameters (gravity, air resistance, friction, bounce)
  - Spawning controls (max avatars, spawn throttling, sprite sizes)
  - Collision tuning (personal space, force multipliers, probability scaling)
  - Explosion effects (force, radius, upward bias, spin, jitter)
  - Roaming behavior (zone settings, walk forces, steering)
  - Visual options (text padding, wiggle range)
  - Particle system (count, speed, gravity, decay, size, color)
  - Advanced parameters (mass, inertia, tilt recovery, spatial hash settings)
  - Debug and logging options

### Skin Assignment

Assign custom skins to users:
1. Go to the **Users** tab
2. Enter a username in the "Assign Skin to User" section
3. Select a skin from the dropdown
4. Click **Assign Skin**

### User Exclusion

Prevent specific users from appearing on the overlay:
1. Go to the **Users** tab
2. Enter a username in the "Exclude User" section
3. Click **Exclude User**

## Overlay

The overlay is available at `http://localhost:3000/overlay/overlay.html`. It displays:
- Animated sprites for each chat user
- Real-time chat messages
- Physics-based sprite movement

### OBS Setup

1. In OBS Studio, add a **Browser Source** to your scene
2. Set the URL to: `http://localhost:3000/overlay/overlay.html`
3. Set width to `1920` and height to `1080` (matches default 1080p canvas size)
4. Check **"Control audio via OBS"** (optional, for future audio features)
5. The overlay will display sprites and chat messages in real-time

**Note:** The overlay connects via WebSocket to the server for real-time updates. Ensure your firewall allows connections on port 3000.

### Customization

Overlay settings are fully configurable via the **Settings** tab in the dashboard. All parameters are saved to `.env` and can be adjusted without server restart (some require overlay refresh). The Settings tab features:

- **Collapsible sections** for organized navigation with localStorage persistence
- **Real-time preview** of current configuration
- **50+ tunable parameters** covering every aspect of overlay behavior
- **Reset to defaults** functionality

Key settings include:
- **Canvas**: Width (800-3840px), height (600-2160px), ground position
- **Physics**: Gravity, air resistance, ground friction, bounce damping
- **Spawning**: Max avatars (up to 1500), spawn quantity (up to 100), throttle timing, sprite size ranges
- **Collision**: Personal space thresholds, force multipliers, probability scaling
- **Explosions**: Force strength, radius, upward bias, spin, jitter
- **Roaming**: Zone settings, walk/steer forces, random movement
- **Particles**: Count, speed, gravity, decay, size, color range
- **Advanced**: Mass, inertia, tilt recovery, spatial hash optimization

Settings are automatically merged with defaults and saved to the `.env` file's `overlay` section.

## Chat Commands

Viewers can interact with the overlay using these chat commands:

| Command | Description | Permissions |
|---------|-------------|-------------|
| `!jump` | Makes your sprite jump (fixed in v1.0.1 for server mode) | Everyone |
| `!sit` | Makes your sprite sit (smaller size) | Everyone |
| `!unsit` | Returns your sprite to normal size | Everyone |
| `!boom` | Triggers an explosion effect on all sprites | Everyone |
| `!skins` | Lists all available skins | Everyone |
| `!skin <name>` | Changes your sprite's skin (e.g., `!skin cat`) | Everyone |
| `!spawn [quantity] [skin] [name]` | Spawns new sprites (mods/broadcaster only)<br/>Example: `!spawn 5 knight SpriteName` | Moderators & Broadcaster |

**Note:** Skin names are case-insensitive. Use the names shown by the `!skins` command.

## Skins

Place your skin images in the `assets/skins/` directory. Supported formats:
- PNG
- GIF (animated sprites supported)
- JPG/JPEG
- WebP

Skins are automatically detected on startup and when the `/api/skins/auto` endpoint is called.

### Skin Naming

- Use descriptive filenames (e.g., `cat.png`, `ninja.gif`)
- Avoid spaces and special characters; they'll be converted to underscores
- The `default.png` skin is always available

## API Endpoints

### Public Endpoints

- `GET /env` - Returns merged configuration (from `.env` + auto-detected skins + overlay defaults) as JSON
- `GET /api/skins` - List all available skins
- `GET /api/skins/auto` - Auto-detect skins from assets folder
- `GET /api/user/:id` - Get user's assigned skin
- `GET /healthz` - Health check

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
- `GET /api/stats` - Get statistics
- `POST /api/admin/refreshAllOverlays` - Force refresh all overlay clients
- `POST /api/admin/restartServer` - Restart the server
- `POST /api/admin/applySettings` - Apply debug settings dynamically

### OAuth Endpoints

- `GET /auth/twitch` - Initiate Twitch OAuth flow
- `GET /auth/callback` - OAuth callback handler

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
```bash
Get-Content logs/debug.log -Wait  # PowerShell
```

## v1.0.1 Highlights (March 12, 2026)

This release brings significant improvements to the overlay system:

- **Comprehensive Overlay Settings UI**: The Settings tab has been completely redesigned with a full-featured UI for tuning every aspect of the overlay
- **Server-Authoritative Spawning**: Server-side validation prevents duplicate avatars and ensures consistency across multiple overlay clients
- **Expanded Configuration**: 50+ new tunable parameters moved to client-side config.js for better maintainability
- **Increased Spawn Limit**: Max spawn quantity increased from 10 to 100
- **Bug Fixes**: Fixed !spawn command additive behavior, stale message filtering, and client command handling
- **Improved Settings Management**: Collapsible sections with localStorage persistence and real-time configuration preview

See the [CHANGELOG.md](CHANGELOG.md) for full details.

## Development

### Project Structure

```
stream-sprites/
├── assets/
│   └── skins/          # Sprite images
├── dashboard/          # Admin dashboard (HTML/JS/CSS)
├── overlay/            # Overlay page (HTML/JS/CSS)
├── server/
│   ├── server.js      # Main server file
│   ├── .env           # Configuration (ignored by git)
│   ├── db/            # SQLite database
│   └── logs/          # Log files
├── start.ps1          # Windows startup script (recommended)
└── README.md          # This file
```

### Running the Server

**Recommended (Windows):**
```powershell
.\start.ps1
```

**Manual (any platform):**
```bash
cd server
npm start
```

The [`start.ps1`](start.ps1:1) script provides:
- Automatic Node.js installation if missing
- Dependency installation on first run
- Auto-restart on crashes
- Port conflict resolution
- Browser auto-launch

## Security Notes

- The `.env` file contains sensitive credentials and is **ignored by git**
- Never commit your `.env` file to version control
- Use the `persistOAuthToken` setting carefully - disabling it clears the token on shutdown for better security
- The admin endpoints have no authentication in development - consider adding auth for production use

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

Apache License 2.0 - see [LICENSE](LICENSE) and [NOTICE](NOTICE) files for details.

## Attribution

If you use, modify, or distribute this software, please retain the original
copyright notice and attribution in all copies or substantial portions of the work.
This includes keeping the NOTICE file intact when redistributing.

Stream Sprites is developed by SuperFurias and the community.
If you fork or create a derivative work, please credit the original project:

> Stream Sprites - https://github.com/SuperFurias/stream-sprites

## Acknowledgments

- Built with [Express](https://expressjs.com/), [tmi.js](https://tmijs.com/), and [ws](https://github.com/websockets/ws)
- Thanks to the Twitch community for inspiration and support

---

**Made with ❤️ for streamers**