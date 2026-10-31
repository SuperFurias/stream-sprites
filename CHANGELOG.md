# Changelog

All notable changes to Stream Sprites will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.8.1] - 2026-10-31

### Changed
- The Overview dashboard now fits entirely in the app window at common desktop sizes (tested from 1120x760 through 1600x1000) without page scrolling.
- Quick actions, metrics, the live overlay preview, and chat tester now scale to the available viewport.
- The README now opens with a linked screenshot gallery using demo data.

### Added
- `Stream Sprites.exe` is now tracked in the repository root alongside the source and release assets.
- Screenshot source images under `docs/screenshots/`.

## [2.8.0] - 2026-10-31

### Added
- **Native Windows desktop app** at the repository root. The 1.5 MB WebView2 launcher opens instantly, shows a branded loading screen, and uses standard Windows minimize, maximize, and close controls.
- **Local accounts and profiles**: passwordless shared **Guest**, per-account registration/sign-in, scrypt-hashed passwords, and isolated config, database, skins, logs, and overlay state for each account.
- **Account chooser** with a default **Sign In** tab, saved-account shortcuts, and local-only account management.
- **Window state persistence**: the desktop window remembers its size, position, and maximized state across launches.
- Original Stream Sprites app icon and source artwork.
- Account/profile, logout, desktop-window, UI, and responsive-layout test coverage.

### Changed
- Complete dashboard redesign: dark glass theme, sidebar navigation, modern metrics, tables, forms, toggles, modals, and responsive 4-column mobile navigation.
- Reorganized the repository so the root contains the executable, GitHub files, and an `app/` folder with the source and runtime files.
- Account/profile switching restarts the local server; dashboard logout returns to the account chooser.
- Replaced the bundled default skin artwork with CC0 assets; renamed the secondary bundled skin from `bunbun` to `mochi`.
- Auto-open browser now defaults off and is suppressed for desktop, account, test, and soak runs.
- Updated setup, account, desktop, and security documentation.

### Fixed
- Cloudflare tunnel cleanup no longer references out-of-scope state during shutdown.
- Local dashboard logout now performs a real account/profile transition instead of reloading into the same trusted local dashboard.
- Preserved window controls, loading state, and server shutdown when switching profiles.

### Security
- Account passwords are stored as salted scrypt hashes in a local account database; credentials and profile data stay outside the repository.
- Local account APIs accept loopback clients only.
- Removed obsolete Electron cache data from the desktop app data folder.

## [2.7.5] - 2026-10-31

### Fixed
- PostgreSQL schema creation is serialized with an advisory lock, preventing `CREATE TABLE IF NOT EXISTS` races when multiple instances initialize the same database.
- PostgreSQL tests run serially to avoid shared-config interference.

### Added
- Integration test proving database-backed config is authoritative at startup: the server listens on the DB-configured port and serves DB-configured channel/settings instead of the file fallback.

## [2.7.4] - 2026-10-31

### Fixed
- The dashboard chat log now keeps at most 200 lines instead of growing DOM nodes indefinitely during long streams.

## [2.7.3] - 2026-10-31

### Security
- Sensitive endpoints (`/env`, `/api/local/*`, `/api/dashboard/*`, `/api/storage/*`) now send `Cache-Control: no-store` so config/control data cannot linger in browser or intermediary caches.

## [2.7.2] - 2026-10-31

### Fixed
- Jumping out of a sit now restores the standing `heightScale` instead of leaving the sprite squashed.
- Starting a fight resets both participants to the standing height scale as well as `idle`, so sitting sprites fight correctly.
- WebSocket integration tests cover the sit→jump height transition.

## [2.7.1] - 2026-10-31

### Added
- `/healthz` now reports version, uptime, storage backend, connected WebSocket clients, and Twitch connection state. HTTP integration tests cover the shape.

## [2.7.0] - 2026-10-31

### Fixed
- Storage switching and SQLite→PostgreSQL migration now honor `STREAM_SPRITES_DATA_DIR` instead of always reading/writing the default `server/db` directory.

### Added
- **PostgreSQL driver test suite** (`npm run test:postgres`) covering users, skins, exclusions, config, assets, and stats. It skips locally unless `TEST_POSTGRES_URL` is set.
- CI now runs the PostgreSQL suite against a `postgres:16-alpine` service job on Node 22.
- Verified against a real PostgreSQL 16 container: direct driver operations, live storage switching, asset writes/reads, and migration to PostgreSQL.

## [2.6.3] - 2026-10-31

### Added
- **WebSocket integration tests** cover: no config messages over the socket, ignored client `clearSprites` commands, dashboard role identification (no physics snapshots), server-authoritative drag updates, and owner-only drag enforcement. Suite is now 19 tests.

## [2.6.2] - 2026-10-31

### Changed
- CI runs on `ubuntu-24.04` with `actions/checkout@v7` and `actions/setup-node@v7`, removing the Node 20 deprecation warnings.

## [2.6.1] - 2026-10-31

### Fixed
- `npm test` now names the test files explicitly instead of passing `test/` to `node --test`, which failed on Node 22/24 even though it worked on Node 26.
- CI verified on both Node 22 and 24.

## [2.6.0] - 2026-10-31

### Added
- **GitHub Actions CI** runs the unit/HTTP integration suite, live-server soak test, and dependency audit on Node 22 and 24 for every push to `master` and every pull request.
- Added the CI status badge to the README.

