// Config tab functions

function configShowError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.className = 'error';
  clearTimeout(el._fadeTimeout);
  el._fadeTimeout = setTimeout(() => { if(el) { el.textContent = ''; el.className = ''; } }, 2000);
}

function configShowSuccess(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.className = 'success';
  clearTimeout(el._fadeTimeout);
  el._fadeTimeout = setTimeout(() => { if(el) { el.textContent = ''; el.className = ''; } }, 2000);
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
}

async function loadConfig(silent){
  const statusEl = document.getElementById('configActionStatus');
  try{
    const res = await fetch('/env');
    if(!res.ok) throw new Error('config not found');
    const cfg = await res.json();
    updateFormFields(cfg, false);
    const tokenEl = document.getElementById('currentToken');
    if(tokenEl) {
      if (cfg.hasOAuthToken) {
        tokenEl.textContent = 'Set (hidden)';
        tokenEl.style.color = '#48bb78';
      } else {
        tokenEl.textContent = 'Not set';
        tokenEl.style.color = '#a0aec0';
      }
    }
    if(!silent && statusEl) configShowSuccess(statusEl, 'Config reloaded.');
  }catch(e){
    console.error('Failed to load config:', e);
    updateFormFields({}, true);
    if(!silent && statusEl) configShowError(statusEl, 'Failed to reload config.');
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
    await loadConfig(true);
    configShowSuccess(document.getElementById('configActionStatus'), '✓ ' + result.message + '!');
  }catch(e){
    configShowError(document.getElementById('configActionStatus'), '✗ ' + e.message);
  }
}

async function generateOAuth(){
  const clientId = document.getElementById('clientId').value.trim();
  const clientSecret = document.getElementById('clientSecret').value.trim();
  const statusEl = document.getElementById('configActionStatus');
  if(!clientId || !clientSecret){
    configShowError(statusEl, 'Fill Client ID and Client Secret first.');
    return;
  }
  // Check if values are saved to .env
  try {
    const cfg = await sharedAPI('/env');
    if(cfg.twitch?.clientId !== clientId || cfg.twitch?.clientSecret !== clientSecret){
      configShowError(statusEl, 'Click "Save Config" first.');
      return;
    }
  } catch(e) {
    configShowError(statusEl, 'Could not verify config. Try again.');
    return;
  }
  // Show success before redirect (takes a few seconds)
  configShowSuccess(statusEl, 'Redirecting to Twitch...');
  // Let server generate proper CSRF state and handle OAuth flow
  window.location.href = '/auth/twitch';
}

async function connectTwitch(){
  const btn = document.getElementById('connectTwitchBtn');
  const status = document.getElementById('configStatus');
  if(!btn || !status) return;
  btn.disabled = true;
  status.textContent = '';
  status.className = '';

  // Validate Bot Username and Channel
  const botUsername = document.getElementById('botUsername').value.trim();
  const channel = document.getElementById('channel').value.trim();
  if(!botUsername || !channel){
    configShowError(status, 'Fill Bot Username and Channel first.');
    btn.disabled = false;
    return;
  }

  // Validate OAuth Token exists
  try {
    const cfg = await sharedAPI('/env');
    if(!cfg.hasOAuthToken){
      configShowError(status, 'Generate an OAuth token first by clicking "Generate OAuth Token".');
      btn.disabled = false;
      return;
    }
  } catch(e){
    configShowError(status, 'Could not verify token status.');
    btn.disabled = false;
    return;
  }

  btn.textContent = 'Connecting...';

   try{
     const result = await sharedAPI('/api/local/connectTwitch', { method: 'POST' });
    if(result.error){
      throw new Error(result.error);
    }
    configShowSuccess(status, '✓ Twitch connected successfully!');
  }catch(e){
    configShowError(status, '✗ Connection failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Connect to Twitch';
  }
}

async function disconnectTwitch(){
  const btn = document.getElementById('disconnectTwitchBtn');
  const status = document.getElementById('configStatus');
  if(!btn || !status) return;
  btn.disabled = true;
  status.textContent = '';

   try{
     const result = await sharedAPI('/api/local/disconnectTwitch', { method: 'POST' });
    if(result.error){
      throw new Error(result.error);
    }
    configShowSuccess(status, '✓ Twitch disconnected successfully!');
  }catch(e){
    configShowError(status, '✗ Disconnect failed: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

// Register initializer
window.tabInitializers = window.tabInitializers || {};
window.tabInitializers.config = async function() {
  await loadConfig();

  // Validate Auto-Generate OAuth: requires Client ID and Client Secret
  // Use _hasListener flag on the element itself — new DOM elements won't have it
  const autoGenerateOAuthInput = document.getElementById('autoGenerateOAuth');
  const autoGenerateError = document.getElementById('autoGenerateError');
  if (autoGenerateOAuthInput && !autoGenerateOAuthInput._hasListener) {
    autoGenerateOAuthInput._hasListener = true;
    autoGenerateOAuthInput.addEventListener('change', function() {
      if(autoGenerateError) autoGenerateError.textContent = '';
      if (this.checked) {
        const clientId = document.getElementById('clientId').value.trim();
        const clientSecret = document.getElementById('clientSecret').value.trim();
        if (!clientId || !clientSecret) {
          this.checked = false;
          configShowError(autoGenerateError, 'Fill Client ID and Client Secret first.');
        }
      }
    });
  }

  // Validate Auto-Connect: requires Bot Username, Channel, and OAuth Token
  const autoConnectInput = document.getElementById('autoConnect');
  const autoConnectError = document.getElementById('autoConnectError');
  if (autoConnectInput && !autoConnectInput._hasListener) {
    autoConnectInput._hasListener = true;
    autoConnectInput.addEventListener('change', async function() {
      if(autoConnectError) autoConnectError.textContent = '';
      if (this.checked) {
        const botUsername = document.getElementById('botUsername').value.trim();
        const channel = document.getElementById('channel').value.trim();
        if (!botUsername || !channel) {
          this.checked = false;
          configShowError(autoConnectError, 'Fill Bot Username and Channel first.');
          return;
        }
        try {
          const cfg = await sharedAPI('/env');
          if (!cfg.hasOAuthToken) {
            this.checked = false;
            configShowError(autoConnectError, 'Generate an OAuth token first.');
          }
        } catch(e) {
          this.checked = false;
          configShowError(autoConnectError, 'Could not verify token status.');
        }
      }
    });
  }
};
