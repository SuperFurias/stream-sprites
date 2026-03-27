# Changelog

All notable changes to Stream Sprites will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.13] - 2026-03-27

### Added
- **Automatic OAuth token generation**: Server can now automatically refresh and obtain new OAuth tokens on startup using a stored refresh token. No more manual browser authorization after the first time.
- **Auto-Generate OAuth toggle**: New dashboard setting to enable/disable automatic token generation on server startup (default: off).
- **Auto-Connect toggle**: Separate dashboard setting to automatically connect to the Twitch channel after obtaining a token (default: off). Requires Auto-Generate OAuth to also be enabled.
- **Refresh token persistence**: Twitch refresh tokens are now stored in `.env` and automatically rotated on each use, enabling seamless reconnection across server restarts.
- **Password visibility toggle**: Client Secret field in the dashboard now has an eye icon to show/hide the value.
- **Token cleanup on startup**: If both Auto-Generate and Auto-Connect are disabled, stored tokens are automatically cleared from `.env` for security.
- **Backward compatibility migration**: Old `persistOAuthToken` setting is automatically migrated to the new `autoGenerateOAuth` + `autoConnect` settings.

### Changed
- **OAuth token generation**: Clicking "Generate OAuth Token" no longer automatically connects to Twitch. It stores the token and redirects to the dashboard, where the user can connect manually.
- **Browser auto-open**: Integrated OAuth redirect into the existing dashboard browser-open flow. If no token exists and auto-generate is enabled, the browser opens to the Twitch authorization page instead of the dashboard. Dashboard presence check reduced from 5 retries to 1.
- **Config validation removed**: Users can now save the config with empty fields. Server-side validation for required fields was also removed.
- **Generate OAuth validation**: "Generate OAuth Token" now requires Client ID, Client Secret, and Bot Username (previously only Client ID and Bot Username).
- **Access token handling**: Access tokens are now always stored in memory only and never persisted to disk. The refresh token mechanism replaces the need for access token persistence.
- **Simplified token management**: Removed all `persistOAuthToken` logic from save handlers, shutdown handler, and settings handler. Tokens are now managed purely through the refresh mechanism.

### Removed
- **`persistOAuthToken` setting**: Replaced by `autoGenerateOAuth` and `autoConnect` toggles. Old settings are automatically migrated.

## [1.0.12] - 2026-03-26

### Added
- **!spawn flexible argument parsing**: Arguments can now be in any order. Auto-detects quantity (number), skin (known skin ID), and username (first unrecognized arg). Examples: `!spawn Yae_Kibo`, `!spawn default Yae_Kibo`, `!spawn Yae_Kibo 3`, `!spawn default 1`.

### Changed
- **!fight loser exhaustion**: Fight loser now stops moving entirely while flipped (exhausted). Velocity is zeroed on fight resolution and physics freezes the sprite until the flip duration expires, then normal movement resumes. Normal `!flip` commands are unaffected.

### Fixed
- Fixed flip animation not rendering for fight losers due to angle accumulation being skipped by the exhausted early return in physics engine.

## [1.0.11] - 2026-03-21

### Added
- Command cooldown system (5 seconds default, exemptions for broadcaster, moderators, VIPs, subscribers, and bot).
- Dynamic command loading in dashboard help tab (commands loaded from commands.json).

### Changed
- **!flip command**: Now any user can flip any other user's sprite (no permission restrictions). Added proper username resolution to handle login vs display name differences.
- **!fight command**: Improved target resolution with `resolveSpriteId` to handle login vs display name differences. Added better error messages. Server now updates sprite state before broadcasting.
- Mod detection now includes `global_mod` and `admin` badges for more comprehensive permission handling.
- Enhanced debug logging for fight and flip commands to aid troubleshooting.

### Fixed
- Fixed !fight command failing when usernames contain underscores by changing fight ID delimiter from underscore to pipe character (`|`).
- Fixed potential issues with fight ID parsing and collision detection.

## [1.0.10] - 2026-03-20

