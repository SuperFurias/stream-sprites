// Detached helper used by /api/local/restartServer when the server is not
// running under start.ps1/start.sh. It waits for the old process to release
// the port, then launches a fresh server with the same environment.
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const delay = Math.max(250, Number(process.env.STREAM_SPRITES_RESTART_DELAY_MS) || 2000);

setTimeout(() => {
  try {
    const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      cwd: root,
      env: {
        ...process.env,
        STREAM_SPRITES_RESTARTED: '1'
      },
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
  } catch (e) {
    // No console is attached; the dashboard will simply stay offline.
  }
}, delay);
