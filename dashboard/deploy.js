// Deploy tab — Cloudflare Tunnel
window.tabInitializers = window.tabInitializers || {};

// ── Tunnel UI ─────────────────────────────────────────────────────────────

let tunnelPollInterval = null;

function updateTunnelUI(status, url, error) {
  const statusEl = document.getElementById('tunnelStatus');
  const urlDisplay = document.getElementById('tunnelUrlDisplay');
  const urlEl = document.getElementById('tunnelUrl');
  const errorEl = document.getElementById('tunnelError');
  const startBtn = document.getElementById('startTunnelBtn');
  const stopBtn = document.getElementById('stopTunnelBtn');

  if (status === 'running' && url) {
    statusEl.className = 'status-indicator running';
    statusEl.innerHTML = '<span class="status-dot running"></span> Running';
    urlDisplay.style.display = 'flex';
    urlEl.href = url;
    urlEl.textContent = url;
    errorEl.style.display = 'none';
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
  } else if (status === 'starting') {
    statusEl.className = 'status-indicator starting';
    statusEl.innerHTML = '<span class="status-dot starting"></span> Starting...';
    urlDisplay.style.display = 'none';
    errorEl.style.display = 'none';
    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';
  } else if (status === 'error') {
    statusEl.className = 'status-indicator error';
    statusEl.innerHTML = '<span class="status-dot error"></span> Error';
    urlDisplay.style.display = 'none';
    errorEl.textContent = error || 'Unknown error';
    errorEl.style.display = 'block';
    startBtn.style.display = 'inline-block';
    startBtn.disabled = false;
    startBtn.textContent = 'Start Tunnel';
    stopBtn.style.display = 'none';
  } else {
    statusEl.className = 'status-indicator stopped';
    statusEl.innerHTML = '<span class="status-dot stopped"></span> Stopped';
    urlDisplay.style.display = 'none';
    errorEl.style.display = 'none';
    startBtn.style.display = 'inline-block';
    startBtn.disabled = false;
    startBtn.textContent = 'Start Tunnel';
    stopBtn.style.display = 'none';
  }
}

async function startTunnel() {
  const startBtn = document.getElementById('startTunnelBtn');
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';

  try {
    const res = await fetch('/api/local/startTunnel', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      updateTunnelUI('starting', null, null);
      if (data.url) {
        updateTunnelUI('running', data.url, null);
        return;
      }
      if (!tunnelPollInterval) {
        let pollCount = 0;
        tunnelPollInterval = setInterval(async () => {
          pollCount++;
          try {
            const statusRes = await fetch('/api/local/tunnelStatus');
            if (!statusRes.ok) return;
            const statusData = await statusRes.json();

            if (statusData.status === 'running' && statusData.url) {
              updateTunnelUI('running', statusData.url, null);
              clearInterval(tunnelPollInterval);
              tunnelPollInterval = null;
            } else if (statusData.status === 'error') {
              updateTunnelUI('error', null, statusData.error || 'Tunnel failed');
              clearInterval(tunnelPollInterval);
              tunnelPollInterval = null;
            } else if (statusData.status === 'stopped' && pollCount > 5) {
              updateTunnelUI('error', null, 'Tunnel failed to start. Run npm install to restore the bundled cloudflared binary.');
              clearInterval(tunnelPollInterval);
              tunnelPollInterval = null;
            }
          } catch (e) { /* ignore */ }

          if (pollCount > 20) {
            updateTunnelUI('error', null, 'Tunnel timed out. Run npm install to restore the bundled cloudflared binary.');
            clearInterval(tunnelPollInterval);
            tunnelPollInterval = null;
          }
        }, 1000);
      }
    } else {
      updateTunnelUI('error', null, data.error || 'Failed to start');
    }
  } catch (e) {
    updateTunnelUI('error', null, e.message);
  }
}

async function stopTunnel() {
  try {
    await fetch('/api/local/stopTunnel', { method: 'POST' });
    updateTunnelUI('stopped', null, null);
  } catch (e) {
    updateTunnelUI('error', null, e.message);
  }
}

function copyTunnelUrl() {
  const url = document.getElementById('tunnelUrl').textContent;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector('#tunnelUrlDisplay .copy-btn');
    btn.textContent = 'Copied';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });
}

// ── Tab Initializer ────────────────────────────────────────────────────────

tabInitializers.deploy = async function() {
  try {
    const res = await fetch('/api/local/tunnelStatus');
    if (res.ok) {
      const data = await res.json();
      updateTunnelUI(data.status, data.url, data.error);
      if (data.status === 'starting' && !tunnelPollInterval) {
        let pollCount = 0;
        tunnelPollInterval = setInterval(async () => {
          pollCount++;
          try {
            const statusRes = await fetch('/api/local/tunnelStatus');
            if (!statusRes.ok) return;
            const statusData = await statusRes.json();
            if (statusData.status === 'running' && statusData.url) {
              updateTunnelUI('running', statusData.url, null);
              clearInterval(tunnelPollInterval);
              tunnelPollInterval = null;
            } else if (statusData.status === 'error') {
              updateTunnelUI('error', null, statusData.error);
              clearInterval(tunnelPollInterval);
              tunnelPollInterval = null;
            }
          } catch (e) { /* ignore */ }
          if (pollCount > 20) {
            clearInterval(tunnelPollInterval);
            tunnelPollInterval = null;
          }
        }, 1000);
      }
    }
  } catch (e) {
    // server not reachable
  }
};