## [2.5.2] - 2026-10-31

### Docs
- Refreshed README structure for `tools/soak.js`, `server/restart-helper.js`, `lib/password.js`, active storage backends, WebSocket compression, and the 2.5.x release line.

## [2.5.1] - 2026-10-31

### Fixed
- The `npx` Cloudflare tunnel fallback now works on Windows (`.cmd` shims require a shell).
- Tunnel error messages now point to `npm install` to restore the bundled `cloudflared` binary instead of suggesting a global install.

## [2.5.0] - 2026-10-31

### Performance
- **WebSocket snapshots are compressed** with permessage-deflate (level 1, 1 KB threshold). The soak test measures **65.6 KB → 8.8 KB average wire bytes** at 301 sprites (~86% reduction).
- Snapshot compression can be disabled with `STREAM_SPRITES_NO_COMPRESSION=1` for CPU-bound hosts.
- The soak report now includes decompressed and wire bytes per snapshot.

## [2.4.5] - 2026-10-31

### Fixed
- Twitch connection errors during startup and dashboard connect requests are now awaited and reported by the existing try/catch paths instead of surfacing as unhandled promise rejections.

## [2.4.4] - 2026-10-31

### Fixed
- **Repeated Twitch connect attempts** no longer leave a stale connecting client behind. Existing clients are fully disconnected, and events from old clients are ignored so commands cannot be processed twice.
- Command replies are sent through the client that received the message, not whichever client happens to be current.

## [2.4.3] - 2026-10-31

### Fixed
- **Deleting a skin in use** now resets affected user assignments and live sprites to `default` instead of leaving them pointing at a missing file.
- **The only default skin cannot be deleted**; upload a replacement default first (409 response).
- Added `clearSkinAssignments` to both storage drivers and covered it in the storage and HTTP integration tests.

## [2.4.2] - 2026-10-31

### Fixed
- **Overlay settings are clamped** at the config boundary: canvas dimensions, ground Y, sprite sizes, max sprites, spawn quantity, lifetime, network rate, and related timings cannot be written with simulation-breaking values.
- **Server normalization** guarantees positive canvas dimensions, ground inside the canvas, valid sprite-size ordering, sane lifetimes, and a 2000-sprite cap at runtime even if an old config file bypasses the UI.
- The settings UI now matches the real 2000-sprite hard cap instead of offering 5000.

## [2.4.1] - 2026-10-31

### Changed
- Restart detection now also treats PM2 and systemd services as supervised, avoiding a duplicate server when those managers restart the process.
- Documented `STREAM_SPRITES_SUPERVISED` for custom process managers.

## [2.4.0] - 2026-10-31

### Added
- **Self-restarting server**: the dashboard “Restart Server” action now works under `npm start` / `node server.js` by launching a detached helper that waits for the port to be released and starts a fresh process with the same environment.
- `start.ps1` and `start.sh` mark their supervised runs, so the existing restart loop is used instead of spawning a duplicate server.
- After a self-restart the server skips auto-opening a second browser tab and retries binding the port up to five times.

### Verified
- Standalone restart: old process exited, new process answered `/healthz` on the same port.
- Supervised restart: the endpoint exited cleanly without spawning a second process, leaving the restart to the supervisor.

## [2.3.10] - 2026-10-31

### Verified
- Added integration coverage for the remote-overlay contract: cross-origin `/env` and `/api/skins/auto` responses include `Access-Control-Allow-Origin: *`, and `/assets` media remains readable without auth.
- Manually verified a second-origin overlay (`?server=`) loading skins from the target server, connecting over WebSocket, and rendering spawned sprites with no console or request failures.

## [2.3.9] - 2026-10-31

### Security
- **Dashboard passwords are now stored as salted scrypt hashes** instead of plaintext. Existing plaintext passwords still work and are transparently upgraded on the next successful login. Password changes and setup hash before writing to `.env` or PostgreSQL.
- Added password hashing tests (18 tests total).

## [2.3.8] - 2026-10-31

### Fixed
- **Excluding a user** now removes their live sprite immediately, including the login-name lookup entry, instead of leaving them on screen until the lifetime timeout.
- Exclusion reasons are capped at 500 characters on both create and edit.

### Removed
- Dead `/api/viewer/profile` and `/api/viewer/updateSkin` endpoints (the latter reported success without changing anything).
- Duplicate `/api/local/clearSpritesServer` endpoint.

## [2.3.7] - 2026-10-31

### Fixed
- **Live skin refresh**: uploading or deleting a skin now tells connected overlays to reconcile their skin list; no reload required.
- **Overlay network waste**: chat messages no longer trigger a redundant `/api/user/*` request because physics snapshots carry the authoritative skin.
- **Skin preload failures** time out after 5 seconds and broken images fall back to the drawn placeholder instead of stalling or rendering a broken image.
- **Overlay loop resilience**: a single frame exception is logged and the animation loop continues.

### Added
- Server broadcasts `reloadSkins` after asset upload/delete and storage switches; overlays add, update, and remove skins in place.

## [2.3.6] - 2026-10-31

### Fixed
- **Footer credit** no longer floats over the Users, Settings, or chat panels; it sits below the page content.
- **Empty user tables** now show “No users yet.” / “No excluded users.” instead of a blank body.
- **Empty pagination** shows “Page 1 of 1” instead of “Page 1 of 0”.

