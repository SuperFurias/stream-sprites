# Changelog

All notable changes to Stream Sprites will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.5] - 2026-03-19

### Fixed
- Renamed `maxAvatars` to `maxSprites` in configuration for consistency
- Fixed WebSocket `fullState` message parsing to handle undefined sprites array

## [1.0.4] - 2026-03-16

### Added
- WebM video support for animated skins
- Automatic detection of `.webm` files from `assets/skins/` folder
- Video element rendering for WebM files in overlay (autoplay, loop, muted)
- WebM support in dashboard skins tab with video preview

### Changed
- Extended skin detection to include `.webm` extension
- Renamed `gifRenderer` to `animatedMediaRenderer` to better reflect its capabilities
- Updated animatedMediaRenderer to handle both GIF and WebM animated media
- Dashboard now creates `<video>` elements for WebM files instead of `<img>`
- Overlay CSS updated to style video elements alongside images
- WebM videos now use `object-fit: fill` and explicit dimensions for precise control

### Fixed
- Proper skin change detection using data attributes to avoid URL comparison bugs
- Fixed `!sit` command for WebM skins: now only height scales to 0.75, width remains constant
- Removed unwanted fallback circle rendering behind WebM videos

## [1.0.3] - 2026-03-13

### Changed
- Configuration system simplified: overlay defaults moved entirely to client-side
- Removed server-side `defaultCfg.overlay` object (120+ lines)
- Removed `filterDefaults()` function and all its usages
- Configuration saving now writes full config instead of filtered version
- `.env` configuration files will now contain all settings (backward compatible)

### Technical
- No functional changes to how configuration works
- Server codebase reduced by ~150 lines
- Backward compatible: old `.env` files continue to work without modification
- Auto-recovery still ensures all required properties exist in memory

## [1.0.2] - 2026-03-13

### Fixed
- Fixed `!skin` command when switching between GIF skins - now correctly updates the displayed GIF
- Fixed GIF animation restart when changing to a different GIF skin
- GIF element `src` is now properly updated when skin changes to a different GIF file

## [1.0.1] - 2026-03-12

### Added
- Comprehensive overlay settings UI in dashboard with all physics and visual parameters
- Server-authoritative spawning system to prevent duplicate sprites
- Configuration auto-recovery: server automatically restores missing .env values on startup
- Clear all sprites on server startup for fresh state
- Expanded overlay configuration with 50+ tunable parameters
- Increased max spawn quantity from 10 to 100
- Enhanced debug logging enabled by default (twitchDebug, twitchAuthErrors, twitchOtherErrors)

### Changed
- Refactored overlay configuration: moved all defaults to client-side config.js
- Removed duplicate default values from client configuration
- Consolidated maxSpawnQuantity into overlay config structure
- Improved command handling with proper tags.skipSpawn and tags.isCommand flags
- Restructured chat message metadata for better client-server communication
- Updated OAuth variable naming: redirectUri → oauthRedirectUrl for clarity
- Default debug settings: twitchDebug, twitchAuthErrors, twitchOtherErrors now true

### Fixed
- Fixed !spawn command to be additive instead of replacing sprites
- Fixed filtering of stale spriteUpdate messages from previous server instances
- Fixed client-side command handling to correctly check server-processed commands

### Security
- No new security changes in this release

## [1.0.0] - 2026-03-11

### Added
- Initial public release
- Real-time Twitch chat integration with animated sprites
- Automatic skin detection from `assets/skins/` directory
- Admin dashboard for configuration and management
- User skin assignment system
- User exclusion system
- Persistent SQLite database for user data
- OAuth token generation and management
- Dynamic settings adjustment without server restart
- WebSocket-based real-time overlay updates
- Comprehensive debug logging with file output option
- RESTful API for all functionality
- Health check endpoint
- Server restart capability via admin panel
- Overlay refresh broadcast to all clients
- Support for multiple image formats (PNG, GIF, JPG, WebP)
- Automatic browser launch on startup (configurable)
- Graceful shutdown handling

### Changed
- Configuration file renamed from `config.json` to `.env` for better security practices
- Improved error messages throughout the codebase
- Updated log messages to reference new `.env` configuration file

### Fixed
- Various bug fixes and stability improvements

### Security
- `.env` file automatically ignored by git to prevent credential leakage
- OAuth token can be stored in memory only (default) or persisted to disk
- No authentication on admin endpoints (development mode - should be added for production)

## [0.3.0] - Early Development (Pre-2025)

### Added
- Initial development version
- Basic Twitch integration
- Sprite rendering system
- Physics engine for sprite movement
- Chat message display

[Unreleased]: #