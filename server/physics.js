// Server-side physics engine — mirrors overlay physics for server-authoritative simulation
// All sprites' physics (position, velocity, size, angle) are computed here
// and broadcast to all clients for synchronized rendering

const { DEFAULT_OVERLAY } = require('./config');

// ── Spatial Hash ──────────────────────────────────────────────────────────

class SpatialHash {
  constructor(cellSize, width, height) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.buckets = new Map();
    this._querySet = new Set();
  }

  _key(cx, cy) { return cx + ',' + cy; }

  insert(obj) {
    const radius = obj.collisionRadius || obj.size / 2;
    const minx = Math.floor((obj.x - radius) / this.cellSize);
    const maxx = Math.floor((obj.x + radius) / this.cellSize);
    const miny = Math.floor((obj.y - radius) / this.cellSize);
    const maxy = Math.floor((obj.y + radius) / this.cellSize);
    for (let i = minx; i <= maxx; i++) {
      for (let j = miny; j <= maxy; j++) {
        const k = this._key(i, j);
        if (!this.buckets.has(k)) this.buckets.set(k, []);
        this.buckets.get(k).push(obj);
      }
    }
  }

  query(obj, excludeSelf) {
    const results = this._querySet;
    results.clear();
    const radius = obj.collisionRadius || obj.size / 2;
    const minx = Math.floor((obj.x - radius) / this.cellSize);
    const maxx = Math.floor((obj.x + radius) / this.cellSize);
    const miny = Math.floor((obj.y - radius) / this.cellSize);
    const maxy = Math.floor((obj.y + radius) / this.cellSize);
    for (let i = minx; i <= maxx; i++) {
      for (let j = miny; j <= maxy; j++) {
        const k = this._key(i, j);
        const arr = this.buckets.get(k);
        if (arr) {
          for (let n = 0; n < arr.length; n++) {
            const o = arr[n];
            if (o !== excludeSelf) results.add(o);
          }
        }
      }
    }
    return results;
  }

  clear() { this.buckets.clear(); }

  reinitialize(cellSize, width, height) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.buckets.clear();
  }
}

// ── Constants ─────────────────────────────────────────────────────────────

const D = DEFAULT_OVERLAY;
const SPATIAL_HASH_CELL_SIZE = D.spatialHashCellSize;
const NUM_ZONES = D.numZones;
const AVOIDANCE_RADIUS_MULTIPLIER = D.avoidanceRadiusMultiplier;
const SIZE_SIMILARITY_THRESHOLD = D.sizeSimilarityThreshold;
const EXPANDED_RADIUS_MULTIPLIER = D.expandedRadiusMultiplier;
const ZONE_SELECTION_BIAS = D.zoneSelectionBias;
const SIZE_DIFF_THRESHOLD_LOW = D.sizeDiffThresholdLow;
const MIN_ATTRACTION_DISTANCE = D.minAttractionDistance;
const SIZE_DIFF_FACTOR = D.sizeDiffFactor;
const ATTRACTION_FORCE_BASE = D.attractionForceBase;
const LARGER_REPULSION_FACTOR = D.largerRepulsionFactor;
const MODERATE_REPULSION_FORCE = D.moderateRepulsionForce;
const CENTER_PUSH_RADIUS = D.centerPushRadius;
const CENTER_PUSH_FORCE = D.centerPushForce;
const GROUND_Y_CENTER_OFFSET = D.groundYCenterOffset;
const DIRECTION_CHANGE_THRESHOLD = D.directionChangeThreshold;
const ANGULAR_VELOCITY_DECAY = D.angularVelocityDecay;
const ANGLE_DECAY = D.angleDecay;
const TILT_ANGULAR_DECAY = D.tiltAngularDecay;
const TILT_ANGLE_THRESHOLD = D.tiltAngleThreshold;
const TILT_RETURN_TIME = D.tiltReturnTime;
const ROAM_ZONE_Y_OFFSET = D.roamZoneYOffset;
const ROAM_DURATION_BASE = D.roamDurationBase;
const ROAM_DURATION_VAR = D.roamDurationVar;
const ROAM_DISTANCE_THRESHOLD = D.roamDistanceThreshold;
const ROAM_WALK_FORCE_MULTIPLIER = D.roamWalkForceMultiplier;
const ROAM_WALK_VERTICAL_FACTOR = D.roamWalkVerticalFactor;
const ROAM_STEER_FORCE_MULTIPLIER = D.roamSteerForceMultiplier;
const ROAM_STEER_VERTICAL_FACTOR = D.roamSteerVerticalFactor;
const ROAM_ARRIVAL_THRESHOLD = D.roamArrivalThreshold;
const ROAM_RANDOM_MOVE_CHANCE = D.roamRandomMoveChance;
const ROAM_RANDOM_MOVE_FORCE = D.roamRandomMoveForce;
const ROAM_RANDOM_MOVE_VERTICAL = D.roamRandomMoveVertical;
const COLLISION_FORCE_MULTIPLIER = D.collisionForceMultiplier;
const COLLISION_PERSONAL_SPACE_THRESHOLD = D.collisionPersonalSpaceThreshold;
const ANGULAR_VELOCITY_FROM_COLLISION = D.angularVelocityFromCollision;
const DANCE_GRAVITY_FACTOR = D.danceGravityFactor;
const DANCE_ANGULAR_VELOCITY = D.danceAngularVelocity;
const DANCE_FREQUENCY = D.danceFrequency;
const TEXT_WIDTH_PADDING = D.textWidthPadding;
const WIGGLE_RANGE = D.wiggleRange;
const MASS_DIVISOR = D.massDivisor;
const MOMENT_OF_INERTIA_FACTOR = D.momentOfInertiaFactor;
const HEIGHT_SCALE_SIT = D.heightScaleSit;
const HEIGHT_SCALE_IDLE = D.heightScaleIdle;
const DT_CAP = D.dtCap;
const SPAWN_BOUNDS_PADDING = D.spawnBoundsPadding;
const SPAWN_SIZE_PADDING = D.spawnSizePadding;
const SPAWN_Y_OFFSET = D.spawnYOffset;
const SPAWN_JITTER = D.spawnJitter;
const VELOCITY_BUMP = D.velocityBump;
const COLLISION_PROBABILITY_LOW = D.collisionProbabilityLow;
const COLLISION_PROBABILITY_MEDIUM = D.collisionProbabilityMedium;
const COLLISION_PROBABILITY_HIGH = D.collisionProbabilityHigh;
const COLLISION_COUNT_THRESHOLD_LOW = D.collisionCountThresholdLow;
const COLLISION_COUNT_THRESHOLD_HIGH = D.collisionCountThresholdHigh;
const FLIP_ANGULAR_VELOCITY = D.flipAngularVelocity;
const JUMP_VELOCITY = D.jumpVelocity;
const COLLISION_PROBABILITY_SCALING = D.collisionProbabilityScaling;

