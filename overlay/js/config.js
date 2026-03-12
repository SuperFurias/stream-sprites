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
  return {
    USE_SERVER: !!cfg.useServer,
    WS_URL: (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + (location.hostname || 'localhost') + ':' + (cfg.serverPort || 3000),
    CHANNEL: cfg.channel || '--',
    BOT_USERNAME: cfg.botUsername,
    OAUTH: cfg.oauth,
    DEBUG: cfg.debug || false,
    
    // Canvas
    CANVAS_WIDTH: overlay.canvasWidth || 1920,
    CANVAS_HEIGHT: overlay.canvasHeight || 1080,
    GROUND_Y: overlay.groundY || 920,
    
    // Physics
    GRAVITY: overlay.gravity || 0.6,
    AIR_RESISTANCE: overlay.airResistance !== undefined ? overlay.airResistance : 0.992,
    GROUND_FRICTION: overlay.groundFriction !== undefined ? overlay.groundFriction : 0.92,
    BOUNCE_DAMPING: overlay.bounceDamping !== undefined ? overlay.bounceDamping : 0.65,
    MIN_VELOCITY: overlay.minVelocity !== undefined ? overlay.minVelocity : 0.15,
    
    // Spawning
    MAX_AVATARS: overlay.maxAvatars || 1500,
    MAX_SPAWN_QUANTITY: overlay.maxSpawnQuantity || 100,
    SPAWN_THROTTLE_MS: overlay.spawnThrottleMs || 700,
    SPRITE_SIZE_MIN: overlay.spriteSizeMin || 30,
    SPRITE_SIZE_MAX: overlay.spriteSizeMax || 80,
    SPAWN_MAX_TRIES: overlay.spawnMaxTries || 8,
    SPAWN_Y_OFFSET: overlay.spawnYOffset || 40,
    SPAWN_JITTER: overlay.spawnJitter || 6,
    SPAWN_BOUNDS_PADDING: overlay.spawnBoundsPadding || 60,
    SPAWN_SIZE_PADDING: overlay.spawnSizePadding || 120,
    INITIAL_VELOCITY: overlay.initialVelocity || 2,
    
    // Lifetime
    SPRITE_LIFETIME_MS: overlay.spriteLifetimeMs || 30 * 60 * 1000,
    FADE_WARNING_MS: overlay.fadeWarningMs || 5 * 60 * 1000,
    
    // Collision
    COLLISION_PERSONAL_SPACE_THRESHOLD: overlay.collisionPersonalSpaceThreshold !== undefined ? overlay.collisionPersonalSpaceThreshold : 0.1,
    COLLISION_FORCE_MULTIPLIER: overlay.collisionForceMultiplier !== undefined ? overlay.collisionForceMultiplier : 0.02,
    COLLISION_PROBABILITY_SCALING: overlay.collisionProbabilityScaling !== undefined ? overlay.collisionProbabilityScaling : 1,
    COLLISION_PROBABILITY_LOW: overlay.collisionProbabilityLow !== undefined ? overlay.collisionProbabilityLow : 0.0,
    COLLISION_PROBABILITY_MEDIUM: overlay.collisionProbabilityMedium !== undefined ? overlay.collisionProbabilityMedium : 0.5,
    COLLISION_PROBABILITY_HIGH: overlay.collisionProbabilityHigh !== undefined ? overlay.collisionProbabilityHigh : 1.0,
    COLLISION_COUNT_THRESHOLD_LOW: overlay.collisionCountThresholdLow || 5,
    COLLISION_COUNT_THRESHOLD_HIGH: overlay.collisionCountThresholdHigh || 15,
    
    // Explosion
    EXPLOSION_FORCE_MULTIPLIER: overlay.explosionForceMultiplier || 60,
    EXPLOSION_RADIUS_BASE: overlay.explosionRadiusBase || 400,
    EXPLOSION_RADIUS_VAR: overlay.explosionRadiusVar || 300,
    EXPLOSION_UPWARD_BIAS: overlay.explosionUpwardBias !== undefined ? overlay.explosionUpwardBias : 0.7,
    SPIN_STRENGTH_FACTOR: overlay.spinStrengthFactor !== undefined ? overlay.spinStrengthFactor : 0.05,
    RANDOM_JITTER_FACTOR: overlay.randomJitterFactor !== undefined ? overlay.randomJitterFactor : 0.2,
    EXPLOSION_TIMING_JITTER: overlay.explosionTimingJitter || 0.3,
    
    // Roaming
    ROAM_ZONE_Y_OFFSET: overlay.roamZoneYOffset || 30,
    ROAM_DURATION_BASE: overlay.roamDurationBase || 3000,
    ROAM_DURATION_VAR: overlay.roamDurationVar || 4000,
    ROAM_DISTANCE_THRESHOLD: overlay.roamDistanceThreshold || 5,
    ROAM_WALK_FORCE_MULTIPLIER: overlay.roamWalkForceMultiplier || 0.2,
    ROAM_WALK_VERTICAL_FACTOR: overlay.roamWalkVerticalFactor !== undefined ? overlay.roamWalkVerticalFactor : 0.3,
    ROAM_STEER_FORCE_MULTIPLIER: overlay.roamSteerForceMultiplier || 0.1,
    ROAM_STEER_VERTICAL_FACTOR: overlay.roamSteerVerticalFactor !== undefined ? overlay.roamSteerVerticalFactor : 0.2,
    ROAM_ARRIVAL_THRESHOLD: overlay.roamArrivalThreshold || 10,
    ROAM_RANDOM_MOVE_CHANCE: overlay.roamRandomMoveChance !== undefined ? overlay.roamRandomMoveChance : 0.03,
    ROAM_RANDOM_MOVE_FORCE: overlay.roamRandomMoveForce || 0.3,
    ROAM_RANDOM_MOVE_VERTICAL: overlay.roamRandomMoveVertical !== undefined ? overlay.roamRandomMoveVertical : 0.1,
    
    // Visual
    TEXT_WIDTH_PADDING: overlay.textWidthPadding || 4,
    WIGGLE_RANGE: overlay.wiggleRange || 1000,
    
    // Particles
    PARTICLE_COUNT_BASE: overlay.particleCountBase || 30,
    PARTICLE_COUNT_VAR: overlay.particleCountVar || 20,
    PARTICLE_SPEED_BASE: overlay.particleSpeedBase || 2,
    PARTICLE_SPEED_VAR: overlay.particleSpeedVar || 4,
    PARTICLE_GRAVITY: overlay.particleGravity !== undefined ? overlay.particleGravity : 0.1,
    PARTICLE_DECAY_BASE: overlay.particleDecayBase || 0.01,
    PARTICLE_DECAY_VAR: overlay.particleDecayVar || 0.02,
    PARTICLE_SIZE_BASE: overlay.particleSizeBase || 3,
    PARTICLE_SIZE_VAR: overlay.particleSizeVar || 5,
    PARTICLE_HUE_BASE: overlay.particleHueBase || 10,
    PARTICLE_HUE_RANGE: overlay.particleHueRange || 60,
    
    // Other
    NAME_LENGTH_LIMIT: overlay.nameLengthLimit || 32,
    VELOCITY_BUMP: overlay.velocityBump || 3,
    DRAGGED_GRAVITY: overlay.draggedGravity !== undefined ? overlay.draggedGravity : 0.5,
    DANCE_GRAVITY_FACTOR: overlay.danceGravityFactor !== undefined ? overlay.danceGravityFactor : -0.2,
    DANCE_ANGULAR_VELOCITY: overlay.danceAngularVelocity !== undefined ? overlay.danceAngularVelocity : 0.1,
    TILT_RETURN_TIME: overlay.tiltReturnTime || 1000,
    DANCE_FREQUENCY: overlay.danceFrequency || 200,
    MASS_DIVISOR: overlay.massDivisor || 1000,
    MOMENT_OF_INERTIA_FACTOR: overlay.momentOfInertiaFactor !== undefined ? overlay.momentOfInertiaFactor : 0.5,
    HEIGHT_SCALE_SIT: overlay.heightScaleSit !== undefined ? overlay.heightScaleSit : 0.75,
    HEIGHT_SCALE_IDLE: overlay.heightScaleIdle !== undefined ? overlay.heightScaleIdle : 1.0,
    DT_CAP: overlay.dtCap !== undefined ? overlay.dtCap : 0.05,
    GROUND_Y_MULTIPLIER: overlay.groundYMultiplier !== undefined ? overlay.groundYMultiplier : 0.99,
    SAFETY_NUDGE_DISTANCE: overlay.safetyNudgeDistance !== undefined ? overlay.safetyNudgeDistance : 0.5,
    ANGULAR_VELOCITY_DECAY: overlay.angularVelocityDecay !== undefined ? overlay.angularVelocityDecay : 0.98,
    ANGLE_DECAY: overlay.angleDecay !== undefined ? overlay.angleDecay : 0.95,
    TILT_ANGULAR_DECAY: overlay.tiltAngularDecay !== undefined ? overlay.tiltAngularDecay : 0.9,
    TILT_ANGLE_THRESHOLD: overlay.tiltAngleThreshold !== undefined ? overlay.tiltAngleThreshold : 0.01,
    LIFETIME_CLEANUP_THRESHOLD: overlay.lifetimeCleanupThreshold || 10,
    ZONE_SELECTION_BIAS: overlay.zoneSelectionBias !== undefined ? overlay.zoneSelectionBias : 0.7,
    SPATIAL_HASH_CELL_SIZE: overlay.spatialHashCellSize || 64,
    NUM_ZONES: overlay.numZones || 5,
    AVOIDANCE_RADIUS_MULTIPLIER: overlay.avoidanceRadiusMultiplier !== undefined ? overlay.avoidanceRadiusMultiplier : 2.0,
    SIZE_SIMILARITY_THRESHOLD: overlay.sizeSimilarityThreshold !== undefined ? overlay.sizeSimilarityThreshold : 0.85,
    EXPANDED_RADIUS_MULTIPLIER: overlay.expandedRadiusMultiplier !== undefined ? overlay.expandedRadiusMultiplier : 4.0,
    SIZE_DIFF_THRESHOLD_LOW: overlay.sizeDiffThresholdLow !== undefined ? overlay.sizeDiffThresholdLow : 0.7,
    SIZE_DIFF_ATTRACTION_MULTIPLIER: overlay.sizeDiffAttractionMultiplier !== undefined ? overlay.sizeDiffAttractionMultiplier : 1.5,
    MIN_ATTRACTION_DISTANCE: overlay.minAttractionDistance || 20,
    SIZE_DIFF_FACTOR: overlay.sizeDiffFactor !== undefined ? overlay.sizeDiffFactor : 2.0,
    ATTRACTION_FORCE_BASE: overlay.attractionForceBase !== undefined ? overlay.attractionForceBase : 0.08,
    LARGER_REPULSION_FACTOR: overlay.largerRepulsionFactor !== undefined ? overlay.largerRepulsionFactor : 0.3,
    MODERATE_REPULSION_RADIUS: overlay.moderateRepulsionRadius !== undefined ? overlay.moderateRepulsionRadius : 1.0,
    MODERATE_REPULSION_FORCE: overlay.moderateRepulsionForce !== undefined ? overlay.moderateRepulsionForce : 0.08,
    CENTER_PUSH_RADIUS: overlay.centerPushRadius || 150,
    CENTER_PUSH_FORCE: overlay.centerPushForce !== undefined ? overlay.centerPushForce : 0.02,
    GROUND_Y_CENTER_OFFSET: overlay.groundYCenterOffset !== undefined ? overlay.groundYCenterOffset : 0.8,
    DIRECTION_CHANGE_THRESHOLD: overlay.directionChangeThreshold !== undefined ? overlay.directionChangeThreshold : 0.3,
    RESIZE_DEBOUNCE_MS: overlay.resizeDebounceMs || 100
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
