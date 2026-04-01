### Added
- **Dashboard password protection**: Remote access requires a password. First-time access shows a setup page. Localhost stays open.
- **Dashboard setup and login pages**: Clean UI for first-time password creation and subsequent logins.

### Fixed
- **Cloudflare tunnel stop**: Fixed Windows — now kills the entire process tree. Previously cloudflared kept running after stop.
- **Cloudflare tunnel restart**: Start now checks if previous process is actually alive before refusing.
- **Missing `cloudflared` dependency**: Added to package.json.

### Security
- **`/env` endpoint**: No longer exposes the dashboard password (returns `***` instead).

**Full Changelog**: https://github.com/SuperFurias/stream-sprites/compare/v2.0.2...v2.0.3