## [2.3.5] - 2026-10-31

### Fixed
- **Command parsing** handles repeated whitespace and reports only real command arguments.
- **Skin commands** (`!skin`, `!spawn <skin>`) are case-insensitive.
- **`!skins`** truncates long lists to fit a Twitch chat message and shows the remaining count.
- **`!boom`** clamps its epicenter/radius to the canvas on unusual configurations.

### Added
- **Soak test**: `npm run soak` starts an isolated server, spawns 300+ sprites, runs every command repeatedly for 10 seconds, and checks snapshot flow, sprite limits, cleanup, and server errors.

## [2.3.4] - 2026-10-31

### Accessibility & UX
- **Keyboard tabs**: dashboard tabs are real buttons in a `tablist`, support Arrow/Home/End navigation, and expose `aria-selected`.
- **Deep links**: the active tab is stored in the URL hash (`#settings`, `#users`, …) and restored on load.
- **Skip link** and visible `:focus-visible` outlines across dashboard controls.
- **Labels**: all 114 settings labels are associated with their controls; users-tab search/username/reason fields and modals have accessible names.
- **Auth pages**: password fields have labels, proper autocomplete values, live error regions, and dark color-scheme metadata.
- **Icon buttons**: asset delete, modal close, and pagination buttons have accessible labels.
- **Reduced motion**: dashboard transitions and hover lifts are disabled under `prefers-reduced-motion`.
- **Transitions** no longer use `transition: all`; tabs wrap on narrow screens.

## [2.3.3] - 2026-10-31

### Added
- **Logout**: remote dashboard sessions can be ended from the header button (`POST /api/dashboard/logout`), which deletes the session and expires the cookie.

## [2.3.2] - 2026-10-31

### Fixed
- **Live skin changes**: assigning or resetting a user's skin updates their current sprite immediately instead of waiting for the next chat message.
- **Invalid config recovery**: a corrupt `.env` is backed up as `.invalid-<timestamp>.bak` before defaults are written, so credentials are never silently overwritten.
- **Error handling order**: the Express error handler now runs after OAuth and all other routes.
- **Drag lifetime**: dragging counts as activity, so sprites do not expire mid-drag.
- **WebSocket reconnect guard**: the overlay no longer stacks connection attempts while a socket is already connecting.
- **Empty dashboard chat** is rejected instead of sending a blank Twitch message.

### Changed
- **Smaller physics snapshots**: velocity and angular-velocity fields are no longer sent because clients never read them.
- **User/exclusion lists** load up to 1000 rows by default (configurable up to 5000) instead of truncating at 100.
- **Asset cache lifetime** reduced to 60 seconds so replaced skins refresh promptly.
- **Stats broadcasts** are guarded against clients disconnecting mid-send.
- **Collision spin** is now exposed in the settings UI.

## [2.3.1] - 2026-10-31

### Changed
- **Dashboard WebSocket role**: dashboards identify themselves and no longer receive 30 Hz physics snapshots; overlays continue to receive them.
- **Expired sessions** redirect the dashboard to the login page instead of silently showing the server as offline.
- **Password changes** invalidate other dashboard sessions but keep the session that made the change alive.

### Added
- **HTTP integration suite**: spawns an isolated server and verifies static boundaries, remote config redaction, auth/session behavior, upload traversal protection, and password-change invalidation.
- **Path overrides**: `STREAM_SPRITES_ASSETS_DIR` and `STREAM_SPRITES_STORAGE_CONFIG` env vars allow alternate asset/storage locations and fully isolated tests.

## [2.3.0] - 2026-10-31

### Security
- **Static exposure fixed**: only `index.html`, `favicon.ico`, `dashboard/`, `overlay/`, and `assets/` are served. Server config, SQLite files, logs, and source files are no longer reachable over HTTP.
- **Asset path traversal fixed**: uploads are reduced to a safe basename, folders and filenames are validated, and deletion/serving resolves inside `assets/` only.
- **Auth hardened**: loopback detection now validates the peer address, Host header, proxy headers, and request origin; mutating APIs reject cross-origin and cross-site requests; login attempts are rate-limited and password comparison is constant-time.
- **Secret leaks removed**: the public `/env` response no longer includes Twitch client credentials, and the WebSocket no longer sends the full config (which contained tokens) to every client.
- **Dashboard setup is local-only**; remote setup attempts return 403. Set the password from the local machine before exposing a tunnel.
- **Sessions are invalidated when the dashboard password changes**, and login throttling uses the forwarded client IP behind tunnels so one attacker cannot lock out everyone.
- **Config writes sanitized**: unknown/runtime keys are dropped, prototype-pollution keys are blocked, and OAuth access tokens are never persisted.