// Live configuration. The overlay settings dashboard changes these values at
// runtime; the constants above are only the defaults used before the first
// configuration is applied.
let activeConfig = { ...DEFAULT_OVERLAY };

function setPhysicsConfig(overlayConfig) {
  activeConfig = { ...DEFAULT_OVERLAY, ...(overlayConfig || {}) };
}

function getPhysicsConfig() {
  return activeConfig;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function bounded(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

// ── Utility ───────────────────────────────────────────────────────────────

// Simple hash for deterministic size from username
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Deterministic text width estimation (no canvas available server-side)
function estimateTextWidth(username) {
  let w = 0;
  for (let i = 0; i < username.length; i++) {
    const c = username.charCodeAt(i);
    if (c >= 0x4E00 && c <= 0x9FFF) w += 13;
    else if (c >= 0xAC00 && c <= 0xD7AF) w += 13;
    else if (c >= 0x0400 && c <= 0x04FF) w += 8;
    else if ((c >= 0x0041 && c <= 0x005A) || (c >= 0x0061 && c <= 0x007A)) w += 7.5;
    else if (c >= 0x0030 && c <= 0x0039) w += 7.5;
    else w += 5;
  }
  return w;
}

function getCollisionProbability(count) {
  const C = activeConfig;
  const thresholdLow = Math.max(1, Number(C.collisionCountThresholdLow) || COLLISION_COUNT_THRESHOLD_LOW);
  const thresholdHigh = Math.max(thresholdLow, Number(C.collisionCountThresholdHigh) || COLLISION_COUNT_THRESHOLD_HIGH);
  let probability;
  if (count < thresholdLow) {
    probability = bounded(C.collisionProbabilityLow, 0, 1, COLLISION_PROBABILITY_LOW);
  } else if (count < thresholdHigh) {
    probability = bounded(C.collisionProbabilityMedium, 0, 1, COLLISION_PROBABILITY_MEDIUM);
  } else {
    probability = bounded(C.collisionProbabilityHigh, 0, 1, COLLISION_PROBABILITY_HIGH);
  }
  const scaling = bounded(C.collisionProbabilityScaling, 0, 2, COLLISION_PROBABILITY_SCALING);
  return Math.min(1, Math.max(0, probability * scaling));
}

function colorFromName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i);
    h |= 0;
  }
  return 'hsl(' + (Math.abs(h) % 360) + ' 70% 50%)';
}