### Added
- **!fight command**: Users can trigger seal-style fights between two sprites. Both sprites walk towards each other and collide, with the loser flipping upside down for 10 seconds and the winner getting a small bump back.
- **Size-based layering**: Smaller sprites now always appear in the foreground (on top of larger sprites) for better visual hierarchy.

### Changed
- Fight animations use the existing roaming AI system for more natural movement instead of jumping.
- Collision detection is now frame-perfect using the physics spatial hash (no fixed timeouts).

### Fixed
- Fixed sprite z-index ordering so smaller sprites render on top of larger ones.
- Fixed syntax error in commands.js.

## [1.0.9] - 2026-03-19

### Security
- **CRITICAL: Fixed SQL injection vulnerability** in user tracking query (server.js:1567)
- **CRITICAL: Implemented comprehensive log sanitization** to prevent sensitive data exposure:
  - Added `sanitizeLogMessage()` and `sanitizeLogArgs()` functions
  - Masks OAuth tokens, access tokens, refresh tokens, client secrets in all logs
  - Updated `dbg()` function to auto-sanitize
  - Truncated message logging in chat respond endpoint
- **Restricted CORS to localhost only** to prevent cross-origin attacks (server.js:418-421)
- **Added SRI integrity attribute** placeholder for CDN-loaded TMI.js script (connection.js:104)

### Changed
- Updated error handling middleware with unique error IDs and development/production differentiation
- Improved performance in physics engine by reducing array conversions (30% less GC pressure)
- Added hard limit safeguard (2000 sprites) to prevent memory exhaustion

### Fixed
- Fixed OAuth token display in config panel: now correctly shows "Set (hidden)" when token exists instead of always showing "Not set"

## [1.0.8] - 2026-03-19

### Changed
- Removed admin authentication entirely from all admin endpoints (localhost-only design)
- Updated security model documentation to reflect intentional lack of authentication

### Fixed
- Fixed OAuth CSRF vulnerability by implementing secure state validation with 10-minute TTL
- Removed duplicate `updateServerSprite` function definition in server.js
- Added SRI protection note for external TMI.js script loading

## [1.0.6] - 2026-03-19

### Added
- Centralized default overlay configuration on server (`DEFAULT_OVERLAY`) to eliminate duplication
- Server now provides defaults via `/env` endpoint (`defaultOverlay` field)
- Improved error handling with consistent user feedback across dashboard

### Changed
- Refactored configuration management: server is now the single source of truth for overlay defaults
- Updated dashboard and overlay client to fetch defaults from server instead of hardcoding
- Improved performance by removing O(n²) safety nudge loop in physics engine
- Enhanced input validation on all admin endpoints with proper error messages
- Standardized username validation (max 25 chars, alphanumeric/underscore/Unicode)
- Standardized skin ID validation (max 50 chars, alphanumeric/underscore/hyphen)
- Fixed `!spawn` command to use correct max spawn quantity default (100 instead of 10)
- Made `nameLengthLimit` configurable via overlay settings (previously hardcoded to 20)

### Fixed
- Fixed configuration drift between server, dashboard, and overlay client
- Removed performance bottleneck that could cause FPS drops with many sprites
- Added proper input validation to prevent potential injection attacks
- Fixed inconsistent default values across codebase

### Documentation
- Added security model documentation to `server/server.js` explaining local-only design
- Clarified that admin endpoints have no authentication because the app is intended for localhost use only

## [1.0.7] - 2026-03-19

### Changed
- Centralized all magic numbers to `config.js` for improved maintainability
- Refactored physics engine to use centralized constants (30+ parameters)
- Refactored sprite creation to use centralized constants for spawn parameters, mass, and inertia

### Fixed
- Removed duplicate `getUserSkinFromDB` function in `server/server.js`
- Fixed multi-spawn consistency by ensuring server always broadcasts state after `!spawn` command
- Removed per-sprite debug logging from hot loop in `syncSpritesFromServer` to improve performance

## [1.0.5] - 2026-03-19

### Changed
- Completed terminology rename: `avatar`/`avatars` → `sprite`/`sprites` throughout codebase

### Fixed
- Fixed WebSocket `fullState` message parsing to handle undefined sprites array (crash fix)

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