const fs = require('fs');
const path = require('path');

// Default overlay configuration (shared with dashboard and overlay client)
const DEFAULT_OVERLAY = {
  // Canvas
  canvasWidth: 1920,
  canvasHeight: 1080,
  groundY: 1080,
  // Physics
  gravity: 0.6,
  airResistance: 0.992,
  groundFriction: 0.92,
  bounceDamping: 0.65,
  minVelocity: 0.15,
  // Spawning
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
  // Lifetime
  spriteLifetimeMs: 30 * 60 * 1000,
  fadeWarningMs: 5 * 60 * 1000,
  // Collision
  collisionPersonalSpaceThreshold: 0.1,
  collisionForceMultiplier: 0.02,
  angularVelocityFromCollision: 0.0001,
  collisionProbabilityScaling: 1,
  collisionProbabilityLow: 0.0,
  collisionProbabilityMedium: 0.5,
  collisionProbabilityHigh: 1.0,
  collisionCountThresholdLow: 5,
  collisionCountThresholdHigh: 15,
  // Explosion
  explosionForceMultiplier: 60,
  explosionRadiusBase: 400,
  explosionRadiusVar: 300,
  explosionUpwardBias: 0.7,
  spinStrengthFactor: 0.05,
  randomJitterFactor: 0.2,
  explosionTimingJitter: 0.3,
  // Roaming
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
  // Visual
  textWidthPadding: 4,
  wiggleRange: 1000,
  // Particles
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
  // Other
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
  flipDurationMs: 5000,
  fightDurationMs: 10000,
  commandCooldownMs: 5000,
  jumpVelocity: -16,
  flipAngularVelocity: Math.PI / 2,
  fightCoinFlipProbability: 0.5
};

const { deepMerge } = require('./lib/util');

function loadConfig(cfgPath) {
  let cfg = null;
  let fileExists = false;
  try {
    if (fs.existsSync(cfgPath)) {
      fileExists = true;
      cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    }
  } catch (e) {
    console.warn('⚠ .env invalid or missing:', e.message);
  }

  const defaultCfg = {
    useServer: true,
    serverPort: 8080,
    debug: {
      serverDebug: false,
      twitchDebug: true,
      twitchAuthErrors: true,
      twitchOtherErrors: true,
      verboseMessages: false,
      logToFile: false
    },
    twitch: {
      clientId: "",
      clientSecret: "",
      botOAuthToken: "",
      refreshToken: ""
    },
    botUsername: "",
    channel: "",
    autoGenerateOAuth: false,
    autoConnect: false,
    autoOpenBrowser: true,
    dashboardPassword: ""
  };

  if (!cfg) {
    cfg = { ...defaultCfg };
  } else {
    let configChanged = false;

    function ensureDefaults(target, defaults, pathStr = '') {
      let changed = false;
      Object.keys(defaults).forEach(key => {
        const fullPath = pathStr ? `${pathStr}.${key}` : key;
        const defaultValue = defaults[key];
        if (typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)) {
          if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
            target[key] = { ...defaultValue };
            changed = true;
            console.log(`✓ Added missing config section: ${fullPath}`);
          } else {
            const nestedChanged = ensureDefaults(target[key], defaultValue, fullPath);
            changed = changed || nestedChanged;
          }
        } else {
          if (!(key in target)) {
            target[key] = defaultValue;
            changed = true;
            console.log(`✓ Added missing config: ${fullPath} (default: ${JSON.stringify(defaultValue)})`);
          } else if (typeof target[key] !== typeof defaultValue && defaultValue !== null) {
            target[key] = defaultValue;
            changed = true;
            console.log(`✓ Fixed type mismatch in config: ${fullPath}`);
          }
        }
      });
      return changed;
    }

    configChanged = ensureDefaults(cfg, defaultCfg);

    if (cfg.skins) {
      delete cfg.skins;
      configChanged = true;
    }

    if (configChanged) {
      try {
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        console.log('✓ Updated .env with missing default values');
      } catch (e) {
        console.warn('⚠ Could not update .env with defaults:', e.message);
      }
    }
  }

  if (!fileExists && cfg) {
    try {
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
      console.log('✓ Created .env with default values');
    } catch (e) {
      console.error('✗ Failed to create .env:', e.message);
      return null;
    }
  }

  console.log('✓ Loaded config from .env');
  return cfg;
}

module.exports = {
  DEFAULT_OVERLAY,
  loadConfig
};
