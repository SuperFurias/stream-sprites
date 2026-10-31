// Settings tab functionality
window.tabInitializers = window.tabInitializers || {};

// Initialize collapsible sections
function initCollapsibleSections() {
  const sections = document.querySelectorAll('.settings-section');
  
  sections.forEach(section => {
    const header = section.querySelector('.settings-section-header');
    if (!header) return;
    
    // Load saved state from localStorage, default to collapsed
    const sectionName = section.dataset.section;
    const savedState = localStorage.getItem('settingsSection_' + sectionName);
    const shouldBeCollapsed = savedState === null ? true : savedState === 'collapsed';
    
    if (shouldBeCollapsed) {
      section.classList.add('collapsed');
    }
    
    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
      const isCollapsed = section.classList.contains('collapsed');
      localStorage.setItem('settingsSection_' + sectionName, isCollapsed ? 'collapsed' : 'expanded');
    });
  });
}

tabInitializers.settings = async function() {
  initCollapsibleSections();
  await loadDefaultOverlay(); // Load defaults first
  await loadSettings(); // Then apply settings using defaults
};

// Load default overlay configuration from server
let defaultOverlay = null;
async function loadDefaultOverlay() {
  try {
    const res = await fetch('/env');
    if (res.ok) {
      const cfg = await res.json();
      defaultOverlay = cfg.defaultOverlay || cfg.overlay || {};
      if (!defaultOverlay || Object.keys(defaultOverlay).length === 0) {
        console.warn('defaultOverlay not available from server, using fallback');
        defaultOverlay = getFallbackDefaults();
      }
    } else {
      defaultOverlay = getFallbackDefaults();
    }
  } catch (e) {
    console.error('Failed to load default overlay:', e);
    defaultOverlay = getFallbackDefaults();
  }
}

// Fallback defaults in case server is unavailable (should match server/DEFAULT_OVERLAY)
function getFallbackDefaults() {
  return {
    canvasWidth: 1920,
    canvasHeight: 1080,
    groundY: 1080,
    gravity: 0.6,
    airResistance: 0.992,
    groundFriction: 0.92,
    bounceDamping: 0.65,
    minVelocity: 0.15,
    maxSprites: 1500,
    maxSpawnQuantity: 100,
    spawnThrottleMs: 700,
    spriteSizeMin: 30,
    spriteSizeMax: 80,
    spawnMaxTries: 8,
    spawnYOffset: 40,
    spawnJitter: 6,
    spawnBoundsPadding: 60,
    spawnSizePadding: 120,
    initialVelocity: 2,
    spriteLifetimeMs: 30 * 60 * 1000,
    fadeWarningMs: 5 * 60 * 1000,
    collisionPersonalSpaceThreshold: 0.1,
    collisionForceMultiplier: 0.02,
    angularVelocityFromCollision: 0.0001,
    collisionProbabilityScaling: 1,
    collisionProbabilityLow: 0.0,
    collisionProbabilityMedium: 0.5,
    collisionProbabilityHigh: 1.0,
    collisionCountThresholdLow: 5,
    collisionCountThresholdHigh: 15,
    explosionForceMultiplier: 60,
    explosionRadiusBase: 400,
    explosionRadiusVar: 300,
    explosionUpwardBias: 0.7,
    spinStrengthFactor: 0.05,
    randomJitterFactor: 0.2,
    explosionTimingJitter: 0.3,
    roamZoneYOffset: 30,
    roamDurationBase: 3000,
    roamDurationVar: 4000,
    roamDistanceThreshold: 5,
    roamWalkForceMultiplier: 0.2,
    roamWalkVerticalFactor: 0.3,
    roamSteerForceMultiplier: 0.1,
    roamSteerVerticalFactor: 0.2,
    roamArrivalThreshold: 10,
    roamRandomMoveChance: 0.03,
    roamRandomMoveForce: 0.3,
    roamRandomMoveVertical: 0.1,
    textWidthPadding: 4,
    wiggleRange: 1000,
    particleCountBase: 30,
    particleCountVar: 20,
    particleSpeedBase: 2,
    particleSpeedVar: 4,
    particleGravity: 0.1,
    particleDecayBase: 0.01,
    particleDecayVar: 0.02,
    particleSizeBase: 3,
    particleSizeVar: 5,
    particleHueBase: 10,
    particleHueRange: 60,
    nameLengthLimit: 32,
    velocityBump: 3,
    draggedGravity: 0.5,
    danceGravityFactor: -0.2,
    danceAngularVelocity: 0.1,
    tiltReturnTime: 1000,
    danceFrequency: 200,
    massDivisor: 1000,
    momentOfInertiaFactor: 0.5,
    heightScaleSit: 0.75,
    heightScaleIdle: 1.0,
    dtCap: 0.05,
    groundYMultiplier: 0.99,
    safetyNudgeDistance: 0.5,
    angularVelocityDecay: 0.98,
    angleDecay: 0.95,
    tiltAngularDecay: 0.9,
    tiltAngleThreshold: 0.01,
    lifetimeCleanupThreshold: 10,
    zoneSelectionBias: 0.7,
    spatialHashCellSize: 64,
    numZones: 5,
    avoidanceRadiusMultiplier: 2.0,
    sizeSimilarityThreshold: 0.85,
    expandedRadiusMultiplier: 4.0,
    sizeDiffThresholdLow: 0.7,
    sizeDiffAttractionMultiplier: 1.5,
    minAttractionDistance: 20,
    sizeDiffFactor: 2.0,
    attractionForceBase: 0.08,
    largerRepulsionFactor: 0.3,
    moderateRepulsionRadius: 1.0,
    moderateRepulsionForce: 0.08,
    centerPushRadius: 150,
    centerPushForce: 0.02,
    groundYCenterOffset: 0.8,
    directionChangeThreshold: 0.3,
    resizeDebounceMs: 100,
    networkFps: 30
  };
}