### Fixed
- **Storage switch startup bug**: `server/storage.json` shadowed the `server/storage/` module, so restarting after switching databases failed. The config moved to `server/storage-config.json` (legacy files migrate automatically).
- **Stale driver after switch**: switching to PostgreSQL now updates the Twitch module and all route handlers instead of using a closed SQLite driver.
- **PostgreSQL config at startup** is loaded before routes and Twitch initialize.
- **PostgreSQL skins** now resolve assignments and list DB-stored skins correctly.
- **Fight resolution** no longer marks both participants as losers; the chosen loser is preserved and fights expire if they never connect.
- **MAX_SPRITES** is enforced for chat-created sprites as well as `!spawn`.
- **Sprite cleanup** removes login-name index entries and drag ownership.
- **Storage UI** no longer advertises unsupported MySQL/MongoDB backends; migrations and failed switches release drivers cleanly.
- **Twitch reconnects automatically** after network loss, and manual disconnect stops token refresh/reconnect.
- **Install-script approvals** (`allowScripts`) keep native `better-sqlite3` and `cloudflared` builds working on fresh npm 11 installs.
- **Settings lifetime/fade fields** now round-trip correctly between minutes (UI) and milliseconds (server).
- **Dashboard tab races** and chat/asset XSS paths fixed.
- **Invalid JSON bodies** return 400 instead of 500.

### Changed
- **Server physics now honors dashboard settings** for collisions, avoidance, roaming, spawning, zones, decay, dances, and particle effects.
- **Snapshot rate is configurable** (`networkFps`, default 30 Hz); clients interpolate between snapshots.
- **Game loop** schedules the next frame instead of polling every millisecond, and broadcasts are skipped when no overlays are connected.
- **WebSocket heartbeat** drops dead clients.
- **Overlay rendering** caches DOM writes, re-sorts drag targets on click, uses shortest-arc rotation interpolation, and normalizes particles to 60 FPS.
- **Logs rotate** at 5 MB.
- **Node.js 22+** is required (better-sqlite3 13).
- **Dependencies** updated and pinned via overrides; `npm audit` reports 0 vulnerabilities.
- **Tests**: added `npm test` coverage for config safety, asset paths, permissions, physics configuration, collisions, lifetime, serialization, and SQLite storage. The spawned-server HTTP integration suite is described under 2.3.1.

### Removed
- Unused `cors` dependency.

## [2.2.0] - 2026-04-27

### Added
- **Storage Management**: New dashboard "Storage" tab for managing database backends. Supports SQLite (default), PostgreSQL, Supabase, Neon, MySQL, and MongoDB with connection testing and migration tools.
- **Assets Management**: New dashboard "Assets" tab for managing skin files and other assets. Upload files to organized folders, browse existing assets with previews.
- **Storage Abstraction Layer**: New `server/storage/` module with pluggable database drivers. SQLite driver uses `better-sqlite3`, PostgreSQL driver uses `pg` with compatibility layer.
- **Database Migration**: API endpoints for migrating data between storage backends (e.g., SQLite → PostgreSQL).

### Changed
- **Consolidated package.json**: Removed `server/package.json` and `server/package-lock.json` — all dependencies now managed in root `package.json`.
- **Dashboard headings**: Updated section headings in dashboard for better clarity ("Quick Actions", "Overlay Preview").
- **Routes refactored**: All database operations in `routes.js` now use the storage driver abstraction (`_driver`) instead of direct SQLite calls.

### Removed
- **server/package.json**: Deleted in favor of root-level dependency management.
- **server/package-lock.json**: Deleted as dependencies are now managed at root level.
- **Skins tab**: Replaced by the new Assets tab.

## [2.1.0] - 2026-04-27

### Changed
- **Dashboard entry point moved**: The dashboard route (`/`) now serves `index.html` from the project root instead of `dashboard/index.html`, consolidating the entry point for static hosting and the authenticated dashboard route.

### Added
- **Repository layout documentation**: Added a "Repository layout" section to README explaining the project structure and entry points.

## [2.0.10] - 2026-04-26

### Changed
- **Overlay Preview non-selectable**: Added `user-select: none` to the overlay preview section to prevent accidental text selection on misclick.
- **Hide Deploy tab on remote access**: The Deploy tab is now hidden when accessing the dashboard from a non-localhost address (e.g. Render.com, tunnel URLs).

## [2.0.9] - 2026-04-26

### Fixed
- **Favicon on Render.com**: Added explicit `/favicon.ico` route before auth middleware to ensure the favicon loads correctly on remote deployments (Render.com, etc.).

## [2.0.8] - 2026-04-26

### Added
- **Favicon support**: Added `<link rel="icon">` to dashboard HTML pages (`index.html`, `setup.html`, `login.html`). Place `favicon.ico` in the project root to use a custom favicon.

## [2.0.7] - 2026-04-26

### Added
- **`start.sh` for Linux/macOS**: Bash equivalent of `start.ps1` with full feature parity — CLI flags (`--no-prompt`, `--skip-deps`, `--audit-fix`), Node.js installation check (apt/dnf/brew), dependency staleness detection (package.json vs node_modules timestamp, missing lock file), port conflict detection and kill (ss/lsof), auto-restart loop with keypress timeout, and `npm audit fix` support.

### Fixed
- **`.env` port parsing**: The bash version correctly reads `.env` as `KEY=VALUE` lines instead of incorrectly parsing it as JSON (the PowerShell script had this bug).

## [2.0.6] - 2026-04-11

### Fixed
- **Duplicate `refreshStatsCache` in `routes.js`**: Removed the second identical function definition (dead code).
- **Graceful shutdown database close**: `better-sqlite3` closes synchronously; `server.js` now calls `db.close()` correctly and exits afterward instead of passing a callback that was never invoked.