// ── Sprite Creation ──────────────────────────────────────────────────────

function createServerSprite(username, W, GROUND_Y, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX) {
  const C = activeConfig;

  // Deterministic size based on username hash
  const sizeHash = hashString(username + '_size');
  const sizeRatio = (sizeHash % 10000) / 10000;
  const size = SPRITE_SIZE_MIN + sizeRatio * (SPRITE_SIZE_MAX - SPRITE_SIZE_MIN);

  const textWidth = estimateTextWidth(username);
  const collisionRadius = size / 2;
  const boundaryRadius = Math.max(size / 2, textWidth / 2 + positive(C.textWidthPadding, TEXT_WIDTH_PADDING));
  const mass = Math.PI * Math.pow(size / 2, 2) / positive(C.massDivisor, MASS_DIVISOR);
  const momentOfInertia = positive(C.momentOfInertiaFactor, MOMENT_OF_INERTIA_FACTOR) * mass * Math.pow(size / 2, 2);

  // Deterministic spawn position (X is randomized, Y snapped to ground)
  const posHash = hashString(username + '_pos');
  const posRatio = (posHash % 10000) / 10000;
  const jitterHash = hashString(username + '_jitter');
  const jitterRatio = ((jitterHash % 10000) / 10000 - 0.5);

  const sizePadding = Math.max(0, positive(C.spawnSizePadding, SPAWN_SIZE_PADDING));
  const boundsPadding = Math.max(0, positive(C.spawnBoundsPadding, SPAWN_BOUNDS_PADDING));
  const spawnJitter = Math.max(0, Number(C.spawnJitter) || 0);
  let x = boundsPadding + posRatio * Math.max(1, W - sizePadding - boundsPadding);
  const spawnYOffset = Math.max(0, Number(C.spawnYOffset) || 0);
  const yOffsetHash = hashString(username + '_yoffset');
  const yOffsetRatio = (yOffsetHash % 10000) / 10000;
  let y = GROUND_Y - collisionRadius - yOffsetRatio * spawnYOffset;
  x += jitterRatio * spawnJitter;

  // Deterministic initial velocity, scaled by the configured initial velocity.
  const vxHash = hashString(username + '_vx');
  const initialVelocity = Math.max(0, Number(C.initialVelocity) || 0);
  const vx = ((vxHash % 10000) / 10000 - 0.5) * initialVelocity;

  // Deterministic wiggle
  const wiggleHash = hashString(username + '_wiggle');
  const wiggle = (wiggleHash % 10000) / 10000 * Math.max(0, Number(C.wiggleRange) || 0);

  return {
    id: username.toLowerCase(),
    username,
    x, y,
    vx,
    vy: 0,
    size,
    textWidth,
    collisionRadius,
    boundaryRadius,
    color: colorFromName(username),
    state: 'idle',
    createdAt: Date.now(),
    lastActivity: Date.now(),
    wiggle,
    mass,
    momentOfInertia,
    angularVelocity: 0,
    angle: 0,
    lastTiltTime: null,
    opacity: 1.0,
    heightScale: 1.0,
    roamTargetX: null,
    roamTargetY: null,
    roamSpeed: 1.0,
    roamTimer: 0,
    roamDuration: 0,
    facingRight: true,
    flipUntil: null,
    isExhausted: false,
    isFighting: false,
    markedForRemoval: false
  };
}

// ── Physics Update ────────────────────────────────────────────────────────

const spatialHash = new SpatialHash(SPATIAL_HASH_CELL_SIZE, 1920, 1080);

function updatePhysics(dt, spriteArray, W, H, GROUND_Y, GRAVITY, AIR_RESISTANCE,
                        GROUND_FRICTION, BOUNCE_DAMPING, MIN_VELOCITY) {
  const arr = spriteArray;
  const now = Date.now();
  const C = activeConfig;

  const cellSize = Math.max(8, Math.min(512, Math.round(positive(C.spatialHashCellSize, SPATIAL_HASH_CELL_SIZE))));
  const numZones = Math.max(1, Math.min(20, Math.round(positive(C.numZones, NUM_ZONES))));

  spatialHash.reinitialize(cellSize, W, H);
  for (const s of arr) spatialHash.insert(s);

  const zoneWidth = W / numZones;
  const zoneCounts = new Array(numZones).fill(0);
  for (const s of arr) {
    const zone = Math.floor(s.x / zoneWidth);
    if (zone >= 0 && zone < numZones) zoneCounts[zone]++;
  }
  const avgDensity = arr.length / numZones;

  for (const s of arr) {
    updateSpritePhysics(s, dt, now, W, H, GROUND_Y, GRAVITY, AIR_RESISTANCE,
                        GROUND_FRICTION, BOUNCE_DAMPING, MIN_VELOCITY,
                        zoneCounts, zoneWidth, avgDensity, numZones);
  }

  handleCollisions(arr, spatialHash, now);
  applyAvoidance(arr, spatialHash, W, H, GROUND_Y, zoneCounts, zoneWidth, avgDensity, numZones);

  return now;
}

