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

function openOverlayInBrowser() {
  window.open(getOverlayUrl(), '_blank');
}

async function copyOverlayUrl(button) {
  const url = getOverlayUrl();
  try {
    await navigator.clipboard.writeText(url);
  } catch (e) {
    const helper = document.createElement('textarea');
    helper.value = url;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (err) {
      copied = false;
    }
    helper.remove();
    if (!copied) {
      alert('Could not copy the overlay URL.');
      return;
    }
  }

  if (!button) return;
  const label = button.textContent;
  button.textContent = 'Copied';
  setTimeout(() => {
    if (button.isConnected) button.textContent = label;
  }, 1500);
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest?.('.action-card[role="button"]');
  if (!card) return;
  event.preventDefault();
  card.click();
});

// Chat functionality

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

const MAX_CHAT_LOG_LINES = 200;

function addChatLog(text, type) {
  const log = document.getElementById('chatLog');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'chat-msg' + (type ? ' ' + type : '');
  div.innerHTML = text;
  log.appendChild(div);
  while (log.children.length > MAX_CHAT_LOG_LINES) {
    log.removeChild(log.firstElementChild);
  }
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
      addChatLog(`<span class="system">→ ${escapeHtml(data.commandResult)}</span>`, 'system');
    }
  } catch (e) {
    addChatLog(`<span class="system">Error: ${escapeHtml(e.message)}</span>`, 'system');
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
    const escapedUser = escapeHtml(username);
    const escapedMsg = escapeHtml(message);
    const isCommand = message.startsWith('!');
    addChatLog(`<span class="user">${escapedUser}:</span> ${escapedMsg}`, isCommand ? 'command' : '');
  };
};
