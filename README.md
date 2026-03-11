# Stream Sprites

**Version 1.0.0**

Stream Sprites is an interactive overlay application that brings your Twitch chat to life with animated sprites. Each viewer gets their own sprite that appears on your overlay, creating a dynamic and engaging experience for your stream.

![Stream Sprites Demo](assets/skins/default.png)

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

## Quick Start

### Prerequisites

- Node.js 18+ installed
- A Twitch account with a registered application
- Git (optional, for cloning)

### Installation

1. Clone or download this repository:
```bash
git clone https://github.com/yourusername/stream-sprites.git
cd stream-sprites
```

2. Install dependencies:
```bash
cd server
npm install
```

3. Configure the application:
   - Copy the example configuration (if provided) or create `server/.env` manually
   - Edit `server/.env` with your Twitch credentials:
```env
useServer=true
serverPort=3000
autoOpenBrowser=true
twitch.clientId=your_client_id_here
twitch.clientSecret=your_client_secret_here
twitch.botOAuthToken=
twitch.redirectUri=http://localhost:3000/auth/callback
channel=your_channel_name
botUsername=your_bot_username
persistOAuthToken=false
debug.serverDebug=true
debug.twitchDebug=true
debug.twitchAuthErrors=true
debug.twitchOtherErrors=true
debug.verboseMessages=true
debug.logToFile=true
```

4. Start the server:
```bash
# On Windows
start.ps1

# Or manually
cd server
npm start
```

5. Open your browser to `http://localhost:3000`

### First-Time Setup

1. Open the dashboard at `http://localhost:3000`
2. Navigate to the **Config** tab
3. Enter your Twitch Client ID and Client Secret (from your Twitch developer application)
4. Enter your Bot Username and Channel name
5. Click **Save Config**
6. Click **Generate OAuth Token** to authenticate the bot with Twitch
7. Click **Connect to Twitch** to start the bot

## Configuration

The configuration file is located at `server/.env`. It uses JSON format with the following structure:

```json
{
  "useServer": true,
  "serverPort": 3000,
  "autoOpenBrowser": true,
  "twitch": {
    "clientId": "...",
    "clientSecret": "...",
    "botOAuthToken": "",
    "redirectUri": "http://localhost:3000/auth/callback"
  },
  "channel": "your_channel",
  "botUsername": "your_bot",
  "persistOAuthToken": false,
  "debug": {
    "serverDebug": true,
    "twitchDebug": true,
    "twitchAuthErrors": true,
    "twitchOtherErrors": true,
    "verboseMessages": true,
    "logToFile": true
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useServer` | boolean | `true` | Enable/disable Twitch bot connection |
| `serverPort` | number | `3000` | Port for the web server |
| `autoOpenBrowser` | boolean | `true` | Automatically open dashboard on startup |
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
- **Settings**: Adjust debug and logging options

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

### Customization

Overlay settings (canvas size, gravity, spawn rate, etc.) are configured in the server code and can be adjusted via the Settings tab in the dashboard.

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

- `GET /config.json` - Returns merged configuration with auto-detected skins
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
├── start.ps1          # Windows startup script
└── README.md          # This file
```

### Scripts

- `npm start` - Start the server
- `start.ps1` - Start server with auto-restart on Windows

## Security Notes

- The `.env` file contains sensitive credentials and is **ignored by git**
- Never commit your `.env` file to version control
- Use the `persistOAuthToken` setting carefully - disabling it clears the token on shutdown for better security
- The admin endpoints have no authentication in development - consider adding auth for production use

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- Built with [Express](https://expressjs.com/), [tmi.js](https://tmijs.com/), and [ws](https://github.com/websockets/ws)
- Thanks to the Twitch community for inspiration and support

---

**Made with ❤️ for streamers**