const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const { isValidUsername, isValidSkinId, rateLimiter } = require('./lib/util');
const { hashPassword, verifyPassword, isHashedPassword } = require('./lib/password');
const { sanitizeConfigInput, sanitizeConfigForDisk } = require('./lib/config-safety');
const {
  normalizeAssetFolder,
  isValidAssetFolder,
  isSafeAssetName,
  hasAllowedAssetExtension,
  sanitizeUploadFilename,
  resolveAssetPath,
  getAssetMimeType
} = require('./lib/asset-paths');
const twitch = require('./twitch');
const ws = require('./websocket');
const { DEFAULT_OVERLAY } = require('./config');
const storage = require('./storage/index');

const PROJECT_ROOT = path.join(__dirname, '..');
const ASSETS_ROOT = process.env.STREAM_SPRITES_ASSETS_DIR
  ? path.resolve(process.env.STREAM_SPRITES_ASSETS_DIR)
  : path.join(PROJECT_ROOT, 'assets');
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

// Shared state (set by initRoutes)
let _cfg, _cfgPath, _driver, _dbg, _app;

// Stats cache
let statsCache = null;
let statsCacheTime = 0;
const STATS_CACHE_TTL_MS = 3000;

function invalidateStatsCache() {
  statsCache = null;
  statsCacheTime = 0;
}

async function refreshStatsCache() {
  try {
    const stats = await _driver.getStats();
    statsCache = stats;
    statsCacheTime = Date.now();
  } catch (err) {
    _dbg('Error refreshing stats cache:', err.message);
  }
  return statsCache;
}

async function broadcastStats() {
  const stats = await refreshStatsCache();
  if (stats) {
    const msg = JSON.stringify({ type: 'stats', data: stats });
    const wss = ws.getWss();
    if (wss) {
      wss.clients.forEach(c => {
        if (c.readyState === 1) {
          try { c.send(msg); } catch (e) { /* client disconnected mid-send */ }
        }
      });
    }
  }
}

// Env caches are kept separate so a trusted request can never leak
// secrets through a response cached for an unauthenticated client.
let envCachePublic = null;
let envCachePublicTime = 0;
let envCacheTrusted = null;
let envCacheTrustedTime = 0;
const ENV_CACHE_TTL_MS = 10000;

function invalidateEnvCache() {
  envCachePublic = null;
  envCachePublicTime = 0;
  envCacheTrusted = null;
  envCacheTrustedTime = 0;
}

// OAuth state management
const pendingOAuthStates = new Map();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

// Dashboard presence
let dashboardLastSeen = null;
let dashboardConfirmedOpen = false;

function setDashboardConfirmedOpen(v) {
  dashboardConfirmedOpen = v;
}

