// Settings tab functionality
window.tabInitializers = window.tabInitializers || {};

tabInitializers.settings = async function() {
  await loadSettings();
};

async function loadSettings() {
  try {
    const response = await fetch('/env');
    if (!response.ok) throw new Error('Failed to load config');
    const config = await response.json();
    
    // Load debug settings from config.debug or use defaults
    const debugSettings = config.debug || {
      serverDebug: false,
      twitchDebug: false,
      twitchAuthErrors: false,
      twitchOtherErrors: false,
      verboseMessages: false,
      logToFile: false
    };
    
    // Set checkbox states
    document.getElementById('serverDebug').checked = debugSettings.serverDebug || false;
    document.getElementById('twitchDebug').checked = debugSettings.twitchDebug || false;
    document.getElementById('twitchAuthErrors').checked = debugSettings.twitchAuthErrors || false;
    document.getElementById('twitchOtherErrors').checked = debugSettings.twitchOtherErrors || false;
    document.getElementById('verboseMessages').checked = debugSettings.verboseMessages || false;
    document.getElementById('logToFile').checked = debugSettings.logToFile || false;
    
    // Display current settings
    updateCurrentSettingsDisplay(debugSettings);
    
    // Clear messages
    document.getElementById('settingsStatus').textContent = '';
    document.getElementById('settingsSuccess').textContent = '';
  } catch (err) {
    showError('settingsStatus', 'Failed to load settings: ' + err.message);
  }
}

async function saveSettings() {
  const settings = {
    serverDebug: document.getElementById('serverDebug').checked,
    twitchDebug: document.getElementById('twitchDebug').checked,
    twitchAuthErrors: document.getElementById('twitchAuthErrors').checked,
    twitchOtherErrors: document.getElementById('twitchOtherErrors').checked,
    verboseMessages: document.getElementById('verboseMessages').checked,
    logToFile: document.getElementById('logToFile').checked
  };
  
  try {
    // First, get current config
    const configResponse = await fetch('/env');
    if (!configResponse.ok) throw new Error('Failed to load current config');
    const currentConfig = await configResponse.json();
    
    // Merge settings into config
    const updatedConfig = {
      ...currentConfig,
      debug: settings
    };
    
    // Save via admin API
    const saveResponse = await fetch('/api/admin/saveConfig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedConfig)
    });
    
    if (!saveResponse.ok) {
      const error = await saveResponse.json();
      throw new Error(error.error || 'Failed to save settings');
    }
    
    showSuccess('settingsSuccess', 'Settings saved successfully!');
    updateCurrentSettingsDisplay(settings);
    
    // Apply settings immediately if possible
    applySettings(settings);
  } catch (err) {
    showError('settingsStatus', 'Failed to save settings: ' + err.message);
  }
}

function resetSettings() {
  if (confirm('Reset all settings to defaults?')) {
    document.getElementById('serverDebug').checked = false;
    document.getElementById('twitchDebug').checked = false;
    document.getElementById('twitchAuthErrors').checked = false;
    document.getElementById('twitchOtherErrors').checked = false;
    document.getElementById('verboseMessages').checked = false;
    document.getElementById('logToFile').checked = false;
    
    const defaults = {
      serverDebug: false,
      twitchDebug: false,
      twitchAuthErrors: false,
      twitchOtherErrors: false,
      verboseMessages: false,
      logToFile: false
    };
    
    updateCurrentSettingsDisplay(defaults);
    document.getElementById('settingsStatus').textContent = '';
    document.getElementById('settingsSuccess').textContent = '';
  }
}

function updateCurrentSettingsDisplay(settings) {
  const display = document.getElementById('currentSettings');
  const formatted = JSON.stringify(settings, null, 2);
  display.textContent = formatted;
}

function applySettings(settings) {
  // Send settings to server to apply dynamically
  fetch('/api/admin/applySettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  }).catch(err => {
    console.warn('Could not apply settings dynamically:', err.message);
  });
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.style.display = 'block';
  
  const successEl = document.getElementById('settingsSuccess');
  successEl.textContent = '';
  successEl.style.display = 'none';
}

function showSuccess(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.style.display = 'block';
  
  const errorEl = document.getElementById('settingsStatus');
  errorEl.textContent = '';
  errorEl.style.display = 'none';
}
