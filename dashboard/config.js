// Config tab functions

async function loadConfig(){
  try{
    const res = await fetch('/config.json');
    if(!res.ok) throw new Error('config not found');
    const cfg = await res.json();
    updateFormFields(cfg, false);
    const tokenEl = document.getElementById('currentToken');
    if(tokenEl) tokenEl.textContent = cfg.twitch?.botOAuthToken || 'Not set';
  }catch(e){
    console.error('Failed to load config:', e);
    updateFormFields({}, true);
  }
}

function updateFormFields(cfg, clearValues = false){
  const clientIdInput = document.getElementById('clientId');
  const clientSecretInput = document.getElementById('clientSecret');
  const botUsernameInput = document.getElementById('botUsername');
  const channelInput = document.getElementById('channel');

  if(!clientIdInput || !clientSecretInput || !botUsernameInput || !channelInput) return;

  if(clearValues){
    clientIdInput.value = '';
    clientSecretInput.value = '';
    botUsernameInput.value = '';
    channelInput.value = '';
  } else {
    clientIdInput.value = cfg.twitch?.clientId || '';
    clientSecretInput.value = cfg.twitch?.clientSecret || '';
    botUsernameInput.value = cfg.botUsername || '';
    channelInput.value = cfg.channel || '';
  }
}

async function saveConfig(){
  const saveBtn = document.getElementById('saveConfig');
  if(!saveBtn) return;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try{
    const res = await fetch('/config.json');
    if(!res.ok) throw new Error('config not found');
    const currentCfg = await res.json();

    const cfg = {
      ...currentCfg,
      twitch: {
        ...currentCfg.twitch || {},
        clientId: document.getElementById('clientId').value.trim(),
        clientSecret: document.getElementById('clientSecret').value.trim(),
        redirectUri: 'http://localhost:3000/auth/callback'
      },
      botUsername: document.getElementById('botUsername').value.trim(),
      channel: document.getElementById('channel').value.trim()
    };

    if(!cfg.twitch.clientId || !cfg.twitch.clientSecret || !cfg.botUsername || !cfg.channel){
      alert('Please fill in all required fields');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Config';
      return;
    }

    const result = await sharedAPI('/api/admin/saveConfig', { method:'POST', body: JSON.stringify(cfg) });
    alert('✓ Config saved! ' + (result.message || ''));
    await loadConfig();
  }catch(e){
    alert('✗ Save error: ' + e.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Config';
  }
}

async function generateOAuth(){
  const clientId = document.getElementById('clientId').value;
  const botUsername = document.getElementById('botUsername').value;
  if(!clientId || !botUsername){
    alert('Set Client ID and Bot Username first');
    return;
  }
  window.location.href = '/auth/twitch?state=' + encodeURIComponent(botUsername);
}

async function connectTwitch(){
  const btn = document.getElementById('connectTwitchBtn');
  const status = document.getElementById('twitchStatus');
  if(!btn || !status) return;
  btn.disabled = true;
  btn.textContent = 'Connecting...';
  status.textContent = '';

  try{
    const result = await sharedAPI('/api/admin/connectTwitch', { method: 'POST' });
    if(result.error){
      throw new Error(result.error);
    }
    status.textContent = '✓ Twitch connected successfully!';
    status.className = 'success';
  }catch(e){
    status.textContent = '✗ Connection failed: ' + e.message;
    status.className = 'error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Connect to Twitch';
  }
}

async function disconnectTwitch(){
  const btn = document.getElementById('disconnectTwitchBtn');
  const status = document.getElementById('twitchStatus');
  if(!btn || !status) return;
  btn.disabled = true;
  btn.textContent = 'Disconnecting...';
  status.textContent = '';

  try{
    const result = await sharedAPI('/api/admin/disconnectTwitch', { method: 'POST' });
    if(result.error){
      throw new Error(result.error);
    }
    status.textContent = '✓ Twitch disconnected successfully!';
    status.className = 'success';
  }catch(e){
    status.textContent = '✗ Disconnect failed: ' + e.message;
    status.className = 'error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Disconnect';
  }
}

// Register initializer
window.tabInitializers = window.tabInitializers || {};
window.tabInitializers.config = async function() {
  await loadConfig();
};