function initRoutes(app, cfg, cfgPath, driver, dbg) {
  _app = app;
  _cfg = cfg;
  _cfgPath = cfgPath;
  _driver = driver;
  _dbg = dbg;

  // Rate limiter
  app.use('/api/', rateLimiter);

  // ── Dashboard auth (remote access only) ──────────────────────────────────
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

  // CSRF token management
  const csrfTokens = new Map();
  const CSRF_TTL_MS = 60 * 60 * 1000;

  function generateCsrfToken() {
    const token = crypto.randomBytes(32).toString('hex');
    csrfTokens.set(token, Date.now());
    return token;
  }

  function validateCsrfToken(req) {
    const cookie = req.headers.cookie || '';
    const cookieMatch = cookie.match(/csrf_token=([^;]+)/);
    if (!cookieMatch) return false;
    const cookieToken = cookieMatch[1];
    const bodyToken = req.body?._csrf || req.headers['x-csrf-token'];
    if (!bodyToken || bodyToken !== cookieToken) return false;
    if (!csrfTokens.has(cookieToken)) return false;
    return true;
  }

  // Clean expired CSRF tokens every 10 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [token, ts] of csrfTokens) {
      if (now - ts > CSRF_TTL_MS) csrfTokens.delete(token);
    }
  }, 10 * 60 * 1000);

  const loginAttempts = new Map();

  function isLoopbackAddress(address) {
    if (!address || typeof address !== 'string') return false;
    const normalized = address.replace(/^::ffff:/i, '');
    return normalized === '127.0.0.1' || normalized === '::1';
  }

  function requestHostname(req) {
    const host = String(req.headers.host || '').toLowerCase();
    if (!host) return '';
    if (host.startsWith('[')) {
      const end = host.indexOf(']');
      return end === -1 ? host : host.slice(0, end + 1);
    }
    return host.split(':')[0];
  }

  function isSameOriginRequest(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      const parsed = new URL(origin);
      const host = String(req.headers.host || '').toLowerCase();
      return !!host && parsed.host.toLowerCase() === host;
    } catch (e) {
      return false;
    }
  }

  // A request is local only when it is genuinely loopback, has a local Host
  // header, is not proxied from elsewhere, and is not cross-origin.
  function isLocalRequest(req) {
    if (!isLoopbackAddress(req.socket?.remoteAddress)) return false;
    const hostname = requestHostname(req);
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '[::1]') return false;

    const forwarded = req.headers['cf-connecting-ip'] ||
      req.headers['x-real-ip'] ||
      String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded && !isLoopbackAddress(String(forwarded).trim())) return false;

    return isSameOriginRequest(req);
  }

  function isPublicRequest(req) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const p = req.path;
    return p === '/env' || p === '/healthz' || p === '/favicon.ico' ||
      p === '/api/skins' || p === '/api/skins/auto' ||
      p === '/auth/callback' ||
      p.startsWith('/api/user/') ||
      /^\/api\/assets\/[^/]+\/[^/]+$/.test(p) ||
      p === '/overlay' || p.startsWith('/overlay/') ||
      p === '/assets' || p.startsWith('/assets/');
  }

  function isSecureRequest(req) {
    return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  }

  function requestBaseUrl(req) {
    const protocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'
      ? 'https'
      : 'http';
    const host = String(req.headers.host || `localhost:${_cfg.serverPort || 8080}`)
      .replace(/[^a-zA-Z0-9.\-:\[\]]/g, '');
    return `${protocol}://${host}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);
  }

  // Behind a loopback tunnel/proxy, use the forwarded client address so one
  // attacker cannot lock out every remote dashboard user.
  function clientAddress(req) {
    const socketAddress = req.socket?.remoteAddress;
    if (isLoopbackAddress(socketAddress)) {
      const forwarded = req.headers['cf-connecting-ip'] ||
        String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (forwarded) return String(forwarded).trim();
    }
    return req.ip || socketAddress || 'unknown';
  }

  function loginKey(req) {
    return clientAddress(req);
  }

  function getLoginLock(req) {
    const entry = loginAttempts.get(loginKey(req));
    if (!entry) return 0;
    if (entry.lockedUntil > Date.now()) return entry.lockedUntil - Date.now();
    if (Date.now() - entry.firstFailure > LOGIN_WINDOW_MS) {
      loginAttempts.delete(loginKey(req));
    }
    return 0;
  }

  function recordLoginFailure(req) {
    const key = loginKey(req);
    const now = Date.now();
    let entry = loginAttempts.get(key);
    if (!entry || now - entry.firstFailure > LOGIN_WINDOW_MS) {
      entry = { count: 0, firstFailure: now, lockedUntil: 0 };
    }
    entry.count++;
    if (entry.count >= LOGIN_MAX_FAILURES) {
      entry.lockedUntil = now + LOGIN_LOCKOUT_MS;
      entry.count = 0;
      entry.firstFailure = now;
    }
    loginAttempts.set(key, entry);

    if (loginAttempts.size > 1000) {
      const oldestKey = loginAttempts.keys().next().value;
      loginAttempts.delete(oldestKey);
    }
  }

  function sessionTokenFromCookie(req) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/dash_session=([^;]+)/);
    return match ? match[1] : null;
  }

  function isAuthenticated(req) {
    const token = sessionTokenFromCookie(req);
    if (!token) return false;
    const session = activeSessions.get(token);
    return !!(session && session.expires > Date.now());
  }

// Explicit favicon route (before auth to avoid any issues)
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(PROJECT_ROOT, 'favicon.ico'));
});

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Only read-only overlay/config endpoints are CORS-enabled, and only without
// credentials. Everything else must be same-origin.
app.use((req, res, next) => {
  if (isPublicRequest(req)) {
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Vary', 'Origin');
    }
    return next();
  }
  if (req.headers['sec-fetch-site'] === 'cross-site' || !isSameOriginRequest(req)) {
    return res.status(403).json({ error: 'Cross-origin request blocked' });
  }
  next();
});

// Auth middleware: protect dashboard and dashboard API for remote access
app.use((req, res, next) => {
  if (isPublicRequest(req)) return next();
  if (isLocalRequest(req)) return next();
  if (isAuthenticated(req)) return next();
  if (req.path === '/api/dashboard/login') return next();
  if (req.path === '/api/dashboard/setup') {
    return res.status(403).json({ error: 'Dashboard setup must be completed from the local machine' });
  }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });

  // If no password is configured yet, show the setup page. Setting the
  // password itself is restricted to local requests above.
  if (!_cfg.dashboardPassword || _cfg.dashboardPassword.trim() === '') {
    return res.sendFile(path.join(PROJECT_ROOT, 'dashboard', 'setup.html'));
  }
  res.sendFile(path.join(PROJECT_ROOT, 'dashboard', 'login.html'));
});

  // Setup endpoint (first-time password creation, local machine only)
  app.post('/api/dashboard/setup', async (req, res) => {
    if (!isLocalRequest(req)) {
      return res.status(403).json({ error: 'Dashboard setup must be completed from the local machine' });
    }
    if (_cfg.dashboardPassword && _cfg.dashboardPassword.trim() !== '') {
      return res.status(403).json({ error: 'Password already configured' });
    }
    const { password: input } = req.body;
    if (!input || typeof input !== 'string' || input.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    // Store only a scrypt hash, never the plaintext password.
    const passwordHash = hashPassword(input);
    _cfg.dashboardPassword = passwordHash;
    try {
      const current = await _driver.loadConfig(_cfgPath) || {};
      current.dashboardPassword = passwordHash;
      await _driver.saveConfig(_cfgPath, sanitizeConfigForDisk(current));
      invalidateEnvCache();
    } catch (e) {
      return res.status(500).json({ error: 'Failed to save password' });
    }
    // Create session and log in immediately
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.set(token, { expires: Date.now() + SESSION_TTL_MS });
    const secure = isSecureRequest(req) ? '; Secure' : '';
    res.setHeader('Set-Cookie', `dash_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
    res.json({ ok: true });
  });

  // Login endpoint
  app.post('/api/dashboard/login', async (req, res) => {
    const lockRemaining = getLoginLock(req);
    if (lockRemaining > 0) {
      res.setHeader('Retry-After', Math.ceil(lockRemaining / 1000));
      return res.status(429).json({ error: 'Too many failed login attempts. Try again later.' });
    }

    const password = _cfg.dashboardPassword;
    if (!password || password.trim() === '') return res.status(403).json({ error: 'Password not configured yet' });
    const { password: input } = req.body;
    if (!input || typeof input !== 'string') return res.status(400).json({ error: 'Password required' });

    if (!verifyPassword(input, password)) {
      recordLoginFailure(req);
      return res.status(401).json({ error: 'Wrong password' });
    }

    // Transparently upgrade legacy plaintext passwords.
    if (!isHashedPassword(password)) {
      const upgraded = hashPassword(input);
      _cfg.dashboardPassword = upgraded;
      try {
        const current = await _driver.loadConfig(_cfgPath) || {};
        current.dashboardPassword = upgraded;
        await _driver.saveConfig(_cfgPath, sanitizeConfigForDisk(current));
        invalidateEnvCache();
      } catch (e) {
        _dbg('Failed to upgrade dashboard password hash:', e.message);
      }
    }

    loginAttempts.delete(loginKey(req));
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.set(token, { expires: Date.now() + SESSION_TTL_MS });
    const secure = isSecureRequest(req) ? '; Secure' : '';
    res.setHeader('Set-Cookie', `dash_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
    res.json({ ok: true });
  });

  // Only public UI directories are served. The project root previously exposed
  // server/.env, database files, and logs via express.static.
  app.use('/overlay', express.static(path.join(PROJECT_ROOT, 'overlay')));
  app.use('/dashboard', express.static(path.join(PROJECT_ROOT, 'dashboard')));
  app.use('/assets', express.static(ASSETS_ROOT, { dotfiles: 'ignore', index: false }));

  app.post('/api/dashboard/logout', (req, res) => {
    const token = sessionTokenFromCookie(req);
    if (token) activeSessions.delete(token);
    const secure = isSecureRequest(req) ? '; Secure' : '';
    res.setHeader('Set-Cookie', `dash_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
    res.json({ ok: true });
  });

  // Serve dashboard at root
  app.get('/', (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, 'index.html'));
  });

  // Skin endpoints
  app.get('/api/skins', async (req, res) => {
    try {
      res.json(await twitch.detectSkinsFromAssetsAsync());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/skins/auto', async (req, res) => {
    try {
      res.json(await twitch.detectSkinsFromAssetsAsync());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Config endpoint
  app.get('/env', async (req, res) => {
    const now = Date.now();
    const trusted = isLocalRequest(req) || isAuthenticated(req);
    const cache = trusted ? envCacheTrusted : envCachePublic;
    const cacheTime = trusted ? envCacheTrustedTime : envCachePublicTime;

    let safeCfg;
    if (cache && (now - cacheTime) < ENV_CACHE_TTL_MS) {
      safeCfg = { ...cache };
    } else {
      try {
        const fileCfg = await _driver.loadConfig(_cfgPath);
        if (fileCfg) {
          const { stripRuntimeConfigKeys } = require('./lib/util');
          stripRuntimeConfigKeys(fileCfg);
          Object.assign(_cfg, fileCfg);
          ws.invalidateOverlayConfigCache();
          invalidateEnvCache();
        }
      } catch (e) {
        _dbg('Failed to reload config:', e.message);
      }

      const overlayConfig = { ...DEFAULT_OVERLAY, ...(_cfg.overlay || {}) };
      const hasOAuthToken = !!(_cfg.twitch?.botOAuthToken && _cfg.twitch.botOAuthToken.trim() !== '');
      const base = {
        useServer: _cfg.useServer !== false,
        serverPort: _cfg.serverPort || 8080,
        channel: _cfg.channel || '',
        botUsername: _cfg.botUsername || '',
        autoGenerateOAuth: !!_cfg.autoGenerateOAuth,
        autoConnect: !!_cfg.autoConnect,
        debug: _cfg.debug || {},
        overlay: overlayConfig,
        defaultOverlay: DEFAULT_OVERLAY,
        hasOAuthToken
      };

      if (trusted) {
        safeCfg = {
          ..._cfg,
          ...base,
          twitch: {
            ...(_cfg.twitch || {}),
            botOAuthToken: undefined,
            refreshToken: undefined
          },
          dashboardPassword: _cfg.dashboardPassword ? '***' : ''
        };
        envCacheTrusted = JSON.parse(JSON.stringify(safeCfg));
        envCacheTrustedTime = now;
      } else {
        // Public config intentionally omits Twitch credentials and secrets.
        safeCfg = base;
        envCachePublic = JSON.parse(JSON.stringify(base));
        envCachePublicTime = now;
      }
    }

    safeCfg.isLocalhost = isLocalRequest(req);
    res.json(safeCfg);
  });

  // User endpoints
  app.get('/api/user/:id', async (req, res) => {
    const id = req.params.id.toLowerCase();
    try {
      const row = await _driver.getUser(id);
      if (!row) {
        return res.json({ id, display_name: id, assigned_skin: 'default' });
      }
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Local control: Assign skin
  app.post('/api/local/assignSkin', async (req, res) => {
    const { userId, skinId } = req.body;
    if (!isValidUsername(userId)) return res.status(400).json({ error: 'Invalid username' });
    if (!isValidSkinId(skinId)) return res.status(400).json({ error: 'Invalid skin ID' });
    try {
      const skins = await twitch.detectSkinsFromAssetsAsync();
      if (!skins.some(s => s.id === skinId)) {
        return res.status(400).json({ error: 'Unknown skin ID' });
      }
      await _driver.assignSkin(userId, skinId);
      const liveSprite = ws.serverSprites.get(userId.toLowerCase());
      if (liveSprite) {
        liveSprite.skin = skinId;
        liveSprite.lastActivity = Date.now();
        ws.setSpriteDirty(true);
        ws.broadcastPhysicsState();
      }
      invalidateStatsCache();
      res.json({ ok: true, assigned_skin: skinId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Local control: List users
  app.get('/api/local/users', async (req, res) => {
    try {
      const limit = Math.min(5000, Math.max(1, parseInt(req.query.limit, 10) || 1000));
      const rows = await _driver.listUsers(limit);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Local control: Connect/Disconnect Twitch
  app.post('/api/local/connectTwitch', async (req, res) => {
    try {
      if (!_cfg.twitch.botOAuthToken || _cfg.twitch.botOAuthToken === 'oauth:your_bot_oauth_token_here' || _cfg.twitch.botOAuthToken.trim() === '') {
        return res.status(400).json({ error: 'OAuth token not found. Please generate one first.' });
      }
      if (!_cfg.botUsername || !_cfg.channel) {
        return res.status(400).json({ error: 'Bot username and channel must be set in config.' });
      }
      await twitch.connectTwitchBot();
      res.json({ ok: true, message: 'Twitch connection initiated' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/local/disconnectTwitch', async (req, res) => {
    try {
      const wasConnected = await twitch.disconnectTwitchBot();
      res.json({
        ok: true,
        message: wasConnected ? 'Twitch bot disconnected' : 'Twitch bot was not connected'
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Local control: Save config
  app.post('/api/local/saveConfig', async (req, res) => {
    try {
      const { deepMerge } = require('./lib/util');
      const sanitizedInput = sanitizeConfigInput(req.body);
      if (!sanitizedInput || Object.keys(sanitizedInput).length === 0) {
        return res.status(400).json({ error: 'Invalid config payload' });
      }

      // New passwords must never be written as plaintext. The masked value is
      // resolved later, and an empty value intentionally clears the password.
      if (sanitizedInput.dashboardPassword &&
          sanitizedInput.dashboardPassword !== '***' &&
          !isHashedPassword(sanitizedInput.dashboardPassword)) {
        sanitizedInput.dashboardPassword = hashPassword(sanitizedInput.dashboardPassword);
      }

      const previousPassword = _cfg.dashboardPassword || '';
      const merged = deepMerge(_cfg, sanitizedInput);

      // Tokens are never accepted from the client and stay memory-only.
      merged.twitch = merged.twitch || {};
      merged.twitch.botOAuthToken = _cfg.twitch?.botOAuthToken || '';
      merged.twitch.refreshToken = _cfg.twitch?.refreshToken || '';

      // Preserve the real dashboard password if the masked value was sent back.
      if (merged.dashboardPassword === '***') {
        merged.dashboardPassword = _cfg.dashboardPassword || '';
      }

      const persisted = sanitizeConfigForDisk(merged);
      await _driver.saveConfig(_cfgPath, persisted);

      // Keep memory aligned with the sanitized on-disk shape while retaining
      // the access token that is intentionally never persisted.
      for (const key of Object.keys(_cfg)) delete _cfg[key];
      Object.assign(_cfg, persisted, {
        twitch: {
          ...persisted.twitch,
          botOAuthToken: merged.twitch.botOAuthToken,
          refreshToken: merged.twitch.refreshToken
        }
      });

      // Changing the password invalidates other dashboard sessions while
      // keeping the session that made the change alive.
      if ((persisted.dashboardPassword || '') !== previousPassword) {
        const keepToken = sessionTokenFromCookie(req);
        for (const token of Array.from(activeSessions.keys())) {
          if (token !== keepToken) activeSessions.delete(token);
        }
      }

      ws.invalidateOverlayConfigCache();
      invalidateEnvCache();

      res.json({ ok: true, message: 'Config saved' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Local control: Apply settings
  app.post('/api/local/applySettings', async (req, res) => {
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

      await _driver.saveConfig(_cfgPath, sanitizeConfigForDisk(_cfg));

      ws.invalidateOverlayConfigCache();
      invalidateEnvCache();
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

  // Local control: Reset user
  app.post('/api/local/resetUser', async (req, res) => {
    const { id } = req.body;
    if (!isValidUsername(id)) return res.status(400).json({ error: 'Invalid username' });
    try {
      await _driver.deleteUser(id);
      const liveSprite = ws.serverSprites.get(id.toLowerCase());
      if (liveSprite) {
        liveSprite.skin = 'default';
        liveSprite.lastActivity = Date.now();
        ws.setSpriteDirty(true);
        ws.broadcastPhysicsState();
      }
      invalidateStatsCache();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/local/resetAll', async (req, res) => {
    try {
      await _driver.deleteAllUsers();
      let changed = false;
      for (const sprite of ws.serverSprites.values()) {
        if (sprite.skin !== 'default') {
          sprite.skin = 'default';
          changed = true;
        }
      }
      if (changed) {
        ws.setSpriteDirty(true);
        ws.broadcastPhysicsState();
      }
      invalidateStatsCache();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Exclusion endpoints
  app.get('/api/local/excluded', async (req, res) => {
    try {
      const limit = Math.min(5000, Math.max(1, parseInt(req.query.limit, 10) || 1000));
      const rows = await _driver.listExcluded(limit);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/local/exclude', async (req, res) => {
    const { userId, reason } = req.body;
    if (!isValidUsername(userId)) return res.status(400).json({ error: 'Invalid username' });
    const safeReason = typeof reason === 'string' ? reason.slice(0, 500) : '';
    try {
      await _driver.excludeUser(userId, safeReason);
      if (ws.removeServerSprite(userId)) {
        ws.broadcastPhysicsState();
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/local/unexclude', async (req, res) => {
    const { userId } = req.body;
    if (!isValidUsername(userId)) return res.status(400).json({ error: 'Invalid username' });
    try {
      await _driver.unexcludeUser(userId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/local/updateExclusionReason', async (req, res) => {
    const { userId, reason } = req.body;
    if (!isValidUsername(userId)) return res.status(400).json({ error: 'Invalid username' });
    const safeReason = typeof reason === 'string' ? reason.slice(0, 500) : '';
    try {
      await _driver.updateExclusionReason(userId, safeReason);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Stats
  app.get('/api/stats', async (req, res) => {
    const now = Date.now();
    if (statsCache && (now - statsCacheTime) < STATS_CACHE_TTL_MS) {
      return res.json(statsCache);
    }
    res.json(await refreshStatsCache() || { total_users: 0, custom_skins: 0, default_skins: 0 });
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
    const supervised = process.env.STREAM_SPRITES_SUPERVISED === '1' ||
      !!process.env.PM2_HOME ||
      !!process.env.INVOCATION_ID; // systemd sets INVOCATION_ID
    res.json({ ok: true, message: 'Server restarting...' });

    // When running standalone (npm start / node server.js), a detached helper
    // starts a replacement process. Under start.ps1/start.sh the supervisor
    // loop already handles restarting, so simply exit.
    if (!supervised) {
      try {
        const { spawn } = require('child_process');
        const helper = spawn(process.execPath, [path.join(__dirname, 'restart-helper.js')], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          env: {
            ...process.env,
            STREAM_SPRITES_RESTART_DELAY_MS: '2000'
          }
        });
        helper.unref();
      } catch (e) {
        _dbg('Failed to launch restart helper:', e.message);
      }
    }

    setTimeout(() => {
      try {
        const { cleanup: wsCleanup } = require('./websocket');
        wsCleanup();
      } catch (e) {}
      try {
        const { cleanup: twitchCleanup } = require('./twitch');
        twitchCleanup();
      } catch (e) {}
      try {
        if (_driver) _driver.close();
      } catch (e) {}
      if (supervised) {
        process.kill(process.pid, 'SIGTERM');
      } else {
        process.exit(0);
      }
    }, 500);
  });

  // Health check
  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Dashboard presence
  app.get('/api/dashboard/ping', (req, res) => {
    const now = Date.now();
    const alreadySeen = !!dashboardLastSeen && (now - dashboardLastSeen) < 10000;
    dashboardLastSeen = now;
    res.json({
      status: 'ok',
      timestamp: now,
      stopPinging: dashboardConfirmedOpen || alreadySeen
    });
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

    // Sanitize username and message to prevent IRC injection
    const sanitizedUsername = username.replace(/[^\p{L}\p{N}_]/gu, '_');
    // Strip IRC control characters and newlines from message
    const sanitizedMessage = message.replace(/[\x00-\x1F\x7F]/g, '').replace(/\r?\n/g, ' ').trim();
    if (!sanitizedMessage) {
      return res.status(400).json({ error: 'Message is empty after sanitization' });
    }

    const twitchClient = twitch.getTwitchClient();

    try {
      const state = twitchClient && twitchClient.readyState ? twitchClient.readyState() : null;
      if (twitchClient && state && (state === 1 || state === 'OPEN')) {
        const fullMessage = `@${sanitizedUsername}, ${sanitizedMessage}`;
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
  app.post('/api/local/sendChat', async (req, res) => {
    const { username, message } = req.body;
    if (!username || !message || typeof username !== 'string' || typeof message !== 'string' ||
        username.length > 25 || message.length > 500) {
      return res.status(400).json({ error: 'Invalid username or message' });
    }

    const sanitizedUsername = username.replace(/[^\p{L}\p{N}_]/gu, '_');
    const text = message.trim();
    if (!text) return res.status(400).json({ error: 'Message cannot be empty' });
    const isCommand = text.startsWith('!');

    let commandResult = null;
    if (isCommand) {
      try {
        commandResult = await twitch.processServerCommand(sanitizedUsername, text, { badges: { broadcaster: true, moderator: true } });
      } catch (e) {
        commandResult = { result: `Command failed: ${e.message}`, stateChanged: false };
      }
    }

    // Broadcast chat message to all overlay clients
    ws.broadcast({
      type: 'chat',
      username: sanitizedUsername,
      message: text,
      tags: { badges: { broadcaster: true } },
      commandResult: commandResult
    });

    if (commandResult?.stateChanged) {
      ws.setSpriteDirty(true);
      ws.broadcastPhysicsState();
    }

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
      const localCloudflared = path.join(PROJECT_ROOT, 'node_modules', 'cloudflared', 'bin',
        process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
      const tunnelArgs = ['tunnel', '--url', `http://localhost:${_cfg.serverPort || 8080}`];

      // Prefer the binary installed with the dependency. Fall back to npx only
      // when the package is missing (for example on a trimmed deployment).
      const useLocalBinary = fs.existsSync(localCloudflared);
      tunnelProcess = useLocalBinary
        ? spawn(localCloudflared, tunnelArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
          })
        : spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx',
            ['--yes', 'cloudflared', ...tunnelArgs], {
              stdio: ['ignore', 'pipe', 'pipe'],
              windowsHide: true
            });

      let outputBuffer = '';

      function processOutput(data) {
        outputBuffer = (outputBuffer + data.toString()).slice(-16384);
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
        // Windows: kill entire process tree asynchronously (non-blocking)
        const { exec } = require('child_process');
        exec(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' }, (err) => {
          // Ignore errors — process may already be dead
          tunnelProcess = null;
          tunnelUrl = null;
          tunnelStatus = 'stopped';
          tunnelError = null;
        });
      } else {
        tunnelProcess.kill('SIGTERM');
        tunnelProcess = null;
      }
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

  // ── Storage Management Endpoints ──────────────────────────────────────

  app.get('/api/storage/status', (req, res) => {
    const storageConfig = storage.getStorageConfig();
    res.json({
      type: storage.getStorageType(),
      config: storageConfig
    });
  });

  app.post('/api/storage/testConnection', async (req, res) => {
    const { connectionString } = req.body;
    if (!connectionString || typeof connectionString !== 'string') {
      return res.status(400).json({ error: 'Connection string required' });
    }
    try {
      const result = await storage.testConnection(connectionString);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, message: e.message });
    }
  });

  app.post('/api/storage/switch', async (req, res) => {
    const { type, connectionString } = req.body || {};
    try {
      let result;
      if (type === 'postgres') {
        if (!connectionString || typeof connectionString !== 'string') {
          return res.status(400).json({ error: 'Connection string required for PostgreSQL' });
        }
        result = await storage.switchToPostgres(connectionString, path.join(__dirname, '..'));
        if (!result.ok) return res.status(400).json(result);
      } else if (type === 'sqlite') {
        result = await storage.switchToSqlite(path.join(__dirname, '..'));
      } else {
        return res.status(400).json({ error: 'Invalid storage type. Use "sqlite" or "postgres".' });
      }

      // All modules must use the new driver, not the closed previous one.
      _driver = storage.getDriver();
      twitch.setDriver(_driver);
      twitch.invalidateSkinsCache();
      ws.invalidateOverlayConfigCache();
      ws.broadcast({ type: 'cmd', cmd: 'reloadSkins' });
      invalidateEnvCache();
      invalidateStatsCache();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/storage/migrate', async (req, res) => {
    const { connectionString } = req.body;
    if (!connectionString) {
      return res.status(400).json({ error: 'Connection string required' });
    }
    let src = null;
    let dst = null;
    try {
      const SqliteDriver = require('./storage/sqlite-driver');
      const PostgresDriver = require('./storage/postgres-driver');
      src = new SqliteDriver(path.join(__dirname, '..'));
      await src.init();
      dst = new PostgresDriver(connectionString);
      await dst.init();

      const users = src.getRawDb().prepare('SELECT id, display_name, assigned_skin FROM users').all();
      const excluded = src.getRawDb().prepare('SELECT id, reason FROM excluded_users').all();

      for (const u of users) {
        await dst.upsertUser(u.id, u.display_name, u.assigned_skin);
        if (u.assigned_skin && u.assigned_skin !== 'default') {
          await dst.assignSkin(u.id, u.assigned_skin);
        }
      }
      for (const e of excluded) {
        await dst.excludeUser(e.id, e.reason);
      }

      // Migrate config (access tokens are not persisted)
      const cfgData = JSON.parse(fs.readFileSync(_cfgPath, 'utf8'));
      await dst.saveConfig(_cfgPath, sanitizeConfigForDisk(cfgData));

      // Migrate assets (all subfolders)
      const assetsBaseDir = ASSETS_ROOT;
      if (fs.existsSync(assetsBaseDir)) {
        const folders = fs.readdirSync(assetsBaseDir, { withFileTypes: true }).filter(e => e.isDirectory());
        for (const folder of folders) {
          const folderPath = path.join(assetsBaseDir, folder.name);
          const assetFiles = fs.readdirSync(folderPath);
          for (const file of assetFiles) {
            const ext = path.extname(file).toLowerCase();
            if (['.png', '.gif', '.jpg', '.jpeg', '.webp', '.webm', '.avif'].includes(ext)) {
              const filePath = path.join(folderPath, file);
              const data = fs.readFileSync(filePath);
              const mimeMap = {
                '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.webm': 'video/webm', '.avif': 'image/avif'
              };
              await dst.writeAsset(`${folder.name}/${file}`, data, mimeMap[ext] || 'application/octet-stream');
            }
          }
        }
      }

      res.json({ ok: true, users: users.length, excluded: excluded.length, message: 'Migration complete' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    } finally {
      try { if (src) await src.close(); } catch (e) { /* ignore */ }
      try { if (dst) await dst.close(); } catch (e) { /* ignore */ }
    }
  });

  // ── Asset Management Endpoints ────────────────────────────────────────

  const multer = require('multer');
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  app.post('/api/assets/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filename = sanitizeUploadFilename(req.file.originalname);
    if (!filename || !hasAllowedAssetExtension(filename)) {
      return res.status(400).json({ error: 'Invalid file name or type. Supported: png, gif, jpg, jpeg, webp, webm, avif' });
    }

    const folder = normalizeAssetFolder(req.body.folder || 'skins');
    const localPath = resolveAssetPath(ASSETS_ROOT, folder, filename);
    if (!localPath) return res.status(400).json({ error: 'Invalid asset path' });

    try {
      if (_driver.getType() === 'postgres') {
        await _driver.writeAsset(`${folder}/${filename}`, req.file.buffer, getAssetMimeType(filename));
        // Keep a local copy as well so /assets works without a DB round-trip.
        try {
          fs.mkdirSync(path.dirname(localPath), { recursive: true });
          fs.writeFileSync(localPath, req.file.buffer);
        } catch (e) {
          _dbg('Could not cache uploaded asset on disk:', e.message);
        }
      } else {
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, req.file.buffer);
      }
      twitch.invalidateSkinsCache();
      ws.broadcast({ type: 'cmd', cmd: 'reloadSkins' });
      res.json({ ok: true, filename, folder });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/assets/list', async (req, res) => {
    try {
      if (_driver.getType() === 'postgres') {
        const assets = await _driver.listAssets();
        const result = {};
        for (const p of assets) {
          const parts = p.split('/');
          const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'root';
          const name = parts[parts.length - 1];
          if (!result[folder]) result[folder] = [];
          result[folder].push({ name, path: p });
        }
        res.json(result);
      } else {
        const assetsDir = ASSETS_ROOT;
        const result = {};
        if (fs.existsSync(assetsDir)) {
          const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const folderPath = path.join(assetsDir, entry.name);
              const files = fs.readdirSync(folderPath).filter(f => {
                const ext = path.extname(f).toLowerCase();
                return ['.png', '.gif', '.jpg', '.jpeg', '.webp', '.webm', '.avif'].includes(ext);
              });
              if (files.length > 0) {
                result[entry.name] = files.map(f => ({ name: f, path: `${entry.name}/${f}` }));
              }
            }
          }
        }
        res.json(result);
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/assets/delete', async (req, res) => {
    const { filename, folder } = req.body || {};
    const assetFolder = normalizeAssetFolder(folder || 'skins');
    if (!filename || !isSafeAssetName(filename)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = resolveAssetPath(ASSETS_ROOT, assetFolder, filename);
    if (!filePath) return res.status(400).json({ error: 'Invalid asset path' });

    const skinId = assetFolder === 'skins'
      ? path.basename(filename, path.extname(filename)).toLowerCase().replace(/[^a-z0-9_]/g, '_')
      : null;

    try {
      // Never delete the only default skin; it is the fallback for every sprite.
      if (skinId === 'default') {
        const currentSkins = await twitch.detectSkinsFromAssetsAsync();
        const defaultSkins = currentSkins.filter(s => s.id === 'default');
        if (defaultSkins.length <= 1) {
          return res.status(409).json({
            error: 'Cannot delete the only default skin. Upload a replacement default first.'
          });
        }
      }

      if (_driver.getType() === 'postgres') {
        await _driver.deleteAsset(`${assetFolder}/${filename}`);
      }
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      twitch.invalidateSkinsCache();

      // Reset assignments and live sprites that referenced a now-missing skin.
      if (skinId) {
        const remainingSkins = await twitch.detectSkinsFromAssetsAsync();
        if (!remainingSkins.some(s => s.id === skinId)) {
          await _driver.clearSkinAssignments(skinId);
          let liveChanged = false;
          for (const sprite of ws.serverSprites.values()) {
            if (sprite.skin === skinId) {
              sprite.skin = 'default';
              sprite.lastActivity = Date.now();
              liveChanged = true;
            }
          }
          if (liveChanged) {
            ws.setSpriteDirty(true);
            ws.broadcastPhysicsState();
          }
          invalidateStatsCache();
        }
      }

      ws.broadcast({ type: 'cmd', cmd: 'reloadSkins' });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Asset serving for remote storage (when using postgres, serve from DB)
  app.get('/api/assets/:folder/:filename', async (req, res) => {
    const { folder, filename } = req.params;
    if (!isValidAssetFolder(folder) || !isSafeAssetName(filename)) {
      return res.status(404).send('Not found');
    }

    try {
      if (_driver.getType() === 'postgres') {
        const data = await _driver.readAsset(`${folder}/${filename}`);
        if (data) {
          res.setHeader('Content-Type', getAssetMimeType(filename));
          res.setHeader('Cache-Control', 'public, max-age=60');
          return res.send(data);
        }
      }

      const filePath = resolveAssetPath(ASSETS_ROOT, folder, filename);
      if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('Not found');
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.sendFile(filePath);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // OAuth endpoints
  app.get('/auth/twitch', (req, res) => {
    console.log('→ GET /auth/twitch - redirecting to Twitch OAuth');
    const state = crypto.randomBytes(16).toString('hex');
    pendingOAuthStates.set(state, Date.now());
    // Use the actual request host so OAuth works with tunnels too
    const baseUrl = requestBaseUrl(req);
    const oauthRedirectUrl = `${baseUrl}/auth/callback`;
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${encodeURIComponent(_cfg.twitch.clientId || '')}&redirect_uri=${encodeURIComponent(oauthRedirectUrl)}&response_type=code&scope=${encodeURIComponent('chat:read chat:edit')}&state=${state}`;
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
      const baseUrl = requestBaseUrl(req);
      const oauthRedirectUrl = `${baseUrl}/auth/callback`;
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
          await _driver.saveConfig(_cfgPath, sanitizeConfigForDisk(_cfg));
          invalidateEnvCache();
        } catch (e) {
          _dbg('Failed to save refresh token:', e.message);
        }
      }

      const dashboardUrl = `${baseUrl}/`;
      const safeDashboardUrl = escapeHtml(dashboardUrl);
      res.send(`
        <html><body style="font-family:sans-serif;padding:20px;background:#111;color:#fff">
          <h2>✓ OAuth Token Generated</h2>
          <p>Refresh token saved. Use the dashboard to connect to Twitch.</p>
          <p><a href="${safeDashboardUrl}" style="color:#0af">Go to Local Control Dashboard</a></p>
          <p>Redirecting in 3 seconds...</p>
          <script>setTimeout(() => { window.location.href = ${JSON.stringify(dashboardUrl)}; }, 3000);</script>
        </body></html>
      `);
    } catch (e) {
      _dbg('OAuth callback error:', e.message);
      res.status(500).send('OAuth failed: ' + escapeHtml(e.response?.data?.message || e.message));
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

  // Error handler (must be registered after all routes).
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400)) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large' });
    }
    if (err.name === 'MulterError') {
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
        .json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)' : err.message });
    }

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
}

function cleanupTunnel() {
  if (!tunnelProcess) return;
  const pid = tunnelProcess.pid;
  try {
    if (process.platform === 'win32') {
      const { spawnSync } = require('child_process');
      spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 3000
      });
    } else {
      tunnelProcess.kill('SIGTERM');
    }
  } catch (e) {
    // Process may already have exited.
  }
  tunnelProcess = null;
  tunnelUrl = null;
  tunnelStatus = 'stopped';
}

module.exports = {
  initRoutes,
  broadcastStats,
  refreshStatsCache,
  invalidateStatsCache,
  setDashboardConfirmedOpen,
  cleanupTunnel
};
