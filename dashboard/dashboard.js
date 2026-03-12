// Dashboard tab functions

async function clearAvatars(){
  if(!confirm('Clear all avatars from overlay?')) return;
  await sharedAPI('/api/admin/clearAvatars', { method:'POST' });
  alert('Avatars cleared');
}

async function resetAll(){
  if(!confirm('Delete ALL user skin assignments? This cannot be undone.')) return;
  await sharedAPI('/api/admin/resetAll', { method:'POST' });
  alert('All assignments reset');
}

async function refreshAllOverlays(){
  try{
    const res = await fetch('/api/admin/refreshAllOverlays', { method:'POST' });
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
    const res = await fetch('/api/admin/restartServer', { method:'POST' });
    if(!res.ok) throw new Error('Failed to restart');
    const data = await res.json();
    alert('✓ ' + data.message + ' The dashboard will automatically reconnect...');
    // The refreshStats interval (every 5s) will automatically reconnect when server is back
  }catch(e){
    alert('✗ Error: ' + e.message);
  }
}

// Preview functionality
let overlayPort = 3000; // default

async function loadOverlayPort() {
  try {
    const res = await fetch('/env');
    if (!res.ok) throw new Error('config not found');
    const cfg = await res.json();
    overlayPort = cfg.serverPort || 3000;
    console.log('Overlay port loaded:', overlayPort);
    updateOverlayPreview();
  } catch (e) {
    console.error('Failed to load config for preview:', e);
    overlayPort = 3000;
    updateOverlayPreview();
  }
}

function updateOverlayPreview() {
  const iframe = document.getElementById('overlayPreview');
  if (iframe) {
    iframe.src = `http://localhost:${overlayPort}/overlay/overlay.html`;
  }
}

function refreshPreview() {
  const iframe = document.getElementById('overlayPreview');
  if (iframe) {
    iframe.src = iframe.src;
  }
}

function openOverlayInNewTab() {
  const iframe = document.getElementById('overlayPreview');
  if (iframe && iframe.src) {
    window.open(iframe.src, '_blank');
  }
}

// Register initializer
window.tabInitializers = window.tabInitializers || {};
window.tabInitializers.dashboard = async function() {
  console.log('Dashboard tab initialized');
  await loadOverlayPort();
};