### Changed
- **`routes.js` maintenance**: Dropped unused imports (`validateRequired`, `rateLimitMap`, `RATE_LIMIT_WINDOW_MS`, unused top-level `exec`); removed redundant inner `require('crypto')` and `require('fs')`; corrected `/env` handler indentation for overlay config invalidation.
- **`twitch.js`**: Use a single top-level `path` require for skin directory scanning instead of requiring `path` inside functions.

## [2.0.5] - 2026-04-04

### Removed
- **Client-side physics engine**: Deleted `overlay/js/physics.js` — physics is now exclusively server-authoritative.
- **Client-side command handlers**: Deleted `overlay/js/commands.js` — all commands are processed server-side.
- **TMI.js fallback**: Removed `setupTmiFallback` from `connection.js` — overlay no longer connects directly to Twitch.
- **Dual-mode code paths**: Removed all `USE_SERVER`/`useServer` conditionals, local mode spawning, local cooldowns, and client-side fight collision detection.

### Changed
- **Overlay client rewritten**: `overlay_client.js` reduced from 698 to 363 lines — now only connects to server via WebSocket, receives physics state, interpolates, and renders.
- **Canvas module simplified**: Removed `USE_SERVER` parameter from `canvas.js` — always uses server coordinate mode.
- **Config always server mode**: `USE_SERVER` in `config.js` now always returns `true`.

### Fixed
- **`start.ps1` npm install failure**: Fixed `%1 is not a valid Win32 application` error by using `cmd.exe /c npm install` instead of `Start-Process -FilePath "npm"`.

## [2.0.4] - 2026-04-04

### Fixed
- **`!boom` explosion position**: Server now broadcasts the `y` coordinate with boom commands so all overlays render the explosion at the exact `groundY`. Previously the client calculated its own Y value which could differ from the server's.
- **Dashboard groundY fallback**: Corrected from `920` to `1080` to match server default. Removed `groundY` from settings overlay field map so it's not duplicated.
- **Jump velocity**: Now uses `physics.JUMP_VELOCITY` constant instead of hardcoded `-16`.
- **Server restart**: Now performs graceful shutdown — closes database, cleans up WebSocket and Twitch connections before terminating.
- **Chat message sanitization**: IRC control characters and newlines are now stripped from messages sent via the dashboard chat endpoint.
- **Cloudflare tunnel stop (Windows)**: Uses async `exec` instead of `execSync` for `taskkill`, preventing blocking.
- **OAuth redirect with tunnels**: Redirect URL now uses the actual request host and `x-forwarded-proto` header so OAuth works through Cloudflare tunnels.
- **Broadcast method name**: Fixed `broadcastSpriteState` → `broadcastPhysicsState` in twitch.js.

### Changed
- **`start.ps1` dependency management**: Added `Install-Dependencies` function with smart detection (skips install if node_modules is up-to-date). Added `SkipDeps` and `AuditFix` parameters.
- **`start.ps1` port conflict check**: Extracted into `Test-PortConflict` function with detailed process info and automatic kill.
- **Removed `jsonwebtoken` dependency**: No longer used, removed from package.json.
- **Updated `cloudflared`**: Bumped from `0.6.1` to `0.7.1`.
- **Stats cache invalidation**: Added `invalidateStatsCache()` called on user assignment/reset operations to keep stats accurate.
- **CSRF token management**: Added infrastructure for CSRF token generation and validation.

## [2.0.3] - 2026-04-01

### Added
- **Dashboard password protection**: Remote access (tunnel) to the dashboard now requires a password. First-time remote access shows a setup page to choose a password. Localhost access remains open. Password is stored in `.env` and shown as `***` in settings.
- **Dashboard setup page**: New `setup.html` for first-time password creation with confirm field and validation (min 4 chars).
- **Dashboard login page**: New `login.html` with password field and session-based auth (24-hour cookie).

### Fixed
- **Cloudflare tunnel stop**: Stop tunnel now uses `taskkill /F /T /PID` on Windows to kill the entire process tree (shell + cloudflared child). Previously `kill()` only killed the shell wrapper, leaving cloudflared running.
- **Cloudflare tunnel restart**: Start tunnel now checks if a previous process is actually alive before refusing to start. Stale state is cleaned up automatically.
- **Missing `cloudflared` dependency**: Added `cloudflared` to `package.json` so `npx cloudflared` works without global install.

### Security
- **`/env` endpoint masks dashboard password**: The `/env` API no longer exposes the `dashboardPassword` — returns `***` instead of the real value. The save endpoint preserves the real password if `***` is sent back.

## [2.0.2] - 2026-03-30

### Added
- **Dashboard chat panel**: Send messages and commands directly from the dashboard. Messages appear in Twitch chat and the overlay. Twitch chat messages are displayed in real-time via WebSocket.
- **Cloudflare tunnel management**: Start/stop Cloudflare tunnels from the Deploy tab. Tunnel URL is automatically detected and used for the overlay preview.
- **Deploy tab**: New dashboard tab for Cloudflare tunnel controls.
- **Remote overlay hosting**: Overlay can be accessed via Cloudflare tunnel URL (`?server=` query param). All API calls, WebSocket, and asset URLs adapt to the remote server.
- **Adaptive refresh rate**: Monitor refresh rate is detected via `requestAnimationFrame` and interpolation adapts to native FPS (supports 30, 60, 75, 90, 120, 144, 165, 240Hz).
- **Mod/broadcaster command targeting**: `!jump`, `!sit`, `!unsit` now accept a sprite name argument for mods/broadcasters (e.g. `!jump spritename`).