function updateSpritePhysics(sprite, dt, now, W, H, GROUND_Y, GRAVITY, AIR_RESISTANCE,
                             GROUND_FRICTION, BOUNCE_DAMPING, MIN_VELOCITY,
                             zoneCounts, zoneWidth, avgDensity, NUM_ZONES) {
  const C = activeConfig;
  const textPadding = positive(C.textWidthPadding, TEXT_WIDTH_PADDING);
  const tiltReturnTime = Math.max(0, Number(C.tiltReturnTime) || 0);
  const directionThreshold = Math.max(0, Number(C.directionChangeThreshold) || 0);

  sprite.vy += GRAVITY;

  if (sprite.flipUntil) {
    if (now < sprite.flipUntil) {
      const timeRemaining = sprite.flipUntil - now;
      const angleDiff = Math.abs(Math.PI - Math.abs(sprite.angle));
      if (angleDiff < 0.1 || timeRemaining < 200) {
        sprite.angle = Math.PI;
        sprite.angularVelocity = 0;
      }
    } else {
      sprite.flipUntil = null;
      sprite.isExhausted = false;
      sprite.lastTiltTime = now - tiltReturnTime;
    }
  }

  if (sprite.state === 'dance') {
    sprite.angularVelocity = (Math.random() - 0.5) * bounded(C.danceAngularVelocity, 0, 1, DANCE_ANGULAR_VELOCITY);
  } else {
    sprite.angularVelocity *= bounded(C.angularVelocityDecay, 0, 1, ANGULAR_VELOCITY_DECAY);
  }
  sprite.angle += sprite.angularVelocity;

  if (sprite.isExhausted && sprite.flipUntil && now < sprite.flipUntil) {
    sprite.vx = 0;
    if (sprite.y >= GROUND_Y - (sprite.collisionRadius || sprite.size / 2) - 1) {
      sprite.vy = 0;
      sprite.y = GROUND_Y - (sprite.collisionRadius || sprite.size / 2);
    }
    const leftRightRadius = sprite.boundaryRadius || Math.max(sprite.size / 2, (sprite.textWidth || 0) / 2 + textPadding);
    if (sprite.x < leftRightRadius) sprite.x = leftRightRadius;
    if (sprite.x > W - leftRightRadius) sprite.x = W - leftRightRadius;
    if (sprite.y < (sprite.collisionRadius || sprite.size / 2)) {
      sprite.y = (sprite.collisionRadius || sprite.size / 2);
      if (sprite.vy < 0) sprite.vy = 0;
    }
    return;
  }

  // Air resistance
  const speedSq = sprite.vx * sprite.vx + sprite.vy * sprite.vy;
  const dragFactor = 1 - (speedSq * 0.0001);
  if (dragFactor > 0.9) {
    sprite.vx *= Math.min(1, dragFactor * AIR_RESISTANCE);
    sprite.vy *= Math.min(1, dragFactor * AIR_RESISTANCE);
  } else {
    sprite.vx *= AIR_RESISTANCE;
    sprite.vy *= AIR_RESISTANCE;
  }

  const leftRightRadius = sprite.boundaryRadius || Math.max(sprite.size / 2, (sprite.textWidth || 0) / 2 + textPadding);
  const topBottomRadius = sprite.collisionRadius || sprite.size / 2;

  if (sprite.vx > directionThreshold) {
    sprite.facingRight = true;
  } else if (sprite.vx < -directionThreshold) {
    sprite.facingRight = false;
  }

  sprite.x += sprite.vx;
  sprite.y += sprite.vy;

  const floor = GROUND_Y - topBottomRadius;
  if (sprite.y > floor) {
    sprite.y = floor;
    if (sprite.vy > 0) {
      sprite.vy = -sprite.vy * BOUNCE_DAMPING;
      sprite.vx *= GROUND_FRICTION;
    }
  }

  if (sprite.x < leftRightRadius) {
    sprite.x = leftRightRadius;
    sprite.vx = -sprite.vx * BOUNCE_DAMPING;
  }
  if (sprite.x > W - leftRightRadius) {
    sprite.x = W - leftRightRadius;
    sprite.vx = -sprite.vx * BOUNCE_DAMPING;
  }

  if (Math.abs(sprite.vx) < MIN_VELOCITY) sprite.vx = 0;
  if (Math.abs(sprite.vy) < MIN_VELOCITY) sprite.vy = 0;

  updateRoamingBehavior(sprite, dt, W, H, GROUND_Y, leftRightRadius, topBottomRadius,
                        zoneCounts, zoneWidth, avgDensity, NUM_ZONES);

  if (sprite.state === 'dance') {
    const danceFrequency = positive(C.danceFrequency, DANCE_FREQUENCY);
    sprite.vy += Math.sin((now + sprite.wiggle) / danceFrequency) * bounded(C.danceGravityFactor, -2, 2, DANCE_GRAVITY_FACTOR);
  }

  if (!sprite.flipUntil && sprite.lastTiltTime && sprite.angle !== 0) {
    sprite.angularVelocity *= bounded(C.tiltAngularDecay, 0, 1, TILT_ANGULAR_DECAY);
    const topRadius = sprite.collisionRadius || sprite.size / 2;
    const onGround = sprite.y >= GROUND_Y - topRadius - 1;
    if (onGround) {
      const timeSinceTilt = now - sprite.lastTiltTime;
      if (timeSinceTilt > tiltReturnTime) {
        sprite.angle *= bounded(C.angleDecay, 0, 1, ANGLE_DECAY);
        if (Math.abs(sprite.angle) < bounded(C.tiltAngleThreshold, 0, 1, TILT_ANGLE_THRESHOLD)) {
          sprite.angle = 0;
          sprite.lastTiltTime = null;
        }
      }
    } else {
      sprite.lastTiltTime = now;
    }
  }
}

