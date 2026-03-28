const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');

const { loadConfig } = require('./config');
const { initDb } = require('./db');
const { createDbg, initFileLogger } = require('./lib/logger');

const cfgPath = path.join(__dirname, '.env');

// Load config
const cfg = loadConfig(cfgPath);
if (!cfg) process.exit(1);

// Backward compat migrations
let configChangedAtStartup = false;

if ('persistOAuthToken' in cfg && !('autoGenerateOAuth' in cfg)) {
  cfg.autoGenerateOAuth = !!cfg.persistOAuthToken;
  if (!('autoConnect' in cfg)) cfg.autoConnect = !!cfg.persistOAuthToken;
  delete cfg.persistOAuthToken;
  configChangedAtStartup = true;
  console.log('✓ Migrated persistOAuthToken to autoGenerateOAuth + autoConnect');
}

if ('autoConnect' in cfg && !('autoGenerateOAuth' in cfg) && !('persistOAuthToken' in cfg)) {
  cfg.autoGenerateOAuth = cfg.autoConnect;
  configChangedAtStartup = true;
  console.log('✓ Migrated old autoConnect to autoGenerateOAuth + autoConnect');
}

if ('persistOAuthToken' in cfg) {
  delete cfg.persistOAuthToken;
  configChangedAtStartup = true;
}

if (!cfg.autoGenerateOAuth && !cfg.autoConnect) {
  if (cfg.twitch?.refreshToken) { cfg.twitch.refreshToken = ''; configChangedAtStartup = true; }
  if (cfg.twitch?.botOAuthToken) { cfg.twitch.botOAuthToken = ''; configChangedAtStartup = true; }
  if (configChangedAtStartup) console.log('✓ Auto-generate and auto-connect disabled — cleared stored tokens');
}

if (configChangedAtStartup) {
  try {
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.warn('Failed to save startup config changes:', e.message);
  }
}

// Initialize logger
const dbg = createDbg(cfg);
if (cfg.debug?.logToFile) initFileLogger();

dbg('Config loaded:', { channel: cfg.channel, botUsername: cfg.botUsername, useServer: cfg.useServer, serverPort: cfg.serverPort });

// Initialize database BEFORE requiring modules that depend on it
const db = initDb(__dirname);

// NOW require modules that depend on DB being initialized
const websocket = require('./websocket');
const twitch = require('./twitch');
const routes = require('./routes');

// Initialize modules
twitch.initTwitch(cfg, cfgPath, dbg, db);

// Express app
const app = express();
app.use(cors({ origin: ['http://localhost', 'http://127.0.0.1'], credentials: true }));
app.use(bodyParser.json());

const port = cfg.serverPort || 8080;

// Initialize routes (registers all REST endpoints)
routes.initRoutes(app, cfg, cfgPath, db, dbg);

// Start server
const server = app.listen(port, () => {
  console.log(`✓ Server running on http://localhost:${port}`);
  console.log(`✓ Dashboard: http://localhost:${port}/`);
  console.log(`✓ Overlay: http://localhost:${port}/overlay/overlay.html`);

  // Clear sprites on startup
  websocket.clearServerSprites();
  console.log('✓ Cleared all sprites on startup');

  // Start Twitch connection before browser opens (so needsOAuthRedirect is set)
  twitch.handleStartupTwitchConnection();

  // Auto-open browser
  if (cfg.autoOpenBrowser !== false) {
    setTimeout(async () => {
      try {
        const axios = require('axios');
        let isOpen = false;
        try {
          const checkRes = await axios.get(`http://localhost:${port}/api/dashboard/isOpen`, { timeout: 500 });
          if (checkRes.data && checkRes.data.isOpen) isOpen = true;
        } catch (e) {}

        if (isOpen) {
          console.log('✓ Dashboard already open, skipping browser launch');
          routes.setDashboardConfirmedOpen(true);
          return;
        }

        let targetUrl = `http://localhost:${port}/`;
        if (twitch.getNeedsOAuthRedirect()) {
          targetUrl = `http://localhost:${port}/auth/twitch`;
          console.log('→ Opening browser for Twitch OAuth:', targetUrl);
        } else {
          console.log('→ Opening dashboard in browser:', targetUrl);
        }

        const { exec } = require('child_process');
        if (process.platform === 'win32') {
          exec(`rundll32 url.dll,FileProtocolHandler "${targetUrl}"`);
        } else if (process.platform === 'darwin') {
          exec(`open "${targetUrl}"`);
        } else {
          exec(`xdg-open "${targetUrl}"`);
        }
      } catch (e) {
        console.log('✓ Open browser manually:', `http://localhost:${port}/`);
      }
    }, 500);
  } else {
    console.log('✓ Auto-open browser disabled. Open manually:', `http://localhost:${port}/`);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`✗ Port ${port} in use. Change in .env`);
  }
});

// Initialize WebSocket server
const loginUsernameIndex = new Map();
const wss = websocket.initWebSocket(server, cfg, db, dbg, loginUsernameIndex);

// Set up stats broadcasting
websocket.setBroadcastStatsFn(routes.broadcastStats);

// Graceful shutdown
async function shutdown(signal) {
  dbg(`Shutting down (${signal})...`);
  websocket.cleanup();
  twitch.cleanup();
  const twitchClient = twitch.getTwitchClient();
  if (twitchClient) {
    try {
      const state = twitchClient.readyState ? twitchClient.readyState() : null;
      if (state === 1 || state === 'OPEN') await twitchClient.disconnect();
    } catch (e) {
      dbg('Error disconnecting Twitch client:', e.message);
    }
  }
  db.close(() => {
    dbg('Database closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
