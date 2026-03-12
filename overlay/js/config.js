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
  // All overlay configuration comes from server's /env endpoint
  // The server provides defaults merged with user's .env values
  return {
    USE_SERVER: !!cfg.useServer,
    WS_URL: (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + (location.hostname || 'localhost') + ':' + (cfg.serverPort || 3000),
    CHANNEL: cfg.channel || '--',
    BOT_USERNAME: cfg.botUsername,
    OAUTH: cfg.oauth,
    DEBUG: cfg.debug || false,
    
    // Canvas
    CANVAS_WIDTH: overlay.canvasWidth,
    CANVAS_HEIGHT: overlay.canvasHeight,
    GROUND_Y: overlay.groundY,
    
    // Physics
    GRAVITY: overlay.gravity,
    AIR_RESISTANCE: overlay.airResistance,
    GROUND_FRICTION: overlay.groundFriction,
    BOUNCE_DAMPING: overlay.bounceDamping,
    MIN_VELOCITY: overlay.minVelocity,
    
    // Spawning
    MAX_AVATARS: overlay.maxAvatars,
    MAX_SPAWN_QUANTITY: overlay.maxSpawnQuantity,
    SPAWN_THROTTLE_MS: overlay.spawnThrottleMs,
    SPRITE_SIZE_MIN: overlay.spriteSizeMin,
    SPRITE_SIZE_MAX: overlay.spriteSizeMax,
    SPAWN_MAX_TRIES: overlay.spawnMaxTries,
    SPAWN_Y_OFFSET: overlay.spawnYOffset,
    SPAWN_JITTER: overlay.spawnJitter,
    SPAWN_BOUNDS_PADDING: overlay.spawnBoundsPadding,
    SPAWN_SIZE_PADDING: overlay.spawnSizePadding,
    INITIAL_VELOCITY: overlay.initialVelocity,
    
    // Lifetime
    SPRITE_LIFETIME_MS: overlay.spriteLifetimeMs,
    FADE_WARNING_MS: overlay.fadeWarningMs,
    
    // Collision
    COLLISION_PERSONAL_SPACE_THRESHOLD: overlay.collisionPersonalSpaceThreshold,
    COLLISION_FORCE_MULTIPLIER: overlay.collisionForceMultiplier,
    COLLISION_PROBABILITY_SCALING: overlay.collisionProbabilityScaling,
    COLLISION_PROBABILITY_LOW: overlay.collisionProbabilityLow,
    COLLISION_PROBABILITY_MEDIUM: overlay.collisionProbabilityMedium,
    COLLISION_PROBABILITY_HIGH: overlay.collisionProbabilityHigh,
    COLLISION_COUNT_THRESHOLD_LOW: overlay.collisionCountThresholdLow,
    COLLISION_COUNT_THRESHOLD_HIGH: overlay.collisionCountThresholdHigh,
    
    // Explosion
    EXPLOSION_FORCE_MULTIPLIER: overlay.explosionForceMultiplier,
    EXPLOSION_RADIUS_BASE: overlay.explosionRadiusBase,
    EXPLOSION_RADIUS_VAR: overlay.explosionRadiusVar,
    EXPLOSION_UPWARD_BIAS: overlay.explosionUpwardBias,
    SPIN_STRENGTH_FACTOR: overlay.spinStrengthFactor,
    RANDOM_JITTER_FACTOR: overlay.randomJitterFactor,
    EXPLOSION_TIMING_JITTER: overlay.explosionTimingJitter,
    
    // Roaming
    ROAM_ZONE_Y_OFFSET: overlay.roamZoneYOffset,
    ROAM_DURATION_BASE: overlay.roamDurationBase,
    ROAM_DURATION_VAR: overlay.roamDurationVar,
    ROAM_DISTANCE_THRESHOLD: overlay.roamDistanceThreshold,
    ROAM_WALK_FORCE_MULTIPLIER: overlay.roamWalkForceMultiplier,
    ROAM_WALK_VERTICAL_FACTOR: overlay.roamWalkVerticalFactor,
    ROAM_STEER_FORCE_MULTIPLIER: overlay.roamSteerForceMultiplier,
    ROAM_STEER_VERTICAL_FACTOR: overlay.roamSteerVerticalFactor,
    ROAM_ARRIVAL_THRESHOLD: overlay.roamArrivalThreshold,
    ROAM_RANDOM_MOVE_CHANCE: overlay.roamRandomMoveChance,
    ROAM_RANDOM_MOVE_FORCE: overlay.roamRandomMoveForce,
    ROAM_RANDOM_MOVE_VERTICAL: overlay.roamRandomMoveVertical,
    
    // Visual
    TEXT_WIDTH_PADDING: overlay.textWidthPadding,
    WIGGLE_RANGE: overlay.wiggleRange,
    
    // Particles
    PARTICLE_COUNT_BASE: overlay.particleCountBase,
    PARTICLE_COUNT_VAR: overlay.particleCountVar,
    PARTICLE_SPEED_BASE: overlay.particleSpeedBase,
    PARTICLE_SPEED_VAR: overlay.particleSpeedVar,
    PARTICLE_GRAVITY: overlay.particleGravity,
    PARTICLE_DECAY_BASE: overlay.particleDecayBase,
    PARTICLE_DECAY_VAR: overlay.particleDecayVar,
    PARTICLE_SIZE_BASE: overlay.particleSizeBase,
    PARTICLE_SIZE_VAR: overlay.particleSizeVar,
    PARTICLE_HUE_BASE: overlay.particleHueBase,
    PARTICLE_HUE_RANGE: overlay.particleHueRange,
    
    // Other
    NAME_LENGTH_LIMIT: overlay.nameLengthLimit,
    VELOCITY_BUMP: overlay.velocityBump,
    DRAGGED_GRAVITY: overlay.draggedGravity,
    DANCE_GRAVITY_FACTOR: overlay.danceGravityFactor,
    DANCE_ANGULAR_VELOCITY: overlay.danceAngularVelocity,
    TILT_RETURN_TIME: overlay.tiltReturnTime,
    DANCE_FREQUENCY: overlay.danceFrequency,
    MASS_DIVISOR: overlay.massDivisor,
    MOMENT_OF_INERTIA_FACTOR: overlay.momentOfInertiaFactor,
    HEIGHT_SCALE_SIT: overlay.heightScaleSit,
    HEIGHT_SCALE_IDLE: overlay.heightScaleIdle,
    DT_CAP: overlay.dtCap,
    GROUND_Y_MULTIPLIER: overlay.groundYMultiplier,
    SAFETY_NUDGE_DISTANCE: overlay.safetyNudgeDistance,
    ANGULAR_VELOCITY_DECAY: overlay.angularVelocityDecay,
    ANGLE_DECAY: overlay.angleDecay,
    TILT_ANGULAR_DECAY: overlay.tiltAngularDecay,
    TILT_ANGLE_THRESHOLD: overlay.tiltAngleThreshold,
    LIFETIME_CLEANUP_THRESHOLD: overlay.lifetimeCleanupThreshold,
    ZONE_SELECTION_BIAS: overlay.zoneSelectionBias,
    SPATIAL_HASH_CELL_SIZE: overlay.spatialHashCellSize,
    NUM_ZONES: overlay.numZones,
    AVOIDANCE_RADIUS_MULTIPLIER: overlay.avoidanceRadiusMultiplier,
    SIZE_SIMILARITY_THRESHOLD: overlay.sizeSimilarityThreshold,
    EXPANDED_RADIUS_MULTIPLIER: overlay.expandedRadiusMultiplier,
    SIZE_DIFF_THRESHOLD_LOW: overlay.sizeDiffThresholdLow,
    SIZE_DIFF_ATTRACTION_MULTIPLIER: overlay.sizeDiffAttractionMultiplier,
    MIN_ATTRACTION_DISTANCE: overlay.minAttractionDistance,
    SIZE_DIFF_FACTOR: overlay.sizeDiffFactor,
    ATTRACTION_FORCE_BASE: overlay.attractionForceBase,
    LARGER_REPULSION_FACTOR: overlay.largerRepulsionFactor,
    MODERATE_REPULSION_RADIUS: overlay.moderateRepulsionRadius,
    MODERATE_REPULSION_FORCE: overlay.moderateRepulsionForce,
    CENTER_PUSH_RADIUS: overlay.centerPushRadius,
    CENTER_PUSH_FORCE: overlay.centerPushForce,
    GROUND_Y_CENTER_OFFSET: overlay.groundYCenterOffset,
    DIRECTION_CHANGE_THRESHOLD: overlay.directionChangeThreshold,
    RESIZE_DEBOUNCE_MS: overlay.resizeDebounceMs
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
