const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64'
);

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

function request(port, pathname, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(body));
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: {
        Host: `127.0.0.1:${port}`,
        ...(payload ? { 'Content-Length': payload.length } : {}),
        ...headers
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: buffer,
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

function waitForServer(child, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      reject(new Error(`Server did not start in time:\n${output}`));
    }, timeoutMs);

    const onData = (data) => {
      output += data.toString();
      if (output.includes('Server running')) {
        clearTimeout(timer);
        resolve(output);
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited early (${code}):\n${output}`));
    });
    child.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

test('HTTP surface enforces auth/static boundaries and asset sanitization', { timeout: 40000 }, async () => {
  const tempRoot = path.join(ROOT, 'Temp', `http-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const assetsRoot = path.join(tempRoot, 'assets');
  const dataDir = path.join(tempRoot, 'data');
  const configPath = path.join(tempRoot, 'config.json');
  const storageConfigPath = path.join(tempRoot, 'storage-config.json');
  fs.mkdirSync(path.join(assetsRoot, 'skins'), { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'assets', 'skins', 'default.gif'), path.join(assetsRoot, 'skins', 'default.gif'));
  fs.writeFileSync(storageConfigPath, JSON.stringify({ type: 'sqlite' }));

  const port = await getFreePort();
  fs.writeFileSync(configPath, JSON.stringify({
    useServer: false,
    serverPort: port,
    debug: { logToFile: false },
    twitch: { clientId: '', clientSecret: '', botOAuthToken: '', refreshToken: '' },
    botUsername: '',
    channel: '',
    autoGenerateOAuth: false,
    autoConnect: false,
    autoOpenBrowser: false,
    dashboardPassword: 'integration-password',
    overlay: {}
  }, null, 2));

  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      STREAM_SPRITES_CONFIG: configPath,
      STREAM_SPRITES_DATA_DIR: dataDir,
      STREAM_SPRITES_ASSETS_DIR: assetsRoot,
      STREAM_SPRITES_STORAGE_CONFIG: storageConfigPath
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  try {
    await waitForServer(child);

    const localEnv = await request(port, '/env');
    assert.equal(localEnv.status, 200);
    assert.equal(localEnv.headers['cache-control'], 'no-store');
    assert.equal(localEnv.json().isLocalhost, true);
    assert.ok(localEnv.json().twitch, 'trusted local env includes Twitch config');

    const remoteEnv = await request(port, '/env', { headers: { Host: 'evil.example' } });
    assert.equal(remoteEnv.status, 200);
    assert.equal(remoteEnv.json().twitch, undefined);
    assert.equal(remoteEnv.json().isLocalhost, false);

    const remoteEnvCors = await request(port, '/env', {
      headers: { Host: 'evil.example', Origin: 'http://overlay.example' }
    });
    assert.equal(remoteEnvCors.status, 200);
    assert.equal(remoteEnvCors.headers['access-control-allow-origin'], '*');

    const remoteSkinsCors = await request(port, '/api/skins/auto', {
      headers: { Host: 'evil.example', Origin: 'http://overlay.example' }
    });
    assert.equal(remoteSkinsCors.status, 200);
    assert.equal(remoteSkinsCors.headers['access-control-allow-origin'], '*');

    assert.equal((await request(port, '/server/.env')).status, 404);
    assert.equal((await request(port, '/package.json')).status, 404);
    assert.equal((await request(port, '/server/db/sa.db')).status, 404);
    assert.equal((await request(port, '/logs/debug.log')).status, 404);
    const health = await request(port, '/healthz');
    assert.equal(health.status, 200);
    assert.equal(health.json().status, 'ok');
    assert.equal(health.json().version, require('../package.json').version);
    assert.equal(health.json().storage, 'sqlite');
    assert.equal(typeof health.json().uptimeSeconds, 'number');

    assert.equal((await request(port, '/overlay/overlay.html')).status, 200);
    assert.equal((await request(port, '/dashboard/dashboard.html')).status, 200);
    assert.equal((await request(port, '/assets/skins/default.gif')).status, 200);
    assert.equal((await request(port, '/assets/skins/default.gif', {
      headers: { Host: 'evil.example' }
    })).status, 200);

    const localUsers = await request(port, '/api/local/users');
    assert.equal(localUsers.status, 200);
    assert.equal(localUsers.headers['cache-control'], 'no-store');
    assert.equal((await request(port, '/api/local/users', { headers: { Host: 'evil.example' } })).status, 401);
    assert.equal((await request(port, '/api/local/users', { headers: { Origin: 'http://evil.example' } })).status, 403);
    assert.equal((await request(port, '/api/assets/list', { headers: { Host: 'evil.example' } })).status, 401);
    assert.equal((await request(port, '/api/dashboard/setup', {
      method: 'POST',
      headers: { Host: 'evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'nope' })
    })).status, 403);

    const traversalDelete = await request(port, '/api/assets/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: 'skins', filename: '../../server/.env' })
    });
    assert.equal(traversalDelete.status, 400);

    const form = new FormData();
    form.append('folder', 'skins');
    form.append('file', new Blob([TINY_PNG], { type: 'image/png' }), '../../escape.png');
    const upload = await fetch(`http://127.0.0.1:${port}/api/assets/upload`, { method: 'POST', body: form });
    const uploadText = await upload.text();
    assert.equal(upload.status, 200, uploadText);
    const uploaded = JSON.parse(uploadText);
    assert.equal(uploaded.filename, 'escape.png');
    assert.equal(fs.existsSync(path.join(assetsRoot, 'skins', 'escape.png')), true);
    assert.equal(fs.existsSync(path.join(assetsRoot, 'escape.png')), false);

    const assign = await request(port, '/api/local/assignSkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'testuser', skinId: 'escape' })
    });
    assert.equal(assign.status, 200);

    const removeUpload = await request(port, '/api/assets/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: 'skins', filename: 'escape.png' })
    });
    assert.equal(removeUpload.status, 200, removeUpload.text);
    assert.equal(fs.existsSync(path.join(assetsRoot, 'skins', 'escape.png')), false);

    const usersAfterDelete = await request(port, '/api/local/users');
    const testUser = usersAfterDelete.json().find(u => u.id === 'testuser');
    assert.ok(testUser, 'assigned user remains in the database');
    assert.equal(testUser.assigned_skin, 'default');

    const deleteDefault = await request(port, '/api/assets/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: 'skins', filename: 'default.gif' })
    });
    assert.equal(deleteDefault.status, 409);
    assert.equal(fs.existsSync(path.join(assetsRoot, 'skins', 'default.gif')), true);

    const login = await request(port, '/api/dashboard/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'integration-password' })
    });
    assert.equal(login.status, 200);
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const remoteAuth = await request(port, '/api/local/users', {
      headers: { Host: 'evil.example', Cookie: cookie }
    });
    assert.equal(remoteAuth.status, 200);

    const changePassword = await request(port, '/api/local/saveConfig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardPassword: 'changed-password' })
    });
    assert.equal(changePassword.status, 200);

    const staleSession = await request(port, '/api/local/users', {
      headers: { Host: 'evil.example', Cookie: cookie }
    });
    assert.equal(staleSession.status, 401);

    const newLogin = await request(port, '/api/dashboard/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'changed-password' })
    });
    assert.equal(newLogin.status, 200);
    const newCookie = String(newLogin.headers['set-cookie']).split(';')[0];

    const logout = await request(port, '/api/dashboard/logout', {
      method: 'POST',
      headers: { Host: 'evil.example', Cookie: newCookie }
    });
    assert.equal(logout.status, 200);

    const afterLogout = await request(port, '/api/local/users', {
      headers: { Host: 'evil.example', Cookie: newCookie }
    });
    assert.equal(afterLogout.status, 401);
  } finally {
    if (!child.killed) child.kill('SIGTERM');
    await new Promise(resolve => {
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (e) { /* already gone */ }
        resolve();
      }, 5000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});