function updateRoamingBehavior(sprite, dt, W, H, GROUND_Y, leftRightRadius, topBottomRadius,
                               zoneCounts, zoneWidth, avgDensity, NUM_ZONES) {
  const C = activeConfig;
  if (sprite.state === 'idle' || sprite.state === 'dance') {
    const roamZoneYOffset = Math.max(0, Number(C.roamZoneYOffset) || 0);
    const roamDurationBase = Math.max(0, Number(C.roamDurationBase) || 0);
    const roamDurationVar = Math.max(0, Number(C.roamDurationVar) || 0);
    const roamDistanceThreshold = Math.max(0, Number(C.roamDistanceThreshold) || 0);
    const roamWalkForce = Math.max(0, Number(C.roamWalkForceMultiplier) || 0);
    const roamWalkVertical = Math.max(0, Number(C.roamWalkVerticalFactor) || 0);
    const roamSteerForce = Math.max(0, Number(C.roamSteerForceMultiplier) || 0);
    const roamSteerVertical = Math.max(0, Number(C.roamSteerVerticalFactor) || 0);
    const roamArrivalThreshold = Math.max(0, Number(C.roamArrivalThreshold) || 0);
    const roamRandomChance = bounded(C.roamRandomMoveChance, 0, 1, 0);
    const roamRandomForce = Math.max(0, Number(C.roamRandomMoveForce) || 0);
    const roamRandomVertical = Math.max(0, Number(C.roamRandomMoveVertical) || 0);
    const zoneSelectionBias = bounded(C.zoneSelectionBias, 0, 1, 0.7);

    if (sprite.roamTargetX === null || sprite.roamTargetY === null || sprite.roamTimer <= 0) {
      let targetZone = 0;

      let minDensity = Infinity;
      const underpopulatedZones = [];
      for (let z = 0; z < NUM_ZONES; z++) {
        if (zoneCounts[z] < avgDensity) {
          underpopulatedZones.push(z);
          if (zoneCounts[z] < minDensity) {
            minDensity = zoneCounts[z];
            targetZone = z;
          }
        }
      }

      if (underpopulatedZones.length === 0) {
        targetZone = Math.floor(Math.random() * NUM_ZONES);
      } else if (Math.random() >= zoneSelectionBias) {
        targetZone = underpopulatedZones[Math.floor(Math.random() * underpopulatedZones.length)];
      }

      const zoneLeft = targetZone * zoneWidth;
      const targetSpread = Math.max(0, zoneWidth - leftRightRadius * 2);
      sprite.roamTargetX = zoneLeft + leftRightRadius + Math.random() * targetSpread;
      sprite.roamTargetY = GROUND_Y - topBottomRadius - Math.random() * roamZoneYOffset;
      sprite.roamDuration = roamDurationBase + Math.random() * roamDurationVar;
      sprite.roamTimer = sprite.roamDuration;

      const speed = sprite.roamSpeed;
      const dx = sprite.roamTargetX - sprite.x;
      const dy = sprite.roamTargetY - sprite.y;
      const dist = Math.hypot(dx, dy);
      if (dist > roamDistanceThreshold) {
        const nx = dx / dist;
        const ny = dy / dist;
        const walkForce = speed * roamWalkForce;
        sprite.vx += nx * walkForce;
        sprite.vy += ny * walkForce * roamWalkVertical;
      }
    }

    sprite.roamTimer -= dt * 1000;

    if (sprite.roamTimer > 0 && sprite.roamTargetX !== null) {
      const dx = sprite.roamTargetX - sprite.x;
      const dy = sprite.roamTargetY - sprite.y;
      const dist = Math.hypot(dx, dy);
      if (dist > roamArrivalThreshold) {
        const nx = dx / dist;
        const ny = dy / dist;
        const steerForce = sprite.roamSpeed * roamSteerForce;
        sprite.vx += nx * steerForce;
        sprite.vy += ny * steerForce * roamSteerVertical;
      } else {
        sprite.roamTimer = 0;
        sprite.roamTargetX = null;
        sprite.roamTargetY = null;
      }
    }

    if (Math.random() < roamRandomChance) {
      sprite.vx += (Math.random() - 0.5) * roamRandomForce;
      sprite.vy += (Math.random() - 0.5) * roamRandomVertical;
    }
  }
}