### Performance
- **Server broadcast rate**: Physics state broadcast increased from 20Hz (50ms) to 60Hz (~16ms) for smoother sprite rendering.
- **Dragged sprite physics skip**: Server skips physics simulation for sprites being dragged, preventing gravity from interfering with drag positioning.
- **Console log reduction**: `physicsState` messages no longer logged individually, reducing console spam from 60+ messages/second.

### Fixed
- **Drag sprite falling**: Sprites no longer fall while being dragged. Server tracks which sprites are being dragged and skips physics for them.
- **Dragged sprite cleanup**: Dragged sprites are properly released when the client disconnects, preventing stuck sprites.
- **Dashboard chat double message**: Messages sent from the dashboard no longer appear twice in the chat log.

### Changed
- **Overlay preview**: Preview uses `window.location.origin` instead of hardcoded `localhost:PORT`. Works with tunnel URLs automatically.
- **Overlay preview sizing**: Preview dimensions are derived from `canvasWidth`/`canvasHeight` in config via CSS custom properties, with dynamic aspect ratio.
- **CORS policy**: Server now accepts all origins (was restricted to localhost) to support remote overlay access.
- **Server binding**: Server binds to `0.0.0.0` to allow access from tunnel URLs.
- **Dashboard commands**: Commands sent from the dashboard (e.g. `!jump`) are not forwarded to Twitch chat, only to the overlay.

## [2.0.1] - 2026-03-28

### Fixed
- **Dashboard tab switching**: Config and Settings tabs no longer interfere with each other. Renamed `showError`/`showSuccess` in config.js to `configShowError`/`configShowSuccess` to fix a name collision with settings.js that broke toggle validation when switching from Settings to Config.
- **Toggle validation persistence**: Auto-Generate OAuth and Auto-Connect toggle validators now re-attach to new DOM elements after tab switches (using per-element `_hasListener` flag).
- **Connect Twitch validation**: Button validates Bot Username, Channel, and OAuth token before connecting, showing errors inline.
- **Generate OAuth validation**: Validates Client ID and Client Secret are filled and saved to `.env` before redirecting.
- **`!sit` height**: Sit command now correctly sets `heightScale = 0.75` so the sprite visually squishes. Unsit resets to `1.0`.
- **`!flip` collision stacking**: Collision angular velocity is now skipped when a flip is active, preventing erratic spinning.
- **`!fight` resolution**: Fight handler now sets `_fightTarget` on both sprites so the game loop's collision resolution actually triggers.
- **`/env` cache stale data**: Config save now invalidates the `/env` cache so the dashboard immediately reflects saved values.
- **Settings tab null guards**: All `getElementById` calls in settings.js now have null checks to prevent crashes when elements don't exist.

### Changed
- **Dashboard error messages**: All validation and status messages use inline elements with 2-second auto-fade instead of browser `alert()` popups.
- **Toggle label structure**: Toggle labels only wrap the slider (clicking text no longer toggles the checkbox).
- **Disconnect button**: Removed "Disconnecting..." state — button stays as-is.
- **Save Config**: Simplified — no button state changes, shows inline status message.
- **Default config order**: `botUsername` now appears before `channel` in generated `.env` files.

## [2.0.0] - 2026-03-28 (Pre-release)

### Changed
- **Server-authoritative physics**: The server now runs the complete physics simulation and is the single source of truth for all sprite state (position, velocity, size, angle, opacity). Clients render the state broadcast by the server. This ensures sprites appear identically across all browser tabs and windows.
- **Deterministic sprite creation**: Sprite size and spawn position are derived from a hash of the username, so every client and the server agree on sprite dimensions and initial placement. Sprites spawn directly at ground level.
- **Server game loop**: A 60fps accumulator-based game loop in `server/websocket.js` runs physics, handles collisions, manages lifetime, and resolves fight outcomes. State is broadcast to all clients at 20Hz.
- **Command physics server-side**: Jump, boom, flip, and fight commands apply physics on the server. Clients render the resulting state and show explosion visual effects.
- **Drag interactions via WebSocket**: Client drag operations (start, move, end with throw velocity) are sent to the server, which updates the authoritative sprite position.
- **Default config values from DEFAULT_OVERLAY**: `getOverlayConfig()` and `server/physics.js` import defaults from `config.js` instead of hardcoding fallback values.
- **Dashboard ping at 100ms with stopPinging**: Dashboard pings every 100ms on startup. Server returns `stopPinging: true` after confirming the dashboard is open, so the dashboard stops pinging. Browser-open check reduced to 500ms.

### Performance
- **Server-side physics engine**: Ported the overlay physics engine to Node.js (`server/physics.js`) with spatial hash, collision detection, avoidance forces, roaming behavior, and lifetime management.
- **20Hz physics broadcast**: Server broadcasts full sprite physics state every 50ms instead of per-event.
- **Client-side interpolation**: Sprites are interpolated between 20Hz server updates for smooth 60fps rendering.
- **Cached server sprite array**: Array only rebuilds when sprites change, not every frame.

### Fixed
- **Cross-tab sprite synchronization**: Sprites appear at the same position, size, and state across all browser tabs.
- **Canvas coordinate scaling**: Sprites are rendered using non-uniform scaling from server coordinates to screen space, maintaining correct ground level on any window size.
- **Sprite spawn flash**: Client no longer creates local sprites on chat messages in server mode, preventing the brief mid-air appearance before server state arrives.

