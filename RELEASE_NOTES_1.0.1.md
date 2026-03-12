# Stream Sprites v1.0.1 Release Notes

## 🎯 Point Release - Bug Fixes & Improvements

Version 1.0.1 addresses important issues and adds refinements to the v1.0.0 release.

**Release Date:** March 12, 2026

## 🐛 Bug Fixes

### Critical Fix: !jump Command in Server Mode
- Fixed the `!jump` command not working when server mode is enabled
- The server now broadcasts a jump command to all connected clients, which apply the upward velocity to the corresponding avatar
- Removed the chat response for `!jump` to keep the command silent (like `!boom`, `!sit`, `!unsit`)

### Avatar State Synchronization
- Prevented stale avatars from being restored after server restart by filtering `fullState` messages with pre-startup timestamps
- Improved synchronization between server-side and client-side avatar states
- Better handling of avatar lifecycle across server restarts

## 🔧 Improvements

- Server now clears all avatars on startup to ensure a fresh state
- Enhanced WebSocket message handling for command routing
- More robust avatar state management in server-authoritative mode

## 📊 Technical Details

**Files Modified:**
- `server/server.js`: Added jump command broadcasting, improved avatar state handling
- `overlay/js/connection.js`: Added jump command routing through `handleWebSocketMessage`
- `overlay/overlay_client.js`: Added jump velocity application in command handler

**Server-Client Protocol:**
- New `jump` command type: `{ type: 'cmd', cmd: 'jump', username: '...' }`
- Broadcast to all connected overlay clients when jump is executed
- Clients apply `vy = -12` and set state to `'idle'` for the jumping avatar

## 🧪 Testing

All changes have been tested in both local and server modes:
- `!jump` now works correctly in server mode with multiple connected clients
- Avatar state persists correctly across server restarts
- No stale avatars appear after server restart

## 📦 Download

**Download this release**: https://github.com/SuperFurias/stream-sprites/releases/tag/v1.0.1

**Report issues**: https://github.com/SuperFurias/stream-sprites/issues

---

**Upgrade Notes:**
This is a drop-in replacement for v1.0.0. No database migrations or configuration changes required. Simply pull the latest code and restart the server.
