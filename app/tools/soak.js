// Lightweight soak test: run the real server, push hundreds of sprites and
// command bursts through it, and verify snapshots keep flowing without errors.
//
// Usage: npm run soak

const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const TEMP_ROOT = path.join(ROOT, 'Temp');
const DURATION_MS = 10000;
const SPRITE_GROUPS = [
  ['Admin', 1],
  ['Alpha', 100],
  ['Beta', 100],
  ['Gamma', 100]
];

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

function localRequest(port, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body == null ? null : Buffer.from(JSON.stringify(options.body));
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: pathname,
      method: options.method || 'GET',
      headers: {
        Host: `127.0.0.1:${port}`,
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {})
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* non-JSON response */ }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
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

async function chat(port, message) {
  const response = await localRequest(port, '/api/local/sendChat', {
    method: 'POST',
    body: { username: 'Admin', message }
  });
  if (response.status !== 200) throw new Error(`Command failed (${response.status}): ${message}`);
}

async function main() {
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
  const tempRoot = path.join(TEMP_ROOT, `soak-${Date.now()}`);
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
    overlay: { networkFps: 30, maxSprites: 1500 }
  }, null, 2));

  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      STREAM_SPRITES_CONFIG: configPath,
      STREAM_SPRITES_ACCOUNTS: '0',
      STREAM_SPRITES_NO_BROWSER: '1',
      STREAM_SPRITES_DATA_DIR: dataDir,
      STREAM_SPRITES_ASSETS_DIR: assetsRoot,
      STREAM_SPRITES_STORAGE_CONFIG: storagePath
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  let serverOutput = '';
  child.stdout.on('data', data => { serverOutput += data.toString(); });
  child.stderr.on('data', data => { serverOutput += data.toString(); });

  let ws = null;
  try {
    await waitForServer(child);

    const metrics = { snapshots: 0, bytes: 0, maxSprites: 0, lastSprites: 0 };
    ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('message', (data) => {
      metrics.snapshots++;
      metrics.bytes += data.length;
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'physicsState') {
          metrics.lastSprites = message.sprites.length;
          metrics.maxSprites = Math.max(metrics.maxSprites, metrics.lastSprites);
        }
      } catch (e) { /* ignore */ }
    });
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    const wireStart = ws._socket ? ws._socket.bytesRead : 0;

    await localRequest(port, '/api/local/clearSprites', { method: 'POST' });
    for (const [name, count] of SPRITE_GROUPS) {
      await chat(port, `!spawn ${name} ${count}`);
    }

    const started = Date.now();
    const commandCycle = ['!jump', '!sit', '!unsit', '!flip Alpha_2', '!fight Beta_2', '!boom', '!skins'];
    let commandsSent = 0;
    while (Date.now() - started < DURATION_MS) {
      for (const command of commandCycle) {
        await chat(port, command);
        commandsSent++;
        await new Promise(resolve => setTimeout(resolve, 120));
      }
      await new Promise(resolve => setTimeout(resolve, 400));
    }

    const elapsedSeconds = (Date.now() - started) / 1000;
    const snapshotRate = metrics.snapshots / elapsedSeconds;
    const avgBytes = metrics.snapshots ? Math.round(metrics.bytes / metrics.snapshots) : 0;
    const wireBytes = ws._socket ? ws._socket.bytesRead - wireStart : 0;
    const avgWireBytes = metrics.snapshots ? Math.round(wireBytes / metrics.snapshots) : 0;

    await localRequest(port, '/api/local/clearSprites', { method: 'POST' });
    await new Promise(resolve => setTimeout(resolve, 500));

    const checks = {
      processAlive: child.exitCode === null,
      snapshotsFlowing: snapshotRate > 10,
      spritesSpawned: metrics.maxSprites >= 250,
      spritesCleared: metrics.lastSprites === 0,
      noServerErrors: !/✗|Unhandled|FATAL|TypeError|ReferenceError|Error:/i.test(serverOutput)
    };
    const report = {
      port,
      elapsedSeconds: Number(elapsedSeconds.toFixed(1)),
      commandsSent,
      snapshots: metrics.snapshots,
      snapshotRate: Number(snapshotRate.toFixed(1)),
      avgSnapshotBytes: avgBytes,
      avgWireBytes,
      maxSprites: metrics.maxSprites,
      finalSprites: metrics.lastSprites,
      checks
    };
    console.log(JSON.stringify(report, null, 2));

    const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length > 0) {
      console.error('Soak checks failed:', failed.join(', '));
      console.error(serverOutput.slice(-4000));
      process.exitCode = 1;
    }
  } finally {
    if (ws) {
      try { ws.close(); } catch (e) { /* ignore */ }
    }
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
