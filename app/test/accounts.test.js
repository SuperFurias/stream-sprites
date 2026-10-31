const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { AccountStore, readActiveProfile } = require('../server/accounts');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function request(port, pathname, { method = 'GET', body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: {
        Host: `127.0.0.1:${port}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {})
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text: buffer.toString('utf8'),
          json() { return JSON.parse(buffer.toString('utf8')); }
        });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(port, mode, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok' && data.mode === mode) return data;
      }
    } catch (e) {
      // Still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${mode} on port ${port}`);
}

function waitForExit(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) return resolve(child.exitCode);
    const timer = setTimeout(() => reject(new Error('Process did not exit in time')), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

function spawnServer(env) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  return { child, output: () => output };
}

function makeEnv(baseDir, port) {
  fs.mkdirSync(baseDir, { recursive: true });
  const configPath = path.join(baseDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    serverPort: port,
    useServer: true,
    autoOpenBrowser: false,
    autoGenerateOAuth: false,
    autoConnect: false,
    channel: '',
    botUsername: '',
    dashboardPassword: '',
    debug: { logToFile: false },
    twitch: { clientId: '', clientSecret: '', botOAuthToken: '', refreshToken: '' },
    overlay: {}
  }, null, 2));

  return {
    STREAM_SPRITES_ACCOUNTS: '1',
    STREAM_SPRITES_SUPERVISED: '1',
    STREAM_SPRITES_DATA_DIR: baseDir,
    STREAM_SPRITES_CONFIG: configPath,
    STREAM_SPRITES_ASSETS_DIR: ASSETS,
    STREAM_SPRITES_STORAGE_CONFIG: path.join(baseDir, 'storage-config.json'),
    STREAM_SPRITES_LOG_DIR: path.join(baseDir, 'logs')
  };
}

test('account store creates isolated profiles and verifies passwords', async () => {
  const baseDir = path.join(ROOT, 'Temp', `accounts-unit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const store = new AccountStore(baseDir);
  try {
    const alice = store.createAccount('Alice', 'secret-one', 8080, ASSETS);
    const bob = store.createAccount('Bob', 'secret-two', 8080, ASSETS);

    assert.notEqual(alice.profileId, bob.profileId);
    assert.ok(fs.existsSync(path.join(alice.profileDir, 'config.json')));
    assert.ok(fs.existsSync(path.join(alice.profileDir, 'assets', 'skins', 'default.gif')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(alice.profileDir, 'config.json'), 'utf8')).serverPort, 8080);

    const stored = store.db.prepare('SELECT password_hash FROM accounts WHERE username = ?').get('Alice');
    assert.match(stored.password_hash, /^scrypt\$/);
    assert.equal(store.authenticate('alice', 'secret-one').username, 'Alice');
    assert.equal(store.authenticate('Alice', 'wrong'), null);
    assert.throws(() => store.createAccount('Alice', 'another-password', 8080, ASSETS), /UNIQUE constraint/);
    assert.throws(() => store.createAccount('guest', 'another-password', 8080, ASSETS), /reserved/i);

    store.setActiveAccount(alice);
    const active = readActiveProfile(baseDir);
    assert.equal(active.type, 'account');
    assert.equal(active.username, 'Alice');
    assert.equal(active.profileId, alice.profileId);

    store.setActiveGuest();
    assert.equal(readActiveProfile(baseDir).type, 'guest');

    store.clearActive();
    assert.equal(readActiveProfile(baseDir), null);
  } finally {
    store.close();
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
});

test('account gateway registers a profile and account logout returns to selection', { timeout: 60000 }, async () => {
  const port = await getFreePort();
  const baseDir = path.join(ROOT, 'Temp', `accounts-flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const env = makeEnv(baseDir, port);
  let gateway = null;
  let app = null;

  try {
    gateway = spawnServer(env);
    await waitForHealth(port, 'accounts');

    const page = await request(port, '/');
    assert.equal(page.status, 200);
    assert.match(page.text, /Continue as Guest/);

    const register = await request(port, '/api/accounts/register', {
      method: 'POST',
      body: { username: 'Alice', password: 'secret-one' }
    });
    assert.equal(register.status, 200, register.text);
    assert.equal(register.json().profile, 'Alice');
    await waitForExit(gateway.child);

    const active = readActiveProfile(baseDir);
    assert.equal(active.type, 'account');
    assert.equal(active.username, 'Alice');
    assert.ok(fs.existsSync(path.join(baseDir, 'profiles', active.profileId, 'config.json')));

    app = spawnServer(env);
    await waitForHealth(port, 'app', 25000);
    const dashboard = await request(port, '/');
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.text, /Admin Dashboard/);
    const envResponse = await request(port, '/env');
    assert.equal(envResponse.json().accountName, 'Alice');
    assert.equal(envResponse.json().accountMode, true);

    const logout = await request(port, '/api/dashboard/logout', { method: 'POST' });
    assert.equal(logout.status, 200);
    assert.equal(logout.json().restarting, true);
    await waitForExit(app.child);
    assert.equal(readActiveProfile(baseDir), null);

    gateway = spawnServer(env);
    await waitForHealth(port, 'accounts');
    const back = await request(port, '/');
    assert.match(back.text, /Choose how to continue/);
  } finally {
    try { gateway?.child.kill('SIGTERM'); } catch (e) { /* already gone */ }
    try { app?.child.kill('SIGTERM'); } catch (e) { /* already gone */ }
    await new Promise(resolve => setTimeout(resolve, 300));
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
});

test('guest profile is shared and boots the app with existing data', { timeout: 60000 }, async () => {
  const port = await getFreePort();
  const baseDir = path.join(ROOT, 'Temp', `accounts-guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const env = makeEnv(baseDir, port);
  let gateway = null;
  let app = null;

  try {
    gateway = spawnServer(env);
    await waitForHealth(port, 'accounts');
    const guest = await request(port, '/api/accounts/guest', { method: 'POST', body: {} });
    assert.equal(guest.status, 200, guest.text);
    await waitForExit(gateway.child);

    const active = readActiveProfile(baseDir);
    assert.equal(active.type, 'guest');
    assert.equal(active.username, 'Guest');

    app = spawnServer(env);
    const health = await waitForHealth(port, 'app', 25000);
    assert.equal(health.mode, 'app');
    const envResponse = await request(port, '/env');
    assert.equal(envResponse.json().accountName, 'Guest');
    assert.equal(envResponse.json().accountMode, true);

    const dashboard = await request(port, '/');
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.text, /Admin Dashboard/);
  } finally {
    try { gateway?.child.kill('SIGTERM'); } catch (e) { /* already gone */ }
    try { app?.child.kill('SIGTERM'); } catch (e) { /* already gone */ }
    await new Promise(resolve => setTimeout(resolve, 300));
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
});
