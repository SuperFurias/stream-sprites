const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');

const { loadConfig } = require('./config');
const { initDb } = require('./db');
const { createDbg, initFileLogger, getLogStream } = require('./lib/logger');
const { deepMerge, stripRuntimeConfigKeys } = require('./lib/util');
const storage = require('./storage/index');

const cfgPath = process.env.STREAM_SPRITES_CONFIG
  ? path.resolve(process.env.STREAM_SPRITES_CONFIG)
  : path.join(__dirname, '.env');
const dataDir = process.env.STREAM_SPRITES_DATA_DIR
  ? path.resolve(process.env.STREAM_SPRITES_DATA_DIR)
  : __dirname;

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
initDb(dataDir).then(async () => {
  const driver = storage.getDriver();
  const db = driver.getType() === 'sqlite' ? driver.getRawDb() : driver;

  // When using a database-backed config, it is authoritative over the local file.
  if (driver.getType() === 'postgres') {
    try {
      const dbCfg = await driver.loadConfig(cfgPath);
      if (dbCfg && typeof dbCfg === 'object') {
        const merged = deepMerge(cfg, dbCfg);
        stripRuntimeConfigKeys(merged);
        Object.assign(cfg, merged);
        console.log('✓ Loaded configuration from PostgreSQL');
      }
    } catch (e) {
      console.warn('⚠ Failed to load configuration from PostgreSQL:', e.message);
    }
  }

  if (cfg.debug?.logToFile && !getLogStream()) initFileLogger();

  // NOW require modules that depend on DB being initialized
  const websocket = require('./websocket');
  const twitch = require('./twitch');
  const routes = require('./routes');

  // Initialize modules
  twitch.initTwitch(cfg, cfgPath, dbg, driver);

  // Express app
  const app = express();
  app.disable('x-powered-by');
  app.use(bodyParser.json({ limit: '1mb' }));

  const port = cfg.serverPort || 8080;

  // Initialize routes (registers all REST endpoints)
  routes.initRoutes(app, cfg, cfgPath, driver, dbg);

  // Start server
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`✓ Server running on http://localhost:${port}`);
    console.log(`✓ Dashboard: http://localhost:${port}/`);
    console.log(`✓ Overlay: http://localhost:${port}/overlay/overlay.html`);
    console.log(`✓ Storage backend: ${driver.getType()}`);

    // Clear sprites on startup
    websocket.clearServerSprites();
    console.log('✓ Cleared all sprites on startup');

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
    } else {
      console.error('✗ Server error:', err.message);
    }
    try { websocket.cleanup(); } catch (e) {}
    try { twitch.cleanup(); } catch (e) {}
    try { routes.cleanupTunnel(); } catch (e) {}
    try {
      const activeDriver = storage.getDriver();
      if (activeDriver) activeDriver.close();
    } catch (e) {}
    process.exit(1);
  });

  // Initialize WebSocket server
  const loginUsernameIndex = new Map();
  const wss = websocket.initWebSocket(server, cfg, driver, dbg, loginUsernameIndex);

  // Set up stats broadcasting
  websocket.setBroadcastStatsFn(routes.broadcastStats);

  // Start Twitch connection
  twitch.handleStartupTwitchConnection();

  // Graceful shutdown
  async function shutdown(signal) {
    dbg(`Shutting down (${signal})...`);
    websocket.cleanup();
    twitch.cleanup();
    routes.cleanupTunnel();
    const twitchClient = twitch.getTwitchClient();
    if (twitchClient) {
      try {
        const state = twitchClient.readyState ? twitchClient.readyState() : null;
        if (state === 1 || state === 'OPEN') await twitchClient.disconnect();
      } catch (e) {
        dbg('Error disconnecting Twitch client:', e.message);
      }
    }
    try {
      const activeDriver = storage.getDriver();
      if (activeDriver) await activeDriver.close();
      dbg('Database closed');
    } catch (e) {
      dbg('Error closing database:', e.message);
    }
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}).catch(err => {
  console.error('✗ Failed to initialize storage:', err.message);
  process.exit(1);
});
