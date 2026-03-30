// Dashboard tab functions

async function clearSprites(){
  if(!confirm('Clear all sprites from overlay?')) return;
  await sharedAPI('/api/local/clearSprites', { method:'POST' });
  alert('Sprites cleared');
}

async function resetAll(){
  if(!confirm('Delete ALL user skin assignments? This cannot be undone.')) return;
  await sharedAPI('/api/local/resetAll', { method:'POST' });
  alert('All assignments reset');
}

async function refreshAllOverlays(){
  try{
    const res = await fetch('/api/local/refreshAllOverlays', { method:'POST' });
    if(!res.ok) throw new Error('Failed to send refresh command');
    const data = await res.json();
    alert('✓ Refresh command sent to ' + data.clients + ' overlay clients');
  }catch(e){
    alert('✗ Error: ' + e.message);
  }
}

async function restartServer(){
  if(!confirm('Restart the server? This will briefly disconnect all users.')) return;
  try{
    const res = await fetch('/api/local/restartServer', { method:'POST' });
    if(!res.ok) throw new Error('Failed to restart');
    const data = await res.json();
    alert('✓ ' + data.message + ' The dashboard will automatically reconnect...');
    // The refreshStats interval (every 5s) will automatically reconnect when server is back
  }catch(e){
    alert('✗ Error: ' + e.message);
  }
}

// Preview functionality

function getOverlayUrl() {
  return window.location.origin + '/overlay/overlay.html';
}

function updateOverlayPreview() {
  const iframe = document.getElementById('overlayPreview');
  if (iframe) {
    iframe.src = getOverlayUrl();
  }
}

function refreshPreview() {
  updateOverlayPreview();
}

function openOverlayInNewTab() {
  window.open(getOverlayUrl(), '_blank');
}

// Chat functionality

function addChatLog(text, type) {
  const log = document.getElementById('chatLog');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'chat-msg' + (type ? ' ' + type : '');
  div.innerHTML = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

async function sendChat() {
  const inputEl = document.getElementById('chatInput');
  const message = inputEl.value.trim();
  if (!message) return;

  inputEl.value = '';

  try {
    const res = await fetch('/api/local/sendChat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Admin', message })
    });
    const data = await res.json();
    if (data.commandResult) {
      addChatLog(`<span class="system">→ ${data.commandResult}</span>`, 'system');
    }
  } catch (e) {
    addChatLog(`<span class="system">Error: ${e.message}</span>`, 'system');
  }

  inputEl.focus();
}

// Register initializer
window.tabInitializers = window.tabInitializers || {};
window.tabInitializers.dashboard = async function() {
  console.log('Dashboard tab initialized');

  // Load canvas dimensions from config and set preview dimensions
  const root = document.documentElement;
  try {
    const res = await fetch('/env');
    if (res.ok) {
      const cfg = await res.json();
      const ov = cfg.overlay || {};
      const canvasW = ov.canvasWidth || 1920;
      const canvasH = ov.canvasHeight || 1080;

      // Scale canvas to fit dashboard (half size, capped)
      const scale = 0.5;
      const previewW = Math.round(canvasW * scale);
      const previewH = Math.round(canvasH * scale);
      const ratio = canvasW + ' / ' + canvasH;
      // Chat width proportional to preview (roughly 1/3)
      const chatW = Math.round(previewW / 3);

      root.style.setProperty('--preview-w', previewW + 'px');
      root.style.setProperty('--preview-ratio', ratio);
      root.style.setProperty('--chat-w', chatW + 'px');
      root.style.setProperty('--chat-h', (previewH + 40) + 'px');
    }
  } catch (e) {
    console.error('Failed to load config for preview sizing:', e);
  }

  updateOverlayPreview();

  // Enter key to send chat
  const inputEl = document.getElementById('chatInput');
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChat();
    });
  }

  // Listen for Twitch chat messages via WebSocket
  window.onTwitchChat = (username, message) => {
    const escapedUser = username.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedMsg = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const isCommand = message.startsWith('!');
    addChatLog(`<span class="user">${escapedUser}:</span> ${escapedMsg}`, isCommand ? 'command' : '');
  };
};
