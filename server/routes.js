const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const { exec } = require('child_process');
const { isValidUsername, isValidSkinId, validateRequired, rateLimiter, rateLimitMap, RATE_LIMIT_WINDOW_MS } = require('./lib/util');
const twitch = require('./twitch');
const ws = require('./websocket');
const { DEFAULT_OVERLAY } = require('./config');

// Shared state (set by initRoutes)
let _cfg, _cfgPath, _db, _dbg, _app;

// Stats cache
let statsCache = null;
let statsCacheTime = 0;
const STATS_CACHE_TTL_MS = 3000;

function refreshStatsCache() {
  try {
    const row = _db.prepare(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN assigned_skin != 'default' AND assigned_skin IS NOT NULL THEN 1 ELSE 0 END) as custom
      FROM users`).get();
    const result = row || { total: 0, custom: 0 };
    statsCache = {
      total_users: result.total || 0,
      custom_skins: result.custom || 0,
      default_skins: (result.total || 0) - (result.custom || 0)
    };
    statsCacheTime = Date.now();
  } catch (err) {
    _dbg('Error refreshing stats cache:', err.message);
  }
  return statsCache;
}

function broadcastStats() {
  const stats = refreshStatsCache();
  if (stats) {
    const msg = JSON.stringify({ type: 'stats', data: stats });
    const wss = ws.getWss();
    if (wss) {
      wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
    }
  }
}

// Env cache
let envCache = null;
let envCacheTime = 0;
const ENV_CACHE_TTL_MS = 10000;

// OAuth state management
const pendingOAuthStates = new Map();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

// Dashboard presence
let dashboardLastSeen = null;
let dashboardConfirmedOpen = false;

function setDashboardConfirmedOpen(v) {
  dashboardConfirmedOpen = v;
}

function initRoutes(app, cfg, cfgPath, db, dbg) {
  _app = app;
  _cfg = cfg;
  _cfgPath = cfgPath;
  _db = db;
  _dbg = dbg;

  // Rate limiter
  app.use('/api/', rateLimiter);

  // ── Dashboard auth (remote access only) ──────────────────────────────────
  const crypto = require('crypto');
  const activeSessions = new Map(); // token -> { expires }
  const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  const SESSION_CLEANUP_MS = 60 * 60 * 1000; // clean up every hour

  // Clean expired sessions periodically
  setInterval(() => {
    const now = Date.now();
    for (const [token, session] of activeSessions) {
      if (session.expires < now) activeSessions.delete(token);
    }
  }, SESSION_CLEANUP_MS);

  function isLocalhost(req) {
    const host = req.hostname || req.headers.host || '';
    return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]');
  }

  function isAuthenticated(req) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/dash_session=([^;]+)/);
    if (!match) return false;
    const session = activeSessions.get(match[1]);
    return session && session.expires > Date.now();
  }

  // Auth middleware: protect dashboard and dashboard API for remote access
  app.use((req, res, next) => {
    if (isLocalhost(req)) return next(); // localhost always allowed
    // Public paths: overlay, env, skins, static assets needed by overlay
    const publicPaths = ['/overlay', '/env', '/favicon.ico'];
    if (publicPaths.some(p => req.path === p || req.path.startsWith(p + '/'))) return next();
    if (req.path === '/api/skins' || req.path === '/api/skins/auto') return next();
    // Auth check for everything else (dashboard, dashboard API, assets)
    if (isAuthenticated(req)) return next();
    // Unauthenticated remote access to dashboard
    if (req.path === '/api/dashboard/login' || req.path === '/api/dashboard/setup') return next(); // auth endpoints
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
    // If no password configured yet, show setup page
    if (!_cfg.dashboardPassword || _cfg.dashboardPassword.trim() === '') {
      return res.sendFile(path.join(__dirname, '..', 'dashboard', 'setup.html'));
    }
    // Serve login page
    res.sendFile(path.join(__dirname, '..', 'dashboard', 'login.html'));
  });

  // Setup endpoint (first-time password creation)
  app.post('/api/dashboard/setup', (req, res) => {
    if (_cfg.dashboardPassword && _cfg.dashboardPassword.trim() !== '') {
      return res.status(403).json({ error: 'Password already configured' });
    }
    const { password: input } = req.body;
    if (!input || typeof input !== 'string' || input.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    // Save password to config
    _cfg.dashboardPassword = input;
    try {
      const fs = require('fs');
      const current = JSON.parse(fs.readFileSync(_cfgPath, 'utf8'));
      current.dashboardPassword = input;
      fs.writeFileSync(_cfgPath, JSON.stringify(current, null, 2));
    } catch (e) {
      return res.status(500).json({ error: 'Failed to save password' });
    }
    // Create session and log in immediately
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.set(token, { expires: Date.now() + SESSION_TTL_MS });
    res.setHeader('Set-Cookie', `dash_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`);
    res.json({ ok: true });
  });

  // Login endpoint
  app.post('/api/dashboard/login', (req, res) => {
    const password = _cfg.dashboardPassword;
    if (!password || password.trim() === '') return res.status(403).json({ error: 'Password not configured yet' });
    const { password: input } = req.body;
    if (!input || typeof input !== 'string') return res.status(400).json({ error: 'Password required' });
    if (input !== password) return res.status(401).json({ error: 'Wrong password' });
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.set(token, { expires: Date.now() + SESSION_TTL_MS });
    res.setHeader('Set-Cookie', `dash_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`);
    res.json({ ok: true });
  });

  app.use(express.static(path.join(__dirname, '..')));
  app.use('/overlay', express.static(path.join(__dirname, '..', 'overlay')));

  // Serve dashboard at root
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
  });

  // Skin endpoints
  app.get('/api/skins', (req, res) => {
    res.json(twitch.detectSkinsFromAssets());
  });

  app.get('/api/skins/auto', (req, res) => {
    res.json(twitch.detectSkinsFromAssets());
  });

  // Config endpoint
  app.get('/env', (req, res) => {
    const now = Date.now();
    if (envCache && (now - envCacheTime) < ENV_CACHE_TTL_MS) {
      return res.json(envCache);
    }

    try {
      if (fs.existsSync(_cfgPath)) {
        const fileCfg = JSON.parse(fs.readFileSync(_cfgPath, 'utf8'));
        Object.assign(_cfg, fileCfg);
      ws.invalidateOverlayConfigCache();
      envCache = null; // Invalidate /env cache
      }
    } catch (e) {
      _dbg('Failed to reload config from disk:', e.message);
    }

    const overlayConfig = { ...DEFAULT_OVERLAY, ...(_cfg.overlay || {}) };
    const mergedCfg = {
      ..._cfg,
      overlay: overlayConfig,
      defaultOverlay: DEFAULT_OVERLAY,
      dashboardPassword: _cfg.dashboardPassword ? '***' : ''
    };

    const safeCfg = JSON.parse(JSON.stringify(mergedCfg));
    if (safeCfg.twitch) {
      safeCfg.hasOAuthToken = !!(_cfg.twitch?.botOAuthToken && _cfg.twitch.botOAuthToken.trim() !== '');
      safeCfg.twitch.botOAuthToken = undefined;
      safeCfg.twitch.refreshToken = undefined;
    }

    envCache = safeCfg;
    envCacheTime = now;
    res.json(safeCfg);
  });

  // User endpoints
  app.get('/api/user/:id', (req, res) => {
    const id = req.params.id.toLowerCase();
    try {
      const row = _db.prepare('SELECT id, display_name, assigned_skin FROM users WHERE id = ?').get(id);
      if (!row) {
        return res.json({ id, display_name: id, assigned_skin: 'default' });
      }
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/viewer/profile', (req, res) => {
    res.json({
      id: 'viewer',
      display_name: 'Viewer',
      skins: ['default'],
      assigned_skin: 'default'
    });
  });

  app.post('/api/viewer/updateSkin', (req, res) => {
    const { skinId } = req.body;
    if (!skinId) return res.status(400).json({ error: 'missing skinId' });
    try {
      const allSkins = twitch.detectSkinsFromAssets();
      const validSkin = allSkins.find(s => s.id === skinId);
      if (!validSkin) return res.status(400).json({ error: 'Invalid skin ID' });
      res.json({ ok: true, message: 'Skin updated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Local control: Assign skin
  app.post('/api/local/assignSkin', (req, res) => {
    const { userId, skinId } = req.body;
    if (!isValidUsername(userId)) return res.status(400).json({ error: 'Invalid username' });
    if (!isValidSkinId(skinId)) return res.status(400).json({ error: 'Invalid skin ID' });
    const userLower = userId.toLowerCase();
    try {
      _db.prepare('INSERT OR REPLACE INTO users (id, display_name, assigned_skin) VALUES (?,?,?)')
        .run(userLower, userLower, skinId);
      res.json({ ok: true, assigned_skin: skinId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Local control: List users
  app.get('/api/local/users', (req, res) => {
    try {
      const rows = _db.prepare('SELECT id, display_name, assigned_skin FROM users ORDER BY id LIMIT 100').all();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Local control: Connect/Disconnect Twitch
  app.post('/api/local/connectTwitch', (req, res) => {
    try {
      if (!_cfg.twitch.botOAuthToken || _cfg.twitch.botOAuthToken === 'oauth:your_bot_oauth_token_here' || _cfg.twitch.botOAuthToken.trim() === '') {
        return res.status(400).json({ error: 'OAuth token not found. Please generate one first.' });
      }
      if (!_cfg.botUsername || !_cfg.channel) {
        return res.status(400).json({ error: 'Bot username and channel must be set in config.' });
      }
      twitch.connectTwitchBot();
      res.json({ ok: true, message: 'Twitch connection initiated' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/local/disconnectTwitch', (req, res) => {
    try {
      const twitchClient = twitch.getTwitchClient();
      if (twitchClient) {
        twitchClient.disconnect();
        res.json({ ok: true, message: 'Twitch bot disconnected' });
      } else {
        res.json({ ok: true, message: 'Twitch bot was not connected' });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Local control: Save config
  app.post('/api/local/saveConfig', (req, res) => {
    try {
      const { deepMerge } = require('./lib/util');
      const newCfg = req.body;
      const merged = deepMerge(_cfg, newCfg);
      delete merged.skins;
      if (_cfg.skins) delete _cfg.skins;

      const tokenForMemory = _cfg.twitch?.botOAuthToken || '';
      const refreshTokenForMemory = _cfg.twitch?.refreshToken || '';
      if (merged.twitch) {
        merged.twitch.botOAuthToken = tokenForMemory;
        merged.twitch.refreshToken = refreshTokenForMemory;
      }

      // Preserve real dashboard password if masked value was sent back
      if (merged.dashboardPassword === '***') {
        merged.dashboardPassword = _cfg.dashboardPassword || '';
      }

      fs.writeFileSync(_cfgPath, JSON.stringify(merged, null, 2));
      Object.assign(_cfg, merged);
      ws.invalidateOverlayConfigCache();
      envCache = null; // Invalidate /env cache so loadConfig gets fresh data

      res.json({ ok: true, message: 'Config saved' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Local control: Apply settings
  app.post('/api/local/applySettings', (req, res) => {
    try {
      const settings = req.body;
      if (typeof settings !== 'object' || settings === null) {
        return res.status(400).json({ error: 'Invalid settings format' });
      }

      if (!_cfg.debug) _cfg.debug = {};

      if (typeof settings.serverDebug === 'boolean') _cfg.debug.serverDebug = settings.serverDebug;
      if (typeof settings.twitchDebug === 'boolean') _cfg.debug.twitchDebug = settings.twitchDebug;
      if (typeof settings.twitchAuthErrors === 'boolean') _cfg.debug.twitchAuthErrors = settings.twitchAuthErrors;
      if (typeof settings.twitchOtherErrors === 'boolean') _cfg.debug.twitchOtherErrors = settings.twitchOtherErrors;
      if (typeof settings.verboseMessages === 'boolean') _cfg.debug.verboseMessages = settings.verboseMessages;
      if (typeof settings.logToFile === 'boolean') {
        const { initFileLogger, closeFileLogger, getLogStream } = require('./lib/logger');
        _cfg.debug.logToFile = settings.logToFile;
        if (settings.logToFile && !getLogStream()) {
          initFileLogger();
        } else if (!settings.logToFile && getLogStream()) {
          closeFileLogger();
        }
      }

      const configToSave = { ..._cfg };
      configToSave.twitch = { ...configToSave.twitch };
      configToSave.twitch.botOAuthToken = '';
      delete configToSave.skins;
      fs.writeFileSync(_cfgPath, JSON.stringify(configToSave, null, 2));

      ws.invalidateOverlayConfigCache();
      res.json({ ok: true, message: 'Settings applied', settings: _cfg.debug });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Local control: Clear sprites
  app.post('/api/local/clearSprites', (req, res) => {
    ws.clearServerSprites();
    ws.broadcast({ type: 'cmd', cmd: 'clearSprites' });
    res.json({ ok: true });
  });

  app.post('/api/local/clearSpritesServer', (req, res) => {
    try {
      ws.clearServerSprites();
      ws.broadcast({ type: 'cmd', cmd: 'clearSprites' });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Local control: Reset user
  app.post('/api/local/resetUser', (req, res) => {
    const { id } = req.body;
    if (!isValidUsername(id)) return res.status(400).json({ error: 'Invalid username' });
    try {
      _db.prepare('DELETE FROM users WHERE id=?').run(id.toLowerCase());
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/local/resetAll', (req, res) => {
    try {
      _db.prepare('DELETE FROM users').run();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Exclusion endpoints
  app.get('/api/local/excluded', (req, res) => {
    try {
      const rows = _db.prepare('SELECT id, reason FROM excluded_users ORDER BY id LIMIT 100').all();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/local/exclude', (req, res) => {
    const { userId, reason } = req.body;
    if (!isValidUsername(userId)) return res.status(400).json({ error: 'Invalid username' });
    try {
      _db.prepare('INSERT OR REPLACE INTO excluded_users (id, reason) VALUES (?,?)')
        .run(userId.toLowerCase(), reason || '');
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/local/unexclude', (req, res) => {
    const { userId } = req.body;
    if (!isValidUsername(userId)) return res.status(400).json({ error: 'Invalid username' });
    try {
      _db.prepare('DELETE FROM excluded_users WHERE id=?').run(userId.toLowerCase());
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/local/updateExclusionReason', (req, res) => {
    const { userId, reason } = req.body;
    if (!isValidUsername(userId)) return res.status(400).json({ error: 'Invalid username' });
    try {
      _db.prepare('UPDATE excluded_users SET reason = ? WHERE id = ?')
        .run(reason || '', userId.toLowerCase());
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Stats
  app.get('/api/stats', (req, res) => {
    const now = Date.now();
    if (statsCache && (now - statsCacheTime) < STATS_CACHE_TTL_MS) {
      return res.json(statsCache);
    }
    res.json(refreshStatsCache() || { total_users: 0, custom_skins: 0, default_skins: 0 });
  });

  // Overlay refresh
  app.post('/api/local/refreshAllOverlays', (req, res) => {
    try {
      ws.broadcast({ type: 'cmd', cmd: 'refresh' });
      const wss = ws.getWss();
      const clientCount = wss ? wss.clients.size : 0;
      res.json({ ok: true, clients: clientCount });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Restart server
  app.post('/api/local/restartServer', (req, res) => {
    res.json({ ok: true, message: 'Server restarting...' });
    process.exit(0);
  });

  // Health check
  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Dashboard presence
  app.get('/api/dashboard/ping', (req, res) => {
    dashboardLastSeen = Date.now();
    res.json({ status: 'ok', timestamp: dashboardLastSeen, stopPinging: dashboardConfirmedOpen });
  });

  app.get('/api/dashboard/isOpen', (req, res) => {
    const isOpen = dashboardLastSeen && (Date.now() - dashboardLastSeen) < 10000;
    res.json({ isOpen, lastSeen: dashboardLastSeen });
  });

  // Chat respond
  app.post('/api/chat/respond', (req, res) => {
    const { username, message } = req.body;
    if (!username || !message || typeof username !== 'string' || typeof message !== 'string' ||
        username.length > 25 || message.length > 500) {
      return res.status(400).json({ error: 'Invalid username or message' });
    }

    const sanitizedUsername = username.replace(/[^\p{L}\p{N}_]/gu, '_');
    const twitchClient = twitch.getTwitchClient();

    try {
      const state = twitchClient && twitchClient.readyState ? twitchClient.readyState() : null;
      if (twitchClient && state && (state === 1 || state === 'OPEN')) {
        const fullMessage = `@${sanitizedUsername}, ${message}`;
        twitchClient.say(_cfg.channel, fullMessage).then(() => {
          res.json({ ok: true });
        }).catch(err => {
          res.status(500).json({ error: err.message });
        });
      } else {
        res.status(400).json({ error: 'Twitch not connected' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dashboard chat — sends messages/commands from the dashboard to the overlay and Twitch
  app.post('/api/local/sendChat', (req, res) => {
    const { username, message } = req.body;
    if (!username || !message || typeof username !== 'string' || typeof message !== 'string' ||
        username.length > 25 || message.length > 500) {
      return res.status(400).json({ error: 'Invalid username or message' });
    }

    const sanitizedUsername = username.replace(/[^\p{L}\p{N}_]/gu, '_');
    const text = message.trim();
    const isCommand = text.startsWith('!');

    let commandResult = null;
    if (isCommand) {
      commandResult = twitch.processServerCommand(sanitizedUsername, text, { badges: { broadcaster: true, moderator: true } });
    }

    // Broadcast chat message to all overlay clients
    ws.broadcast({
      type: 'chat',
      username: sanitizedUsername,
      message: text,
      tags: { badges: { broadcaster: true } },
      commandResult: commandResult
    });

    // Send to Twitch chat (only non-command messages)
    if (!isCommand) {
      const twitchClient = twitch.getTwitchClient();
      try {
        const state = twitchClient && twitchClient.readyState ? twitchClient.readyState() : null;
        if (twitchClient && state && (state === 1 || state === 'OPEN')) {
          twitchClient.say(_cfg.channel, text).catch(() => {});
        }
      } catch (e) { /* Twitch not connected, skip */ }
    }

    res.json({ ok: true, commandResult: commandResult ? commandResult.result : null });
  });

  // ── Cloudflare Tunnel Management ────────────────────────────────────────
  let tunnelProcess = null;
  let tunnelUrl = null;
  let tunnelStatus = 'stopped'; // stopped | starting | running | error
  let tunnelError = null;

  app.get('/api/local/tunnelStatus', (req, res) => {
    res.json({ status: tunnelStatus, url: tunnelUrl, error: tunnelError });
  });

  app.post('/api/local/startTunnel', (req, res) => {
    if (tunnelProcess) {
      // Check if process is actually still alive
      try {
        process.kill(tunnelProcess.pid, 0); // signal 0 checks if process exists
      } catch (e) {
        // Process is dead, clean up stale state
        tunnelProcess = null;
        tunnelStatus = 'stopped';
        tunnelUrl = null;
      }
    }
    if (tunnelProcess) {
      return res.json({ ok: true, message: 'Tunnel already running', url: tunnelUrl, status: tunnelStatus });
    }

    tunnelStatus = 'starting';
    tunnelError = null;
    tunnelUrl = null;

    try {
      const { spawn } = require('child_process');
      tunnelProcess = spawn('npx', ['cloudflared', 'tunnel', '--url', `http://localhost:${_cfg.serverPort || 8080}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });

      let outputBuffer = '';

      function processOutput(data) {
        outputBuffer += data.toString();
        const match = outputBuffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match && !tunnelUrl) {
          tunnelUrl = match[0];
          tunnelStatus = 'running';
          _dbg('Cloudflare tunnel URL:', tunnelUrl);
        }
      }

      tunnelProcess.stdout.on('data', processOutput);
      tunnelProcess.stderr.on('data', processOutput);

      tunnelProcess.on('close', (code) => {
        _dbg('Cloudflare tunnel closed with code:', code);
        tunnelProcess = null;
        tunnelUrl = null;
        tunnelStatus = 'stopped';
      });

      tunnelProcess.on('error', (err) => {
        _dbg('Cloudflare tunnel error:', err.message);
        tunnelProcess = null;
        tunnelStatus = 'error';
        tunnelError = err.message;
      });

      // Wait up to 15 seconds for the URL to appear
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (tunnelUrl || tunnelStatus === 'error' || Date.now() - startTime > 15000) {
          clearInterval(checkInterval);
          if (!tunnelUrl && tunnelStatus !== 'error') {
            tunnelStatus = 'error';
            tunnelError = 'Timed out waiting for tunnel URL. Check server console for details.';
          }
        }
      }, 500);

      res.json({ ok: true, message: 'Tunnel starting...', status: 'starting' });
    } catch (err) {
      tunnelStatus = 'error';
      tunnelError = err.message;
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/local/stopTunnel', (req, res) => {
    if (!tunnelProcess) {
      tunnelStatus = 'stopped';
      tunnelUrl = null;
      return res.json({ ok: true, message: 'Tunnel was not running' });
    }
    try {
      const pid = tunnelProcess.pid;
      if (process.platform === 'win32') {
        // Windows: kill entire process tree (shell + cloudflared child)
        require('child_process').execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
      } else {
        tunnelProcess.kill('SIGTERM');
      }
      tunnelProcess = null;
      tunnelUrl = null;
      tunnelStatus = 'stopped';
      tunnelError = null;
      res.json({ ok: true, message: 'Tunnel stopped' });
    } catch (err) {
      tunnelProcess = null;
      tunnelUrl = null;
      tunnelStatus = 'stopped';
      tunnelError = null;
      res.json({ ok: true, message: 'Tunnel stopped' });
    }
  });

  // Error handler
  app.use((err, req, res, next) => {
    const isDevelopment = _cfg.debug?.serverDebug === true;
    const errorId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
    console.error(`[Error ${errorId}]`, {
      message: err.message,
      stack: isDevelopment ? err.stack : undefined,
      url: req.url,
      method: req.method,
      ip: req.ip || req.connection.remoteAddress
    });
    if (!res.headersSent) {
      const response = { error: 'Internal server error', errorId };
      if (isDevelopment) {
        response.message = err.message;
        response.stack = err.stack;
      }
      res.status(500).json(response);
    }
  });

  // OAuth endpoints
  app.get('/auth/twitch', (req, res) => {
    console.log('→ GET /auth/twitch - redirecting to Twitch OAuth');
    const state = crypto.randomBytes(16).toString('hex');
    pendingOAuthStates.set(state, Date.now());
    const oauthRedirectUrl = `http://localhost:${_cfg.serverPort || 8080}/auth/callback`;
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${_cfg.twitch.clientId}&redirect_uri=${encodeURIComponent(oauthRedirectUrl)}&response_type=code&scope=${encodeURIComponent('chat:read chat:edit')}&state=${state}`;
    console.log('→ Redirecting to:', url.substring(0, 80) + '...');
    res.redirect(url);
  });

  app.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.status(400).send('Missing code');
    if (!state || !pendingOAuthStates.has(state)) {
      return res.status(400).send('Invalid or expired state parameter. Please try again.');
    }
    pendingOAuthStates.delete(state);
    try {
      const oauthRedirectUrl = `http://localhost:${_cfg.serverPort || 8080}/auth/callback`;
      const params = new URLSearchParams({
        client_id: _cfg.twitch.clientId,
        client_secret: _cfg.twitch.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: oauthRedirectUrl
      });
      const tokenResp = await axios.post('https://id.twitch.tv/oauth2/token', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
      });
      const { access_token, refresh_token, expires_in } = tokenResp.data;
      _cfg.twitch.botOAuthToken = access_token;
      twitch.setBotTokenInfo({ access_token, refresh_token, expires_at: Date.now() + (expires_in * 1000) });

      if (refresh_token) {
        _cfg.twitch.refreshToken = refresh_token;
        try {
          fs.writeFileSync(_cfgPath, JSON.stringify(_cfg, null, 2));
        } catch (e) {
          _dbg('Failed to save refresh token:', e.message);
        }
      }

      const dashboardUrl = `http://localhost:${_cfg.serverPort || 8080}/`;
      res.send(`
        <html><body style="font-family:sans-serif;padding:20px;background:#111;color:#fff">
          <h2>✓ OAuth Token Generated</h2>
          <p>Refresh token saved. Use the dashboard to connect to Twitch.</p>
          <p><a href="${dashboardUrl}" style="color:#0af">Go to Local Control Dashboard</a></p>
          <p>Redirecting in 3 seconds...</p>
          <script>setTimeout(() => { window.location.href = "${dashboardUrl}"; }, 3000);</script>
        </body></html>
      `);
    } catch (e) {
      _dbg('OAuth callback error:', e.message);
      res.status(500).send('OAuth failed: ' + (e.response?.data?.message || e.message));
    }
  });

  // Clean up expired OAuth states every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [state, timestamp] of pendingOAuthStates.entries()) {
      if (now - timestamp > OAUTH_STATE_TTL_MS) {
        pendingOAuthStates.delete(state);
      }
    }
  }, 5 * 60 * 1000);
}

module.exports = {
  initRoutes,
  broadcastStats,
  refreshStatsCache,
  setDashboardConfirmedOpen
};