## [1.0.19] - 2026-03-28

### Performance
- **Cached overlay config**: `getOverlayConfig()` now returns a cached object invalidated only on config change (save, apply, disk reload), eliminating per-command object allocation.
- **Skins cache TTL increased**: Cache duration raised from 5s to 60s with `fs.watch()` on the skins directory for instant invalidation on file changes.
- **Explosion physics sprite array**: `applyExplosionPhysics()` accepts a pre-built sprite array, using an indexed loop instead of `Map.values()` iterator. Also uses squared distance to avoid unnecessary `Math.hypot`.
- **Animated sprite sort caching**: `animatedMediaRenderer` only re-sorts the animated sprite list when the animated sprite count changes, not every frame.
- **Pre-computed coordinate scale factors**: Screen coordinate scale (`innerWidth/W`, `innerHeight/H`) computed once per frame instead of per-sprite division.
- **Skip shadows for airborne sprites**: Ground shadows only rendered for sprites within 20px of the ground surface.
- **O(1) sprite ID resolution**: Secondary `loginUsernameIndex` Map replaces linear scan of all sprites for `resolveSpriteId()`.
- **Server-side stats caching**: `/api/stats` endpoint now uses a 3-second TTL cache and the server broadcasts stats to WebSocket clients.
- **Dashboard real-time stats**: Dashboard connects via WebSocket for live stats updates, falling back to 10s HTTP polling only when WebSocket is unavailable.

### Fixed
- **Token refresh interval leak**: `connectTwitchBot()` now stores and clears the token refresh interval ID before creating a new one, preventing interval accumulation on reconnects.
- **`deepMerge` nested object corruption**: The merge utility now properly deep-copies nested objects and handles arrays, preventing shared reference mutations.
- **Consistent physics timing**: `manageLifetime()` receives the same `now` timestamp from `updatePhysics()` instead of calling `Date.now()` independently.
- **Unconditional debug logging**: `console.log('[UPDATE]')` calls gated behind `cfg.debug.serverDebug` flag.

### Changed
- **Server modularized**: `server.js` (2310 lines) split into 8 focused modules: `lib/logger.js`, `lib/util.js`, `config.js`, `db.js`, `websocket.js`, `twitch.js`, `routes.js`, with `server.js` reduced to a slim ~110-line entry point.

## [1.0.18] - 2026-03-28

### Fixed
- **Animated sprite z-ordering**: GIF/WebM skins render as DOM elements (not on canvas), so the canvas sort did not apply to them. Animated media renderer now applies its own z-index ordering based on sprite size, and the container z-index is raised above the canvas so animated sprites are visible and properly layered.
- **Usernames freezing at spawn point**: An aggressive "skip rendering" optimization caused the canvas to stop redrawing after the first frame, freezing all sprites and usernames in place.
- **Client secret not appearing in config dashboard**: Server's `/env` endpoint was explicitly stripping `clientSecret` from the response; removed the filter since the dashboard needs it for editing.
- **Excluded users not loading in dashboard**: Both `userSkinAssignmentManager.js` and `userExclusionManager.js` declared `const _renderPagination` in the global scope, causing a `SyntaxError` that prevented the exclusion manager from loading. Renamed to unique prefixed variables.
- **Sprite lifetime fade calculation**: Restored original fade progress formula from v1.0.10.
- **ManageLifetime opacity check**: Restored the `sprite.opacity <= 0` guard on deletion to match original behavior.

### Performance
- **Server startup config batching**: Consolidated 4 separate `fs.writeFileSync` calls into a single batched write.
- **Command cooldown tracking**: Replaced string-concatenation keys (`userId + ':' + cmd`) with a two-level Map to avoid garbage allocation.
- **Sprite snapshot serialization**: Server now updates snapshot entries in-place instead of clearing and rebuilding the entire map on every broadcast.
- **Rate limiter memory cap**: Added max entries limit (1000) to prevent unbounded memory growth.
- **Physics spatial hash reuse**: Module-level SpatialHash instance is reused via `reinitialize()` instead of allocating a new one every frame.
- **Physics parallel array**: Maintains a persistent sprite array that only rebuilds when sprites are added/removed.
- **Squared distance comparisons**: Replaced `Math.hypot` with `dx*dx + dy*dy` vs `r*r` where exact distance isn't needed.
- **Input handler cached sort**: Mouse hit-testing uses a cached sorted array that only rebuilds when sprite count changes.
- **Text width cache LRU eviction**: Capped at 1000 entries to prevent unbounded growth during long streams.

### Changed
- **Overlay command handler**: Refactored `handleCommand` to accept a context object instead of 20+ individual parameters.
- **Extracted shared helpers**: `applySpriteState()` and `sendChatResponse()` deduplicated across overlay client.
- **Connection reconnect interval**: Now properly cleared on successful WebSocket connect, preventing duplicate intervals.
- **Connection command dispatch**: Replaced if-else chain with Map/object lookup.
- **Dashboard shared utilities**: Extracted `renderPagination`, `fetchAvailableSkins`, `populateSkinSelect` into `dashboardUtils.js`.
- Removed unused `spawn` import from `child_process` in server.js.
- Extracted duplicate `AUTH_ERROR_PATTERNS` constant in server.js.

## [1.0.17] - 2026-03-28

