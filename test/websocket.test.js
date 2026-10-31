const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');

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

function waitForServer(child, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Server start timeout:\n${output}`)), timeoutMs);
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
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await sleep(25);
  }
  throw new Error('Timed out waiting for condition');
}

async function chat(port, message) {
  const response = await fetch(`http://127.0.0.1:${port}/api/local/sendChat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Admin', message })
  });
  assert.equal(response.status, 200);
}

async function connectSocket(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages = [];
  const types = [];
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      messages.push(message);
      types.push(message.type);
    } catch (e) {
      // Ignore malformed frames in the test recorder.
    }
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return { ws, messages, types };
}

function latestSprites(socket) {
  for (let i = socket.messages.length - 1; i >= 0; i--) {
    const message = socket.messages[i];
    if (message.type === 'physicsState') return message.sprites;
  }
  return [];
}

test('WebSocket protocol, dashboard role, and drag authority', { timeout: 40000 }, async () => {
  const tempRoot = path.join(ROOT, 'Temp', `ws-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const assetsRoot = path.join(tempRoot, 'assets');
  const dataDir = path.join(tempRoot, 'data');
  const configPath = path.join(tempRoot, 'config.json');
  const storagePath = path.join(tempRoot, 'storage-config.json');
  fs.mkdirSync(path.join(assetsRoot, 'skins'), { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'assets', 'skins', 'default.gif'), path.join(assetsRoot, 'skins', 'default.gif'));
  fs.writeFileSync(storagePath, JSON.stringify({ type: 'sqlite' }));

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
    dashboardPassword: '',
    overlay: { networkFps: 30 }
  }, null, 2));

  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      STREAM_SPRITES_CONFIG: configPath,
      STREAM_SPRITES_DATA_DIR: dataDir,
      STREAM_SPRITES_ASSETS_DIR: assetsRoot,
      STREAM_SPRITES_STORAGE_CONFIG: storagePath
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  let overlay = null;
  let dashboard = null;
  try {
    await waitForServer(child);

    overlay = await connectSocket(port);
    await waitFor(() => overlay.messages.some(m => m.type === 'physicsState'));
    assert.equal(overlay.types.includes('config'), false, 'server must not send config over WebSocket');
    assert.equal(overlay.types.includes('physicsState'), true);

    // Client-originated administrative commands are ignored.
    await chat(port, '!spawn DragUser');
    await waitFor(() => latestSprites(overlay).some(s => s.id === 'draguser'));
    overlay.ws.send(JSON.stringify({ type: 'cmd', cmd: 'clearSprites' }));
    await sleep(250);
    assert.ok(latestSprites(overlay).some(s => s.id === 'draguser'), 'client clearSprites must be ignored');

    // Dashboard clients identify themselves and stop receiving physics snapshots.
    overlay.ws.close();
    dashboard = await connectSocket(port);
    dashboard.ws.send(JSON.stringify({ type: 'identify', clientType: 'dashboard' }));
    await sleep(150);
    const snapshotCount = dashboard.types.filter(type => type === 'physicsState').length;
    await chat(port, '!spawn DashboardCheck');
    await sleep(500);
    assert.equal(
      dashboard.types.filter(type => type === 'physicsState').length,
      snapshotCount,
      'dashboard clients must not receive physics snapshots'
    );

    // Dragging is server-authoritative and owner-only.
    overlay = await connectSocket(port);
    await waitFor(() => latestSprites(overlay).some(s => s.id === 'draguser'));
    overlay.ws.send(JSON.stringify({ type: 'dragStart', spriteId: 'draguser', x: 250, y: 180 }));
    overlay.ws.send(JSON.stringify({ type: 'dragMove', spriteId: 'draguser', x: 250, y: 180 }));
    await waitFor(() => {
      const sprite = latestSprites(overlay).find(s => s.id === 'draguser');
      return !!sprite && Math.abs(sprite.x - 250) < 1 && Math.abs(sprite.y - 180) < 1;
    });

    // Another client cannot move a drag it does not own.
    dashboard.ws.send(JSON.stringify({ type: 'dragMove', spriteId: 'draguser', x: 900, y: 100 }));
    await sleep(200);
    const ownedSprite = latestSprites(overlay).find(s => s.id === 'draguser');
    assert.ok(ownedSprite && Math.abs(ownedSprite.x - 250) < 1, 'non-owner dragMove must be ignored');

    overlay.ws.send(JSON.stringify({ type: 'dragEnd', spriteId: 'draguser', x: 250, y: 180, vx: 0, vy: 0 }));
    await fetch(`http://127.0.0.1:${port}/api/local/clearSprites`, { method: 'POST' });
    await waitFor(() => latestSprites(overlay).length === 0);
  } finally {
    if (overlay) try { overlay.ws.close(); } catch (e) { /* ignore */ }
    if (dashboard) try { dashboard.ws.close(); } catch (e) { /* ignore */ }
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise(resolve => {
        const timer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch (e) { /* ignore */ }
          resolve();
        }, 5000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
