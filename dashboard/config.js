// Config tab functions

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'hide';
  } else {
    input.type = 'password';
    btn.innerHTML = '&#128065;';
  }
}

async function loadConfig(){
  try{
    const res = await fetch('/env');
    if(!res.ok) throw new Error('config not found');
    const cfg = await res.json();
    updateFormFields(cfg, false);
    const tokenEl = document.getElementById('currentToken');
    if(tokenEl) {
      // Use hasOAuthToken flag to show status without exposing token
      if (cfg.hasOAuthToken) {
        tokenEl.textContent = 'Set (hidden)';
        tokenEl.style.color = '#48bb78'; // green color for set status
      } else {
        tokenEl.textContent = 'Not set';
        tokenEl.style.color = '#a0aec0'; // gray color for not set
      }
    }
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
  const autoGenerateOAuthInput = document.getElementById('autoGenerateOAuth');
  const autoConnectInput = document.getElementById('autoConnect');

  if(!clientIdInput || !clientSecretInput || !botUsernameInput || !channelInput) return;

  if(clearValues){
    clientIdInput.value = '';
    clientSecretInput.value = '';
    botUsernameInput.value = '';
    channelInput.value = '';
    if(autoGenerateOAuthInput) autoGenerateOAuthInput.checked = false;
    if(autoConnectInput) autoConnectInput.checked = false;
  } else {
    clientIdInput.value = cfg.twitch?.clientId || '';
    clientSecretInput.value = cfg.twitch?.clientSecret || '';
    botUsernameInput.value = cfg.botUsername || '';
    channelInput.value = cfg.channel || '';
    if(autoGenerateOAuthInput) autoGenerateOAuthInput.checked = cfg.autoGenerateOAuth || false;
    if(autoConnectInput) autoConnectInput.checked = cfg.autoConnect || false;
  }
}

async function saveConfig(){
  const saveBtn = document.getElementById('saveConfig');
  if(!saveBtn) return;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try{
    const res = await fetch('/env');
    if(!res.ok) throw new Error('config not found');
    const currentCfg = await res.json();

    const autoGenerateOAuthInput = document.getElementById('autoGenerateOAuth');
    const autoGenerateOAuth = autoGenerateOAuthInput ? autoGenerateOAuthInput.checked : false;
    const autoConnectInput = document.getElementById('autoConnect');
    const autoConnect = autoConnectInput ? autoConnectInput.checked : false;
    
    const cfg = {
      ...currentCfg,
      autoGenerateOAuth: autoGenerateOAuth,
      autoConnect: autoConnect,
      twitch: {
        ...currentCfg.twitch || {},
        clientId: document.getElementById('clientId').value.trim(),
        clientSecret: document.getElementById('clientSecret').value.trim()
      },
      botUsername: document.getElementById('botUsername').value.trim(),
      channel: document.getElementById('channel').value.trim()
    };

     const result = await sharedAPI('/api/local/saveConfig', { method:'POST', body: JSON.stringify(cfg) });
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
  const clientSecret = document.getElementById('clientSecret').value;
  const botUsername = document.getElementById('botUsername').value;
  if(!clientId || !clientSecret || !botUsername){
    alert('Set Client ID, Client Secret, and Bot Username first');
    return;
  }
  // Let server generate proper CSRF state and handle OAuth flow
  window.location.href = '/auth/twitch';
}

async function connectTwitch(){
  const btn = document.getElementById('connectTwitchBtn');
  const status = document.getElementById('twitchStatus');
  if(!btn || !status) return;
  btn.disabled = true;
  btn.textContent = 'Connecting...';
  status.textContent = '';

   try{
     const result = await sharedAPI('/api/local/connectTwitch', { method: 'POST' });
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
     const result = await sharedAPI('/api/local/disconnectTwitch', { method: 'POST' });
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
