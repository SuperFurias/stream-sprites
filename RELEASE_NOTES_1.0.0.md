# Stream Sprites v1.0.0 Release Notes

## 🎉 Major Milestone - First Stable Release!

After extensive development and testing, Stream Sprites is finally ready for its first stable release. Version 1.0.0 brings a complete, production-ready interactive overlay system for Twitch streamers.

## ✨ Key Features

- **Real-time Chat Integration**: Your viewers' chat messages come to life through animated sprites
- **Automatic Skin Detection**: Drop your custom images into `assets/skins/` and they're automatically detected
- **Full Admin Dashboard**: Web-based interface to configure everything without touching code
- **User Management**: Assign custom skins to specific users and exclude others
- **Persistent Configuration**: All settings stored securely in `.env` file
- **Dynamic Settings**: Change debug and server settings on the fly - no restart needed
- **OAuth Integration**: Secure Twitch authentication with token management
- **Real-time Updates**: WebSocket technology ensures instant overlay updates
- **Comprehensive Logging**: Optional file-based logging for debugging

## 🚀 Quick Start in 3 Steps

1. **Install**: `cd server && npm install`
2. **Configure**: Edit `server/.env` with your Twitch credentials
3. **Run**: `start.ps1` (Windows) or `npm start` in the server folder

Then open http://localhost:3000 and follow the setup wizard!

## 📖 Documentation

Comprehensive documentation is now available in the [README.md](README.md) file, covering:
- Installation and configuration
- Dashboard usage
- API reference
- Troubleshooting guide
- Development guidelines

## 🔧 Configuration

The configuration file has been renamed from `config.json` to `.env` for better security practices. The new format is identical (JSON), but the `.env` extension signals its sensitive nature and it's automatically ignored by git.

Example configuration:
```json
{
  "useServer": true,
  "serverPort": 3000,
  "twitch": {
    "clientId": "your_client_id",
    "clientSecret": "your_client_secret",
    "botOAuthToken": "",
    "redirectUri": "http://localhost:3000/auth/callback"
  },
  "channel": "your_channel",
  "botUsername": "your_bot",
  "persistOAuthToken": false,
  "debug": {
    "serverDebug": true,
    "twitchDebug": true,
    "logToFile": true
  }
}
```

## 🎨 Customization

- **Skins**: Add PNG, GIF, JPG, or WebP images to `assets/skins/`
- **Overlay**: The overlay is fully responsive and customizable via the Settings tab
- **Database**: SQLite database stores user assignments and exclusions

## 🔒 Security Notes

- The `.env` file contains sensitive credentials and is git-ignored
- OAuth tokens default to memory-only storage (cleared on shutdown)
- Admin endpoints have no authentication in development - consider adding auth for production use

## 🐛 Known Issues

- Admin endpoints are unauthenticated (development mode only)
- No built-in HTTPS support (use reverse proxy for production)
- Single-server setup only (no clustering)

## 📈 Future Plans

Potential features for future releases:
- Multi-language support
- Advanced sprite animations and effects
- User authentication for admin panel
- Clustering support for high-traffic streams
- Custom overlay themes
- Statistics and analytics dashboard
- Skin marketplace integration

## 🙏 Credits

Built with:
- Express.js - Web framework
- tmi.js - Twitch chat client
- ws - WebSocket library
- better-sqlite3 - Database
- And many other open-source contributors

Thank you to the Twitch community for the inspiration and feedback!

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Download this release**: https://github.com/SuperFurias/stream-sprites/releases/tag/v1.0.0

**Report issues**: https://github.com/SuperFurias/stream-sprites/issues

**Happy streaming!** 🎮✨