const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PostgresDriver = require('../server/storage/postgres-driver');

const connectionString = process.env.TEST_POSTGRES_URL;

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

function waitForServer(child, pattern, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Server start timeout:\n${output}`)), timeoutMs);
    const onData = (data) => {
      output += data.toString();
      if (output.includes(pattern)) {
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

async function request(port, pathname) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
  return { status: response.status, json: await response.json() };
}

test('database-backed config is authoritative at startup', { skip: !connectionString, timeout: 40000 }, async () => {
  const tempRoot = path.join(ROOT, 'Temp', `pg-startup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const assetsRoot = path.join(tempRoot, 'assets');
  const dataDir = path.join(tempRoot, 'data');
  const fileConfigPath = path.join(tempRoot, 'config.json');
  const storageConfigPath = path.join(tempRoot, 'storage-config.json');
  fs.mkdirSync(path.join(assetsRoot, 'skins'), { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'assets', 'skins', 'default.gif'), path.join(assetsRoot, 'skins', 'default.gif'));

  const dbPort = await getFreePort();
  const filePort = await getFreePort();
  const driver = new PostgresDriver(connectionString);
  await driver.init();
  await driver.saveConfig('unused', {
    useServer: false,
    serverPort: dbPort,
    debug: { serverDebug: false, twitchDebug: false, twitchAuthErrors: true, twitchOtherErrors: true, verboseMessages: false, logToFile: false },
    twitch: { clientId: '', clientSecret: '', botOAuthToken: '', refreshToken: '' },
    botUsername: '',
    channel: 'PgStartupTest',
    autoGenerateOAuth: false,
    autoConnect: false,
    autoOpenBrowser: false,
    dashboardPassword: '',
    overlay: { networkFps: 10 }
  });
  await driver.close();

  fs.writeFileSync(fileConfigPath, JSON.stringify({
    useServer: false,
    serverPort: filePort,
    debug: { logToFile: false },
    twitch: { clientId: '', clientSecret: '', botOAuthToken: '', refreshToken: '' },
    botUsername: '',
    channel: 'FileConfigShouldLose',
    autoGenerateOAuth: false,
    autoConnect: false,
    autoOpenBrowser: false,
    dashboardPassword: '',
    overlay: { networkFps: 30 }
  }, null, 2));
  fs.writeFileSync(storageConfigPath, JSON.stringify({ type: 'postgres', connectionString }));

  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      STREAM_SPRITES_CONFIG: fileConfigPath,
      STREAM_SPRITES_ACCOUNTS: '0',
      STREAM_SPRITES_NO_BROWSER: '1',
      STREAM_SPRITES_DATA_DIR: dataDir,
      STREAM_SPRITES_ASSETS_DIR: assetsRoot,
      STREAM_SPRITES_STORAGE_CONFIG: storageConfigPath
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  try {
    await waitForServer(child, `Server running on http://localhost:${dbPort}`);
    const health = await request(dbPort, '/healthz');
    assert.equal(health.status, 200);
    assert.equal(health.json.storage, 'postgres');

    const env = await request(dbPort, '/env');
    assert.equal(env.status, 200);
    assert.equal(env.json.channel, 'PgStartupTest');
    assert.equal(env.json.overlay.networkFps, 10);
  } finally {
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