function handleCollisions(arr, grid, now) {
  const C = activeConfig;
  const collisionProbability = getCollisionProbability(arr.length);
  if (collisionProbability <= 0) return;

  const collisionThreshold = Math.max(0, Number(C.collisionPersonalSpaceThreshold) || 0);
  const thresholdSq = collisionThreshold * collisionThreshold;
  const forceMultiplier = Math.max(0, Number(C.collisionForceMultiplier) || 0);
  const angularFromCollision = Math.max(0, Number(C.angularVelocityFromCollision) || 0);
  const nudgeDistance = Math.max(0, Number(C.safetyNudgeDistance) || 0);

  for (const a of arr) {
    const near = grid.query(a, a);
    for (const b of near) {
      if (a.id >= b.id) continue;
      if (a.isFighting || b.isFighting) continue;
      if (Math.random() > collisionProbability) continue;

      const dx = b.x - a.x, dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      const personalSpace = a.collisionRadius + b.collisionRadius;
      const personalSpaceSq = personalSpace * personalSpace;
      if (distSq >= personalSpaceSq) continue;

      let dist;
      let nx;
      let ny;
      if (distSq <= thresholdSq) {
        // Perfectly overlapping sprites have no direction to separate along.
        // Nudge them apart and use that direction for the collision response.
        const angle = Math.random() * Math.PI * 2;
        nx = Math.cos(angle);
        ny = Math.sin(angle);
        dist = 0;
        if (nudgeDistance > 0) {
          a.x -= nx * nudgeDistance;
          a.y -= ny * nudgeDistance;
          b.x += nx * nudgeDistance;
          b.y += ny * nudgeDistance;
        }
      } else {
        dist = Math.sqrt(distSq);
        nx = dx / dist;
        ny = dy / dist;
      }

      const force = (personalSpace - dist) * forceMultiplier;

      const invMassA = 1 / (a.mass || 1);
      const invMassB = 1 / (b.mass || 1);

      const fx = force * nx;
      const fy = force * ny;

      a.vx -= fx * invMassA;
      a.vy -= fy * invMassA;
      b.vx += fx * invMassB;
      b.vy += fy * invMassB;

      const tangentX = -ny, tangentY = nx;
      const tangentVel = (b.vx - a.vx) * tangentX + (b.vy - a.vy) * tangentY;
      // Don't add collision angular velocity during flips — it stacks and causes crazy spinning
      if (!a.flipUntil) a.angularVelocity += tangentVel * angularFromCollision;
      if (!b.flipUntil) b.angularVelocity -= tangentVel * angularFromCollision;

      if (!a.lastTiltTime) a.lastTiltTime = now;
      if (!b.lastTiltTime) b.lastTiltTime = now;
    }
  }
}

