// Configuration and constants module
export async function loadConfig() {
  const cfgResp = await fetch('/env').catch(() => null);
  const cfg = cfgResp ? await cfgResp.json() : null;
  if (!cfg) {
    document.body.innerHTML = '<div style="color:#fff;padding:20px">Missing /env endpoint. Copy server/.env to server/.env and edit it, then run server.</div>';
    return null;
  }
  return cfg;
}

export function getConfigConstants(cfg, overlay) {
  // Default values (used when .env doesn't specify a value)
  const defaults = {
    // Canvas
    canvasWidth: 1920,
    canvasHeight: 1080,
    groundY: 920,
    
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
    resizeDebounceMs: 100
  };
  
  // Merge .env overlay config with defaults (client-side fallback)
  const overlayConfig = { ...defaults, ...overlay };
  
  return {
    USE_SERVER: !!cfg.useServer,
    WS_URL: (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + (location.hostname || 'localhost') + ':' + (cfg.serverPort || 8080),
    CHANNEL: cfg.channel || '--',
    BOT_USERNAME: cfg.botUsername,
    OAUTH: cfg.oauth,
    DEBUG: cfg.debug || false,
    
    // Canvas
    CANVAS_WIDTH: overlayConfig.canvasWidth,
    CANVAS_HEIGHT: overlayConfig.canvasHeight,
    GROUND_Y: overlayConfig.groundY,
    
    // Physics
    GRAVITY: overlayConfig.gravity,
    AIR_RESISTANCE: overlayConfig.airResistance,
    GROUND_FRICTION: overlayConfig.groundFriction,
    BOUNCE_DAMPING: overlayConfig.bounceDamping,
    MIN_VELOCITY: overlayConfig.minVelocity,
    
    // Spawning
    MAX_SPRITES: overlayConfig.maxSprites,
    MAX_SPAWN_QUANTITY: overlayConfig.maxSpawnQuantity,
    SPAWN_THROTTLE_MS: overlayConfig.spawnThrottleMs,
    SPRITE_SIZE_MIN: overlayConfig.spriteSizeMin,
    SPRITE_SIZE_MAX: overlayConfig.spriteSizeMax,
    SPAWN_MAX_TRIES: overlayConfig.spawnMaxTries,
    SPAWN_Y_OFFSET: overlayConfig.spawnYOffset,
    SPAWN_JITTER: overlayConfig.spawnJitter,
    SPAWN_BOUNDS_PADDING: overlayConfig.spawnBoundsPadding,
    SPAWN_SIZE_PADDING: overlayConfig.spawnSizePadding,
    INITIAL_VELOCITY: overlayConfig.initialVelocity,
    
    // Lifetime
    SPRITE_LIFETIME_MS: overlayConfig.spriteLifetimeMs,
    FADE_WARNING_MS: overlayConfig.fadeWarningMs,
    
    // Collision
    COLLISION_PERSONAL_SPACE_THRESHOLD: overlayConfig.collisionPersonalSpaceThreshold,
    COLLISION_FORCE_MULTIPLIER: overlayConfig.collisionForceMultiplier,
    COLLISION_PROBABILITY_SCALING: overlayConfig.collisionProbabilityScaling,
    COLLISION_PROBABILITY_LOW: overlayConfig.collisionProbabilityLow,
    COLLISION_PROBABILITY_MEDIUM: overlayConfig.collisionProbabilityMedium,
    COLLISION_PROBABILITY_HIGH: overlayConfig.collisionProbabilityHigh,
    COLLISION_COUNT_THRESHOLD_LOW: overlayConfig.collisionCountThresholdLow,
    COLLISION_COUNT_THRESHOLD_HIGH: overlayConfig.collisionCountThresholdHigh,
    
    // Explosion
    EXPLOSION_FORCE_MULTIPLIER: overlayConfig.explosionForceMultiplier,
    EXPLOSION_RADIUS_BASE: overlayConfig.explosionRadiusBase,
    EXPLOSION_RADIUS_VAR: overlayConfig.explosionRadiusVar,
    EXPLOSION_UPWARD_BIAS: overlayConfig.explosionUpwardBias,
    SPIN_STRENGTH_FACTOR: overlayConfig.spinStrengthFactor,
    RANDOM_JITTER_FACTOR: overlayConfig.randomJitterFactor,
    EXPLOSION_TIMING_JITTER: overlayConfig.explosionTimingJitter,
    
    // Roaming
    ROAM_ZONE_Y_OFFSET: overlayConfig.roamZoneYOffset,
    ROAM_DURATION_BASE: overlayConfig.roamDurationBase,
    ROAM_DURATION_VAR: overlayConfig.roamDurationVar,
    ROAM_DISTANCE_THRESHOLD: overlayConfig.roamDistanceThreshold,
    ROAM_WALK_FORCE_MULTIPLIER: overlayConfig.roamWalkForceMultiplier,
    ROAM_WALK_VERTICAL_FACTOR: overlayConfig.roamWalkVerticalFactor,
    ROAM_STEER_FORCE_MULTIPLIER: overlayConfig.roamSteerForceMultiplier,
    ROAM_STEER_VERTICAL_FACTOR: overlayConfig.roamSteerVerticalFactor,
    ROAM_ARRIVAL_THRESHOLD: overlayConfig.roamArrivalThreshold,
    ROAM_RANDOM_MOVE_CHANCE: overlayConfig.roamRandomMoveChance,
    ROAM_RANDOM_MOVE_FORCE: overlayConfig.roamRandomMoveForce,
    ROAM_RANDOM_MOVE_VERTICAL: overlayConfig.roamRandomMoveVertical,
    
    // Visual
    TEXT_WIDTH_PADDING: overlayConfig.textWidthPadding,
    WIGGLE_RANGE: overlayConfig.wiggleRange,
    
    // Particles
    PARTICLE_COUNT_BASE: overlayConfig.particleCountBase,
    PARTICLE_COUNT_VAR: overlayConfig.particleCountVar,
    PARTICLE_SPEED_BASE: overlayConfig.particleSpeedBase,
    PARTICLE_SPEED_VAR: overlayConfig.particleSpeedVar,
    PARTICLE_GRAVITY: overlayConfig.particleGravity,
    PARTICLE_DECAY_BASE: overlayConfig.particleDecayBase,
    PARTICLE_DECAY_VAR: overlayConfig.particleDecayVar,
    PARTICLE_SIZE_BASE: overlayConfig.particleSizeBase,
    PARTICLE_SIZE_VAR: overlayConfig.particleSizeVar,
    PARTICLE_HUE_BASE: overlayConfig.particleHueBase,
    PARTICLE_HUE_RANGE: overlayConfig.particleHueRange,
    
    // Other
    NAME_LENGTH_LIMIT: overlayConfig.nameLengthLimit,
    VELOCITY_BUMP: overlayConfig.velocityBump,
    DRAGGED_GRAVITY: overlayConfig.draggedGravity,
    DANCE_GRAVITY_FACTOR: overlayConfig.danceGravityFactor,
    DANCE_ANGULAR_VELOCITY: overlayConfig.danceAngularVelocity,
    TILT_RETURN_TIME: overlayConfig.tiltReturnTime,
    DANCE_FREQUENCY: overlayConfig.danceFrequency,
    MASS_DIVISOR: overlayConfig.massDivisor,
    MOMENT_OF_INERTIA_FACTOR: overlayConfig.momentOfInertiaFactor,
    HEIGHT_SCALE_SIT: overlayConfig.heightScaleSit,
    HEIGHT_SCALE_IDLE: overlayConfig.heightScaleIdle,
    DT_CAP: overlayConfig.dtCap,
    GROUND_Y_MULTIPLIER: overlayConfig.groundYMultiplier,
    SAFETY_NUDGE_DISTANCE: overlayConfig.safetyNudgeDistance,
    ANGULAR_VELOCITY_DECAY: overlayConfig.angularVelocityDecay,
    ANGLE_DECAY: overlayConfig.angleDecay,
    TILT_ANGULAR_DECAY: overlayConfig.tiltAngularDecay,
    TILT_ANGLE_THRESHOLD: overlayConfig.tiltAngleThreshold,
    LIFETIME_CLEANUP_THRESHOLD: overlayConfig.lifetimeCleanupThreshold,
    ZONE_SELECTION_BIAS: overlayConfig.zoneSelectionBias,
    SPATIAL_HASH_CELL_SIZE: overlayConfig.spatialHashCellSize,
    NUM_ZONES: overlayConfig.numZones,
    AVOIDANCE_RADIUS_MULTIPLIER: overlayConfig.avoidanceRadiusMultiplier,
    SIZE_SIMILARITY_THRESHOLD: overlayConfig.sizeSimilarityThreshold,
    EXPANDED_RADIUS_MULTIPLIER: overlayConfig.expandedRadiusMultiplier,
    SIZE_DIFF_THRESHOLD_LOW: overlayConfig.sizeDiffThresholdLow,
    SIZE_DIFF_ATTRACTION_MULTIPLIER: overlayConfig.sizeDiffAttractionMultiplier,
    MIN_ATTRACTION_DISTANCE: overlayConfig.minAttractionDistance,
    SIZE_DIFF_FACTOR: overlayConfig.sizeDiffFactor,
    ATTRACTION_FORCE_BASE: overlayConfig.attractionForceBase,
    LARGER_REPULSION_FACTOR: overlayConfig.largerRepulsionFactor,
    MODERATE_REPULSION_RADIUS: overlayConfig.moderateRepulsionRadius,
    MODERATE_REPULSION_FORCE: overlayConfig.moderateRepulsionForce,
    CENTER_PUSH_RADIUS: overlayConfig.centerPushRadius,
    CENTER_PUSH_FORCE: overlayConfig.centerPushForce,
    GROUND_Y_CENTER_OFFSET: overlayConfig.groundYCenterOffset,
    DIRECTION_CHANGE_THRESHOLD: overlayConfig.directionChangeThreshold,
    RESIZE_DEBOUNCE_MS: overlayConfig.resizeDebounceMs
  };
}

// Internal constants (magic numbers extracted from codebase)
export const SPATIAL_HASH_CELL_SIZE = 64;
export const NUM_ZONES = 5;
export const AVOIDANCE_RADIUS_MULTIPLIER = 2.0;
export const SIZE_SIMILARITY_THRESHOLD = 0.85;
export const EXPANDED_RADIUS_MULTIPLIER = 4.0;
export const ZONE_SELECTION_BIAS = 0.7;
export const SIZE_DIFF_THRESHOLD_LOW = 0.7;
export const SIZE_DIFF_ATTRACTION_MULTIPLIER = 1.5;
export const MIN_ATTRACTION_DISTANCE = 20;
export const SIZE_DIFF_FACTOR = 2.0;
export const ATTRACTION_FORCE_BASE = 0.08;
export const LARGER_REPULSION_FACTOR = 0.3;
export const MODERATE_REPULSION_RADIUS = 1.0;
export const MODERATE_REPULSION_FORCE = 0.08;
export const CENTER_PUSH_RADIUS = 150;
export const CENTER_PUSH_FORCE = 0.02;
export const GROUND_Y_CENTER_OFFSET = 0.8;
export const DIRECTION_CHANGE_THRESHOLD = 0.3;
export const ANGULAR_VELOCITY_DECAY = 0.98;
export const ANGLE_DECAY = 0.95;
export const TILT_ANGULAR_DECAY = 0.9;
export const TILT_ANGLE_THRESHOLD = 0.01;
export const SPAWN_MAX_TRIES = 8;
export const SPAWN_Y_OFFSET = 40;
export const SPAWN_JITTER = 6;
export const MASS_DIVISOR = 1000;
export const MOMENT_OF_INERTIA_FACTOR = 0.5;
export const HEIGHT_SCALE_SIT = 0.75;
export const HEIGHT_SCALE_IDLE = 1.0;
export const DT_CAP = 0.05;
export const GROUND_Y_MULTIPLIER = 0.99;
export const SAFETY_NUDGE_DISTANCE = 0.5;
export const MAX_SPAWN_QUANTITY = 100;
export const VELOCITY_BUMP = 3;
export const NAME_LENGTH_LIMIT = 32;
export const RESIZE_DEBOUNCE_MS = 100;
export const DRAGGED_GRAVITY = 0.5;
export const EXPLOSION_FORCE_MULTIPLIER = 60;
export const EXPLOSION_RADIUS_BASE = 400;
export const EXPLOSION_RADIUS_VAR = 300;
export const EXPLOSION_UPWARD_BIAS = 0.7;
export const SPIN_STRENGTH_FACTOR = 0.05;
export const RANDOM_JITTER_FACTOR = 0.2;
export const DANCE_GRAVITY_FACTOR = -0.2;
export const DANCE_ANGULAR_VELOCITY = 0.1;
export const TILT_RETURN_TIME = 1000;
export const ROAM_ZONE_Y_OFFSET = 30;
export const DANCE_FREQUENCY = 200;
export const EXPLOSION_TIMING_JITTER = 0.3;
export const ROAM_DURATION_BASE = 3000;
export const ROAM_DURATION_VAR = 4000;
export const ROAM_DISTANCE_THRESHOLD = 5;
export const ROAM_WALK_FORCE_MULTIPLIER = 0.2;
export const ROAM_WALK_VERTICAL_FACTOR = 0.3;
export const ROAM_STEER_FORCE_MULTIPLIER = 0.1;
export const ROAM_STEER_VERTICAL_FACTOR = 0.2;
export const ROAM_ARRIVAL_THRESHOLD = 10;
export const ROAM_RANDOM_MOVE_CHANCE = 0.03;
export const ROAM_RANDOM_MOVE_FORCE = 0.3;
export const ROAM_RANDOM_MOVE_VERTICAL = 0.1;
export const COLLISION_PROBABILITY_SCALING = 1; // Used in utils.js
export const COLLISION_PERSONAL_SPACE_THRESHOLD = 0.1;
export const COLLISION_FORCE_MULTIPLIER = 0.02;
export const ANGULAR_VELOCITY_FROM_COLLISION = 0.0001;
export const LIFETIME_CLEANUP_THRESHOLD = 10;
export const TEXT_WIDTH_PADDING = 4;
export const SPAWN_BOUNDS_PADDING = 60;
export const INITIAL_VELOCITY = 2;
export const WIGGLE_RANGE = 1000;
export const SPAWN_SIZE_PADDING = 120;
export const PARTICLE_COUNT_BASE = 30;
export const PARTICLE_COUNT_VAR = 20;
export const PARTICLE_SPEED_BASE = 2;
export const PARTICLE_SPEED_VAR = 4;
export const PARTICLE_GRAVITY = 0.1;
export const PARTICLE_DECAY_BASE = 0.01;
export const PARTICLE_DECAY_VAR = 0.02;
export const PARTICLE_SIZE_BASE = 3;
export const PARTICLE_SIZE_VAR = 5;
export const PARTICLE_HUE_BASE = 10;
export const PARTICLE_HUE_RANGE = 60;
export const COLLISION_PROBABILITY_LOW = 0.0;
export const COLLISION_PROBABILITY_MEDIUM = 0.5;
export const COLLISION_PROBABILITY_HIGH = 1.0;
export const COLLISION_COUNT_THRESHOLD_LOW = 5;
export const COLLISION_COUNT_THRESHOLD_HIGH = 15;