// Map of input IDs to overlay config keys
const overlayFieldMap = {
  // Canvas
  canvasWidth: 'canvasWidth',
  canvasHeight: 'canvasHeight',
  
  // Physics
  gravity: 'gravity',
  airResistance: 'airResistance',
  groundFriction: 'groundFriction',
  bounceDamping: 'bounceDamping',
  minVelocity: 'minVelocity',
  
  // Spawning
  maxSprites: 'maxSprites',
  maxSpawnQuantity: 'maxSpawnQuantity',
  spawnThrottleMs: 'spawnThrottleMs',
  spriteSizeMin: 'spriteSizeMin',
  spriteSizeMax: 'spriteSizeMax',
  spawnMaxTries: 'spawnMaxTries',
  spawnYOffset: 'spawnYOffset',
  spawnJitter: 'spawnJitter',
  spawnBoundsPadding: 'spawnBoundsPadding',
  spawnSizePadding: 'spawnSizePadding',
  initialVelocity: 'initialVelocity',
  
  // Lifetime
  spriteLifetimeMs: 'spriteLifetimeMs',
  fadeWarningMs: 'fadeWarningMs',
  
  // Collision
  collisionPersonalSpaceThreshold: 'collisionPersonalSpaceThreshold',
  collisionForceMultiplier: 'collisionForceMultiplier',
  collisionProbabilityScaling: 'collisionProbabilityScaling',
  collisionProbabilityLow: 'collisionProbabilityLow',
  collisionProbabilityMedium: 'collisionProbabilityMedium',
  collisionProbabilityHigh: 'collisionProbabilityHigh',
  collisionCountThresholdLow: 'collisionCountThresholdLow',
  collisionCountThresholdHigh: 'collisionCountThresholdHigh',
  
  // Explosion
  explosionForceMultiplier: 'explosionForceMultiplier',
  explosionRadiusBase: 'explosionRadiusBase',
  explosionRadiusVar: 'explosionRadiusVar',
  explosionUpwardBias: 'explosionUpwardBias',
  spinStrengthFactor: 'spinStrengthFactor',
  randomJitterFactor: 'randomJitterFactor',
  explosionTimingJitter: 'explosionTimingJitter',
  
  // Roaming
  roamZoneYOffset: 'roamZoneYOffset',
  roamDurationBase: 'roamDurationBase',
  roamDurationVar: 'roamDurationVar',
  roamDistanceThreshold: 'roamDistanceThreshold',
  roamWalkForceMultiplier: 'roamWalkForceMultiplier',
  roamWalkVerticalFactor: 'roamWalkVerticalFactor',
  roamSteerForceMultiplier: 'roamSteerForceMultiplier',
  roamSteerVerticalFactor: 'roamSteerVerticalFactor',
  roamArrivalThreshold: 'roamArrivalThreshold',
  roamRandomMoveChance: 'roamRandomMoveChance',
  roamRandomMoveForce: 'roamRandomMoveForce',
  roamRandomMoveVertical: 'roamRandomMoveVertical',
  
  // Visual
  textWidthPadding: 'textWidthPadding',
  wiggleRange: 'wiggleRange',
  
  // Particles
  particleCountBase: 'particleCountBase',
  particleCountVar: 'particleCountVar',
  particleSpeedBase: 'particleSpeedBase',
  particleSpeedVar: 'particleSpeedVar',
  particleGravity: 'particleGravity',
  particleDecayBase: 'particleDecayBase',
  particleDecayVar: 'particleDecayVar',
  particleSizeBase: 'particleSizeBase',
  particleSizeVar: 'particleSizeVar',
  particleHueBase: 'particleHueBase',
  particleHueRange: 'particleHueRange',
  
  // Movement & Animation
  nameLengthLimit: 'nameLengthLimit',
  velocityBump: 'velocityBump',
  draggedGravity: 'draggedGravity',
  danceGravityFactor: 'danceGravityFactor',
  danceAngularVelocity: 'danceAngularVelocity',
  tiltReturnTime: 'tiltReturnTime',
  danceFrequency: 'danceFrequency',
  massDivisor: 'massDivisor',
  momentOfInertiaFactor: 'momentOfInertiaFactor',
  heightScaleSit: 'heightScaleSit',
  heightScaleIdle: 'heightScaleIdle',
  dtCap: 'dtCap',
  groundYMultiplier: 'groundYMultiplier',
  safetyNudgeDistance: 'safetyNudgeDistance',
  angularVelocityDecay: 'angularVelocityDecay',
  angleDecay: 'angleDecay',
  tiltAngularDecay: 'tiltAngularDecay',
  tiltAngleThreshold: 'tiltAngleThreshold',
  lifetimeCleanupThreshold: 'lifetimeCleanupThreshold',
  zoneSelectionBias: 'zoneSelectionBias',
  spatialHashCellSize: 'spatialHashCellSize',
  numZones: 'numZones',
  avoidanceRadiusMultiplier: 'avoidanceRadiusMultiplier',
  sizeSimilarityThreshold: 'sizeSimilarityThreshold',
  expandedRadiusMultiplier: 'expandedRadiusMultiplier',
  sizeDiffThresholdLow: 'sizeDiffThresholdLow',
  sizeDiffAttractionMultiplier: 'sizeDiffAttractionMultiplier',
  minAttractionDistance: 'minAttractionDistance',
  sizeDiffFactor: 'sizeDiffFactor',
  attractionForceBase: 'attractionForceBase',
  largerRepulsionFactor: 'largerRepulsionFactor',
  moderateRepulsionRadius: 'moderateRepulsionRadius',
  moderateRepulsionForce: 'moderateRepulsionForce',
  centerPushRadius: 'centerPushRadius',
  centerPushForce: 'centerPushForce',
  groundYCenterOffset: 'groundYCenterOffset',
  directionChangeThreshold: 'directionChangeThreshold',
  resizeDebounceMs: 'resizeDebounceMs',
  networkFps: 'networkFps',
  commandCooldownMs: 'commandCooldownMs',
  flipDurationMs: 'flipDurationMs',
  fightDurationMs: 'fightDurationMs',
  jumpVelocity: 'jumpVelocity',
  flipAngularVelocity: 'flipAngularVelocity',
  fightCoinFlipProbability: 'fightCoinFlipProbability'
};