function applyAvoidance(arr, grid, W, H, GROUND_Y, zoneCounts, zoneWidth, avgDensity, NUM_ZONES) {
  const C = activeConfig;
  const avoidanceMultiplier = positive(C.avoidanceRadiusMultiplier, AVOIDANCE_RADIUS_MULTIPLIER);
  const sizeSimilarityThreshold = bounded(C.sizeSimilarityThreshold, 0, 1, SIZE_SIMILARITY_THRESHOLD);
  const expandedMultiplier = positive(C.expandedRadiusMultiplier, EXPANDED_RADIUS_MULTIPLIER);
  const sizeDiffThresholdLow = bounded(C.sizeDiffThresholdLow, 0, 1, SIZE_DIFF_THRESHOLD_LOW);
  const attractionRadiusMultiplier = positive(C.sizeDiffAttractionMultiplier, 1.5);
  const minAttractionDistance = Math.max(0, Number(C.minAttractionDistance) || 0);
  const sizeDiffFactorBase = Math.max(0, Number(C.sizeDiffFactor) || 0);
  const attractionForceBase = Math.max(0, Number(C.attractionForceBase) || 0);
  const largerRepulsionFactor = Math.max(0, Number(C.largerRepulsionFactor) || 0);
  const moderateRepulsionRadiusMultiplier = positive(C.moderateRepulsionRadius, 1);
  const moderateRepulsionForce = Math.max(0, Number(C.moderateRepulsionForce) || 0);

  const centerX = W / 2;
  const centerY = GROUND_Y * bounded(C.groundYCenterOffset, 0, 2, GROUND_Y_CENTER_OFFSET);
  const centerPushRadius = positive(C.centerPushRadius, CENTER_PUSH_RADIUS);
  const centerPushForce = Math.max(0, Number(C.centerPushForce) || 0);
  const centerPushRadiusSq = centerPushRadius * centerPushRadius;

  for (const a of arr) {
    if (a.isFighting) continue;

    const near = grid.query(a, a);
    for (const b of near) {
      if (b.isFighting) continue;

      // Process each pair once instead of once from each side. Forces below are
      // doubled so the net result matches the previous double-application.
      if (a.id >= b.id) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;

      if (distSq <= 0) continue;
      const dist = Math.sqrt(distSq);

      const nx = dx / dist;
      const ny = dy / dist;

      const sizeA = a.size || 50;
      const sizeB = b.size || 50;
      const largerSize = Math.max(sizeA, sizeB);
      const smallerSize = Math.min(sizeA, sizeB);
      const sizeRatio = largerSize > 0 ? smallerSize / largerSize : 1;

      const baseAvoidanceRadius = (a.collisionRadius + b.collisionRadius) * avoidanceMultiplier;
      const baseAvoidanceRadiusSq = baseAvoidanceRadius * baseAvoidanceRadius;

      if (sizeRatio > sizeSimilarityThreshold) {
        const expandedRadius = baseAvoidanceRadius * (1.0 + (sizeRatio - sizeSimilarityThreshold) * expandedMultiplier);
        const expandedRadiusSq = expandedRadius * expandedRadius;
        if (distSq < expandedRadiusSq) {
          const normalizedDist = dist / expandedRadius;
          const force = Math.pow(1 - normalizedDist, 3) * 0.5;
          a.vx -= nx * force;
          a.vy -= ny * force;
          b.vx += nx * force;
          b.vy += ny * force;
        }
      } else if (sizeRatio < sizeDiffThresholdLow) {
        const attractionRadius = baseAvoidanceRadius * attractionRadiusMultiplier;
        const attractionRadiusSq = attractionRadius * attractionRadius;
        const minAttrDistSq = minAttractionDistance * minAttractionDistance;
        if (distSq < attractionRadiusSq && distSq > minAttrDistSq) {
          const sizeDiffFactor = (1 - sizeRatio) * sizeDiffFactorBase;
          const proximityFactor = 1 - (dist / attractionRadius);
          const attractionForce = sizeDiffFactor * proximityFactor * attractionForceBase * 2;
          if (sizeA < sizeB) {
            a.vx += nx * attractionForce;
            a.vy += ny * attractionForce;
            b.vx -= nx * attractionForce * largerRepulsionFactor;
            b.vy -= ny * attractionForce * largerRepulsionFactor;
          } else {
            b.vx += nx * attractionForce;
            b.vy += ny * attractionForce;
            a.vx -= nx * attractionForce * largerRepulsionFactor;
            a.vy -= ny * attractionForce * largerRepulsionFactor;
          }
        }
      } else {
        const moderateRadius = baseAvoidanceRadius * moderateRepulsionRadiusMultiplier;
        const moderateRadiusSq = moderateRadius * moderateRadius;
        if (distSq < moderateRadiusSq) {
          const normalizedDist = dist / moderateRadius;
          const force = Math.pow(1 - normalizedDist, 2) * moderateRepulsionForce * 2;
          a.vx -= nx * force;
          a.vy -= ny * force;
          b.vx += nx * force;
          b.vy += ny * force;
        }
      }
    }

    const dcx = a.x - centerX;
    const dcy = a.y - centerY;
    const distFromCenterSq = dcx * dcx + dcy * dcy;
    if (centerPushRadius > 0 && distFromCenterSq < centerPushRadiusSq) {
      const distFromCenter = Math.sqrt(distFromCenterSq);
      if (distFromCenter > 0) {
        const nx = dcx / distFromCenter;
        const ny = dcy / distFromCenter;
        const centerForce = (centerPushRadius - distFromCenter) / centerPushRadius * centerPushForce;
        a.vx += nx * centerForce;
        a.vy += ny * centerForce;
      }
    }
  }
}

