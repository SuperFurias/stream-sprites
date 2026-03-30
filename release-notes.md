### Added
- **Dashboard chat panel**: Send messages and commands directly from the dashboard. Real-time Twitch chat display via WebSocket.
- **Cloudflare tunnel management**: Start/stop tunnels from the Deploy tab. Overlay preview automatically uses the tunnel URL.
- **Remote overlay hosting**: Overlay works via Cloudflare tunnel URLs with automatic API/WebSocket/asset URL adaptation.
- **Adaptive refresh rate**: Interpolation adapts to detected monitor refresh rate (30-240Hz support).
- **Mod/broadcaster command targeting**: `!jump`, `!sit`, `!unsit` accept sprite name arguments for mods/broadcasters.

### Performance
- Server broadcast rate increased from 20Hz to 60Hz for smoother rendering.
- Dragged sprites skip server-side physics simulation.

### Fixed
- Sprites no longer fall while being dragged.
- Dragged sprites properly released on client disconnect.
- Dashboard chat messages no longer appear twice.

### Changed
- Overlay preview uses `window.location.origin` instead of hardcoded localhost.
- Preview dimensions dynamically derived from canvas config.
- Server accepts all origins for remote overlay access.
- Dashboard commands not forwarded to Twitch chat.

**Full Changelog**: https://github.com/SuperFurias/stream-sprites/compare/v2.0.1...v2.0.2