// These two inputs are expressed in minutes while the server stores milliseconds.
const MINUTE_FIELDS = new Set(['spriteLifetimeMs', 'fadeWarningMs']);

function toDisplayValue(fieldId, value) {
  if (!MINUTE_FIELDS.has(fieldId)) return value;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number / 60000) : value;
}

function fromDisplayValue(fieldId, value) {
  const number = parseFloat(value);
  if (!Number.isFinite(number)) return 0;
  return MINUTE_FIELDS.has(fieldId) ? Math.round(number * 60000) : number;
}

async function loadSettings() {
  try {
    const response = await fetch('/env');
    if (!response.ok) throw new Error('Failed to load config');
    const config = await response.json();
    
    // Load debug settings
    const debugSettings = config.debug || {
      serverDebug: false,
      twitchDebug: false,
      twitchAuthErrors: false,
      twitchOtherErrors: false,
      verboseMessages: false,
      logToFile: false
    };
    
    const el = (id) => document.getElementById(id);
    if(el('serverDebug')) el('serverDebug').checked = debugSettings.serverDebug || false;
    if(el('twitchDebug')) el('twitchDebug').checked = debugSettings.twitchDebug || false;
    if(el('twitchAuthErrors')) el('twitchAuthErrors').checked = debugSettings.twitchAuthErrors || false;
    if(el('twitchOtherErrors')) el('twitchOtherErrors').checked = debugSettings.twitchOtherErrors || false;
    if(el('verboseMessages')) el('verboseMessages').checked = debugSettings.verboseMessages || false;
    if(el('logToFile')) el('logToFile').checked = debugSettings.logToFile || false;
    
    // Load dashboard password
    if(el('dashboardPassword')) el('dashboardPassword').value = config.dashboardPassword || '';

    // Load overlay settings
    const overlay = config.overlay || {};
    for (const [fieldId, configKey] of Object.entries(overlayFieldMap)) {
      const input = document.getElementById(fieldId);
      if (input) {
        const value = overlay[configKey];
        if (value !== undefined) {
          input.value = toDisplayValue(fieldId, value);
        } else {
          // Use default if not present
          const defaultVal = defaultOverlay[configKey];
          if (defaultVal !== undefined) {
            input.value = toDisplayValue(fieldId, defaultVal);
          }
        }
      }
    }
    
    if(el('settingsStatus')) el('settingsStatus').textContent = '';
    if(el('settingsSuccess')) el('settingsSuccess').textContent = '';
  } catch (err) {
    showError('settingsStatus', 'Failed to load settings: ' + err.message);
  }
}

