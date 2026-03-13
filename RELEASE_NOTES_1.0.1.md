# Stream Sprites v1.0.1 Release Notes

## 🎉 Minor Update - Bug Fixes and Major Improvements!

Version 1.0.1 addresses several important issues and adds significant quality-of-life improvements to the overlay system. This is a recommended update for all users.

**Release Date:** March 12, 2026

## 🔧 Major Changes

### Comprehensive Overlay Settings UI
The Settings tab has been completely redesigned with a comprehensive UI for tuning every aspect of the overlay:
- **Canvas settings**: Width, height, ground position
- **Physics parameters**: Gravity, air resistance, friction, bounce
- **Spawning controls**: Max avatars, spawn throttling, sprite sizes
- **Collision tuning**: Personal space, force multipliers, probability scaling
- **Explosion effects**: Force, radius, upward bias, spin, jitter
- **Roaming behavior**: Zone settings, walk forces, steering
- **Visual options**: Text padding, wiggle range
- **Particle system**: Count, speed, gravity, decay, size, color
- **Advanced parameters**: Mass, inertia, tilt recovery, spatial hash settings

All settings are saved to `.env` and can be adjusted without server restart (some require overlay refresh).

### Server-Authoritative Spawning
Implemented server-side validation to prevent duplicate avatars:
- Server tracks all spawned avatars authoritatively
- Clients must sync with server state on connect
- Prevents race conditions and duplicate spawns
- Improves consistency across multiple overlay clients

### Configuration Auto-Recovery
The server now automatically validates and restores missing configuration values on startup:
- Recursively checks all properties in `.env` (including nested objects)
- Adds any missing values with their defaults
- Fixes type mismatches
- Writes updated configuration back to disk
- Logs what was added or fixed

This prevents crashes and ensures the server always has the required configuration, even if values are manually deleted or the file becomes corrupted.

### Expanded Configuration System
- Moved all overlay defaults to client-side `config.js` for better maintainability
- Added 50+ new configurable parameters
- Consolidated `maxSpawnQuantity` into overlay config (increased from 10 to 100)
- Improved configuration structure with clear separation between server and overlay settings

### Enhanced Default Debug Settings
Twitch-related debug logging is now enabled by default for better out-of-the-box troubleshooting:
- `debug.twitchDebug`: `true`
- `debug.twitchAuthErrors`: `true`
- `debug.twitchOtherErrors`: `true`

### OAuth Terminology Update
Updated code to use Twitch's official "OAuth Redirect URL" terminology for clarity and consistency with Twitch documentation.

## 🐛 Bug Fixes

### !spawn Command Fix
Fixed `!spawn` command to be additive instead of replacing sprites. Multiple spawns now correctly create new sprites rather than overwriting existing ones.

### Stale Message Filtering
Improved filtering of stale `avatarUpdate` messages from previous server instances. Avatars created before server startup are now properly ignored, preventing phantom avatars after server restarts.

### Command Handling
Fixed client-side command handling to correctly check `tags.skipSpawn` and `tags.isCommand` flags, ensuring proper coordination between server-processed and client-processed commands.

## 📚 Documentation Updates
- Updated README with new settings UI and expanded configuration options
- Improved API endpoint documentation
- Enhanced troubleshooting section

## 🔄 Technical Improvements
- Refactored chat message metadata structure for better client-server communication
- Improved WebSocket message handling with proper error boundaries
- Enhanced avatar state synchronization on connection
- Better handling of server restarts and client reconnections

## 📊 Full Changelog

### Added
- Comprehensive overlay settings UI in dashboard
- Server-authoritative spawning system
- Configuration auto-recovery (missing .env values restored on startup)
- Clear avatars on server startup
- 50+ new tunable overlay parameters
- Increased max spawn quantity to 100
- Enhanced debug logging enabled by default (twitchDebug, twitchAuthErrors, twitchOtherErrors)
- OAuth redirect terminology aligned with Twitch documentation
- Collapsible settings sections with localStorage persistence
- Real-time settings preview

### Changed
- Refactored overlay configuration to client-side
- Removed duplicate default values
- Consolidated maxSpawnQuantity into overlay config
- Improved command metadata structure
- Enhanced avatar state sync protocol

### Fixed
- !jump command in server mode
- !spawn command additive behavior
- Stale avatarUpdate message filtering
- Client command handling logic
- Tags object structure for command metadata

### Changed
- Updated OAuth variable naming: `redirectUri` → `oauthRedirectUrl` for clarity
- Default debug settings: twitchDebug, twitchAuthErrors, twitchOtherErrors now `true`

## 🙏 Credits
Thanks to the community for reporting issues and suggesting improvements!

## 📄 License
Apache License 2.0 - see [LICENSE](LICENSE) and [NOTICE](NOTICE) files for details.

---

**Download this release**: https://github.com/SuperFurias/stream-sprites/releases/tag/v1.0.1

**Report issues**: https://github.com/SuperFurias/stream-sprites/issues

**Happy streaming!** 🎮✨