### Performance
- SpatialHash query now reuses a persistent Set instead of allocating a new Array per call (reduces GC pressure in collision/avoidance loops)
- Removed redundant `grid.clear()` after SpatialHash construction
- Delta-based sprite state broadcast: server now sends only added/updated/removed sprites instead of full array every update (~90% bandwidth reduction)
- Sprite eviction uses single-pass O(n) min-finder instead of O(n log n) full sort
- SQLite WAL mode enabled for better concurrent read/write performance
- DOM element pooling for animated media renderer (img/video elements reused instead of created/destroyed)
- Reduced canvas shadow blur from 4 to 2 with offset for faster text rendering
- Text measurement cache for repeated usernames (avoids redundant Canvas API calls)
- Separate animated sprite ID Set for O(1) tracking instead of per-frame iteration
- Cached `getBoundingClientRect` on resize instead of per mouse event
- `/env` cache TTL increased from 2s to 10s
- Lightweight in-memory rate limiter for `/api/` endpoints (100 req/s per IP)
- Dirty renderer flag now triggers on sprite state/heightScale changes, not just count changes

### Security
- `clientSecret` no longer exposed to client via `/env` endpoint (server handles OAuth flow)

### Fixed
- **Drag throw velocity unit mismatch**: Physics uses px/frame convention but throw velocity was calculated as px/sec, causing sprites to launch off-screen at 60x intended speed
- **Drag sprite shooting upward when still**: `updateDraggedSpritePhysics` applied gravity every frame while dragging, accumulating velocity silently. Position is now set directly by mouse with zero velocity during drag
- **Can't throw sprites sideways**: Velocity tracking used same-frame mouse position, giving zero horizontal displacement. Now tracks previous frame's position so throw velocity reflects actual mouse movement
- **Sprite position out of bounds on drag release**: Added canvas bounds clamping on mouseup

### Changed
- Refactored `processServerCommand` into command registry pattern (9 individual handler functions)
- Extracted `resolveSpriteId` and `spawnServerSprite` to module-level functions
- Drag input handler now computes throw velocity from per-frame mouse displacement (matching physics convention)

## [1.0.16] - 2026-03-27

### Performance
- Removed per-frame console.log calls from animatedMediaRenderer render loop (major FPS improvement)
- Replaced O(n) array splice with O(1) swap-pop in particle removal
- Reused sorted sprite array cache instead of allocating and sorting every frame
- Cached Date.now() once per frame in physics engine instead of per-sprite
- Cached skin detection results with 5-second TTL (avoids repeated filesystem scans)
- Cached /env config responses with 2-second TTL (avoids repeated disk reads and JSON parses)
- Set ctx.font once per frame instead of per sprite in renderer

### Fixed
- **Sprites stuck tilted forever**: Fixed collision/explosion resetting the tilt return timer on every hit. Timer now only starts once and counts down uninterrupted, so sprites always return to upright even in dense crowds.
- **Tilt return while airborne**: Tilt return now only starts after the sprite lands on the ground. Sprites stay tilted while flying through the air after a boom.
- **Collision probability logic inversion**: Low sprite count now correctly means low collision processing probability, high count means high probability (was backwards).
- **TMI.js blocked by broken SRI**: Removed placeholder SRI integrity attribute that prevented tmi.js from loading via CDN.

### Changed
- Extracted shared explosion physics into `applyExplosionPhysics()` in utils.js (deduplicated across 3 files)
- Extracted shared permission check into `hasModPermission()` in utils.js (deduplicated across 4 locations)
- Extracted duplicated media element creation into `createMediaElement()` helper in animatedMediaRenderer.js
- Added periodic pruning for command cooldowns and spawn timers to prevent memory leaks
- Removed 130-line duplicate `fallbackDefaults` object from config.js (server provides defaults)

## [1.0.15] - 2026-03-27

### Added
- **Dashboard settings for command values**: Added configurable settings for Jump Velocity, Flip Angular Velocity, Fight Coin Flip Probability, Flip Duration, Fight Duration, and Command Cooldown in the dashboard settings page (Other section).
- **New configurable constants**: `jumpVelocity`, `flipAngularVelocity`, `fightCoinFlipProbability` added to `DEFAULT_OVERLAY` and `config.js`.

### Changed
- **Unified hardcoded values**: All duplicated hardcoded values across the overlay codebase are now defined once in `config.js` and referenced from there. Values like jump velocity, flip duration, fight duration, height scales, and angular velocity are now configurable through the dashboard settings.
- **commands.js reads settings dynamically**: Command handler functions now read configurable values from `cfg.overlay` with fallbacks to `config.js` defaults, instead of using static imports.

## [1.0.14] - 2026-03-27

### Fixed
- **OAuth auto-refresh on startup after extended downtime**: Fixed a bug where the server would skip token refresh on startup if a stored access token existed, even if that token was expired. The startup flow now always attempts a refresh using the stored refresh token before connecting, ensuring a fresh access token is obtained regardless of how long the server was offline. If the refresh token itself is expired or invalid, the browser automatically opens for re-authorization.

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
- **!spawn flexible argument parsing**: Arguments can now be in any order. Auto-detects quantity (number), skin (known skin ID), and username (first unrecognized arg). Examples: `!spawn ExampleUser`, `!spawn default ExampleUser`, `!spawn ExampleUser 3`, `!spawn default 1`.

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