// ── Lifetime Management ──────────────────────────────────────────────────

function manageLifetime(spriteMap, spriteArray, SPRITE_LIFETIME_MS, FADE_WARNING_MS, now, onRemove) {
  for (const sprite of spriteArray) {
    const age = now - sprite.lastActivity;
    if (age > SPRITE_LIFETIME_MS) {
      sprite.opacity = 0;
      sprite.markedForRemoval = true;
    } else if (age > (SPRITE_LIFETIME_MS - FADE_WARNING_MS)) {
      const timeRemaining = SPRITE_LIFETIME_MS - age;
      const fadeProgress = 1 - (timeRemaining / FADE_WARNING_MS);
      sprite.opacity = Math.max(0, 1 - fadeProgress);
    } else {
      sprite.opacity = 1;
    }
  }

  const removed = [];
  for (const [id, sprite] of spriteMap) {
    if (sprite.markedForRemoval && sprite.opacity <= 0) {
      spriteMap.delete(id);
      removed.push(sprite);
    }
  }

  if (onRemove) {
    for (const sprite of removed) onRemove(sprite);
  }
  return removed;
}

// ── Explosion Physics ─────────────────────────────────────────────────────

function applyExplosionPhysics(spriteArray, epicenterX, epicenterY, explosionRadius,
                                forceMultiplier, upwardBias, spinStrengthFactor, randomJitterFactor,
                                collisionPersonalSpaceThreshold) {
  for (let i = 0; i < spriteArray.length; i++) {
    const sprite = spriteArray[i];
    const dx = sprite.x - epicenterX;
    const dy = sprite.y - epicenterY;
    const distSq = dx * dx + dy * dy;
    const thresholdSq = collisionPersonalSpaceThreshold * collisionPersonalSpaceThreshold;

    if (distSq < explosionRadius * explosionRadius && distSq > thresholdSq) {
      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const ny = dy / dist;
      const falloff = Math.pow(1 - dist / explosionRadius, 2);
      const force = forceMultiplier * Math.max(0, falloff);

      sprite.vx += nx * force;
      sprite.vy += ny * force * (1 - upwardBias) - force * upwardBias;

      const spinStrength = force * spinStrengthFactor;
      sprite.angularVelocity += (Math.random() - 0.5) * spinStrength;
      if (!sprite.lastTiltTime) sprite.lastTiltTime = Date.now();

      sprite.vx += (Math.random() - 0.5) * force * randomJitterFactor;
      sprite.vy += (Math.random() - 0.5) * force * randomJitterFactor;
    }
  }
}

// ── Serialize sprite for broadcast ────────────────────────────────────────

function serializeSpritePhysics(sprite) {
  return {
    id: sprite.id,
    username: sprite.username,
    x: Math.round(sprite.x * 100) / 100,
    y: Math.round(sprite.y * 100) / 100,
    size: Math.round(sprite.size * 100) / 100,
    angle: Math.round(sprite.angle * 1000) / 1000,
    facingRight: sprite.facingRight,
    skin: sprite.skin,
    state: sprite.state || 'idle',
    opacity: sprite.opacity,
    heightScale: sprite.heightScale,
    createdAt: sprite.createdAt,
    lastActivity: sprite.lastActivity,
    collisionRadius: sprite.collisionRadius,
    boundaryRadius: sprite.boundaryRadius
  };
}

module.exports = {
  SpatialHash,
  setPhysicsConfig,
  getPhysicsConfig,
  createServerSprite,
  updatePhysics,
  manageLifetime,
  applyExplosionPhysics,
  serializeSpritePhysics,
  estimateTextWidth,
  hashString,
  colorFromName,
  JUMP_VELOCITY,
  FLIP_ANGULAR_VELOCITY
};