async function saveSettings() {
  // Collect debug settings
  const el = (id) => document.getElementById(id);
  const debugSettings = {
    serverDebug: el('serverDebug')?.checked || false,
    twitchDebug: el('twitchDebug')?.checked || false,
    twitchAuthErrors: el('twitchAuthErrors')?.checked || false,
    twitchOtherErrors: el('twitchOtherErrors')?.checked || false,
    verboseMessages: el('verboseMessages')?.checked || false,
    logToFile: el('logToFile')?.checked || false
  };
  
  // Collect overlay settings
  const overlaySettings = {};
  for (const [fieldId, configKey] of Object.entries(overlayFieldMap)) {
    const input = document.getElementById(fieldId);
    if (input) {
      overlaySettings[configKey] = input.type === 'number'
        ? fromDisplayValue(fieldId, input.value)
        : input.value;
    }
  }
  
  try {
    // Get current config
    const configResponse = await fetch('/env');
    if (!configResponse.ok) throw new Error('Failed to load current config');
    const currentConfig = await configResponse.json();
    
    // Merge settings
    const updatedConfig = {
      ...currentConfig,
      debug: debugSettings,
      overlay: overlaySettings,
      dashboardPassword: el('dashboardPassword')?.value || ''
    };
    
     // Save via local control API
     const saveResponse = await fetch('/api/local/saveConfig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedConfig)
    });
    
    if (!saveResponse.ok) {
      const error = await saveResponse.json();
      throw new Error(error.error || 'Failed to save settings');
    }
    
    showSuccess('settingsSuccess', 'Settings saved successfully! Server will reload config.');
    
    // Apply debug settings dynamically
    applySettings(debugSettings);
  } catch (err) {
    showError('settingsStatus', 'Failed to save settings: ' + err.message);
  }
}

function resetSettings() {
  if (!confirm('Reset all settings to defaults? This will clear all custom overlay configuration.')) return;
  
  // Reset debug checkboxes
  const el = (id) => document.getElementById(id);
  if(el('serverDebug')) el('serverDebug').checked = false;
  if(el('twitchDebug')) el('twitchDebug').checked = false;
  if(el('twitchAuthErrors')) el('twitchAuthErrors').checked = false;
  if(el('twitchOtherErrors')) el('twitchOtherErrors').checked = false;
  if(el('verboseMessages')) el('verboseMessages').checked = false;
  if(el('logToFile')) el('logToFile').checked = false;
  
  // Reset all overlay fields to defaults
  for (const [fieldId] of Object.entries(overlayFieldMap)) {
    const input = document.getElementById(fieldId);
    if (input) {
      const defaultVal = defaultOverlay[overlayFieldMap[fieldId]];
      if (defaultVal !== undefined) {
        input.value = toDisplayValue(fieldId, defaultVal);
      }
    }
  }
  
  if(el('settingsStatus')) el('settingsStatus').textContent = '';
  if(el('settingsSuccess')) el('settingsSuccess').textContent = '';
}

function applySettings(settings) {
   // Send settings to server to apply dynamically (debug settings only)
   fetch('/api/local/applySettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  }).catch(err => {
    console.warn('Could not apply settings dynamically:', err.message);
  });
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if(el) { el.textContent = message; el.style.display = 'block'; }
  
  const successEl = document.getElementById('settingsSuccess');
  if(successEl) { successEl.textContent = ''; successEl.style.display = 'none'; }
}

function showSuccess(elementId, message) {
  const el = document.getElementById(elementId);
  if(el) { el.textContent = message; el.style.display = 'block'; }
  
  const errorEl = document.getElementById('settingsStatus');
  if(errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }
}
