const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const { version: APP_VERSION } = require('../package.json');
const { AccountStore, readBasePort } = require('./accounts');

const PROJECT_ROOT = path.join(__dirname, '..');
const ACCOUNT_PAGE = path.join(PROJECT_ROOT, 'accounts', 'accounts.html');
const FAVICON = path.join(PROJECT_ROOT, 'favicon.ico');
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;

function isLoopback(req) {
  const address = req.socket?.remoteAddress || '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function localOnly(req, res, next) {
  if (!isLoopback(req)) return res.status(403).json({ error: 'Accounts can only be managed from this PC.' });
  next();
}

function scheduleRestart() {
  const supervised = process.env.STREAM_SPRITES_SUPERVISED === '1' ||
    !!process.env.PM2_HOME ||
    !!process.env.INVOCATION_ID;

  if (!supervised) {
    try {
      const helper = spawn(process.execPath, [path.join(__dirname, 'restart-helper.js')], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: {
          ...process.env,
          STREAM_SPRITES_RESTART_DELAY_MS: '1200'
        }
      });
      helper.unref();
    } catch (e) {
      console.error('Failed to start restart helper:', e.message);
    }
  }

  setTimeout(() => {
    if (supervised) {
      process.kill(process.pid, 'SIGTERM');
    } else {
      process.exit(0);
    }
  }, 400);
}

function startAccountGateway(options) {
  const baseDataDir = path.resolve(options.baseDataDir);
  const baseConfigPath = path.resolve(options.baseConfigPath);
  const baseAssetsDir = path.resolve(options.baseAssetsDir);
  const basePort = readBasePort(baseConfigPath, options.basePort || 8080);
  const store = new AccountStore(baseDataDir);
  const failures = new Map();
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  const clearAuthCookies = (req, res) => {
    const secure = req.secure ? '; Secure' : '';
    res.setHeader('Set-Cookie', [
      `dash_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
      `dash_logged_out=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
    ]);
  };

  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok', version: APP_VERSION, mode: 'accounts' });
  });

  app.get('/', (req, res) => res.sendFile(ACCOUNT_PAGE));
  app.get('/accounts', (req, res) => res.sendFile(ACCOUNT_PAGE));
  app.get('/favicon.ico', (req, res) => res.sendFile(FAVICON));

  app.get('/api/accounts', localOnly, (req, res) => {
    res.json({ accounts: store.listAccounts().map(a => ({ username: a.username })) });
  });

  app.post('/api/accounts/register', localOnly, (req, res) => {
    const { username, password } = req.body || {};
    try {
      const account = store.createAccount(username, password, basePort, baseAssetsDir);
      store.setActiveAccount(account);
      clearAuthCookies(req, res);
      res.json({ ok: true, restarting: true, profile: account.username });
      scheduleRestart();
    } catch (e) {
      if (/UNIQUE constraint failed: accounts\.username/i.test(e.message)) {
        return res.status(409).json({ error: 'That username is already taken.' });
      }
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/accounts/login', localOnly, (req, res) => {
    const { username, password } = req.body || {};
    const key = String(username || '').toLowerCase();
    const now = Date.now();
    const failure = failures.get(key);
    if (failure && failure.lockedUntil > now) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in a minute.' });
    }

    const account = store.authenticate(username, password);
    if (!account) {
      const next = failure && now - failure.first < LOGIN_WINDOW_MS
        ? { ...failure, count: failure.count + 1 }
        : { count: 1, first: now, lockedUntil: 0 };
      if (next.count >= LOGIN_MAX_FAILURES) {
        next.count = 0;
        next.first = now;
        next.lockedUntil = now + 60 * 1000;
      }
      failures.set(key, next);
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    failures.delete(key);
    store.setActiveAccount(account);
    clearAuthCookies(req, res);
    res.json({ ok: true, restarting: true, profile: account.username });
    scheduleRestart();
  });

  app.post('/api/accounts/guest', localOnly, (req, res) => {
    store.setActiveGuest();
    clearAuthCookies(req, res);
    res.json({ ok: true, restarting: true, profile: 'Guest' });
    scheduleRestart();
  });

  const server = app.listen(basePort, '0.0.0.0', () => {
    console.log(`✓ Account selection running on http://localhost:${basePort}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`✗ Port ${basePort} is already in use.`);
    } else {
      console.error('✗ Account gateway error:', err.message);
    }
    try { store.close(); } catch (e) { /* already closed */ }
    process.exit(1);
  });

  const shutdown = () => {
    store.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 700).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (process.env.STREAM_SPRITES_DESKTOP === '1') {
    let desktopCommand = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      desktopCommand += chunk;
      if (desktopCommand.toLowerCase().includes('shutdown')) {
        desktopCommand = '';
        shutdown();
      }
    });
    process.stdin.on('error', () => {});
    process.stdin.resume();
  }

  return { server, store };
}

module.exports = { startAccountGateway };
