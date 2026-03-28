// Server-side physics engine — mirrors overlay physics for server-authoritative simulation
// All sprites' physics (position, velocity, size, angle) are computed here
// and broadcast to all clients for synchronized rendering

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

// ── Constants (mirror overlay config.js defaults) ─────────────────────────

const SPATIAL_HASH_CELL_SIZE = 64;
const NUM_ZONES = 5;
const AVOIDANCE_RADIUS_MULTIPLIER = 2.0;
const SIZE_SIMILARITY_THRESHOLD = 0.85;
const EXPANDED_RADIUS_MULTIPLIER = 4.0;
const ZONE_SELECTION_BIAS = 0.7;
const SIZE_DIFF_THRESHOLD_LOW = 0.7;
const MIN_ATTRACTION_DISTANCE = 20;
const SIZE_DIFF_FACTOR = 2.0;
const ATTRACTION_FORCE_BASE = 0.08;
const LARGER_REPULSION_FACTOR = 0.3;
const MODERATE_REPULSION_FORCE = 0.08;
const CENTER_PUSH_RADIUS = 150;
const CENTER_PUSH_FORCE = 0.02;
const GROUND_Y_CENTER_OFFSET = 0.8;
const DIRECTION_CHANGE_THRESHOLD = 0.3;
const ANGULAR_VELOCITY_DECAY = 0.98;
const ANGLE_DECAY = 0.95;
const TILT_ANGULAR_DECAY = 0.9;
const TILT_ANGLE_THRESHOLD = 0.01;
const TILT_RETURN_TIME = 1000;
const ROAM_ZONE_Y_OFFSET = 30;
const ROAM_DURATION_BASE = 3000;
const ROAM_DURATION_VAR = 4000;
const ROAM_DISTANCE_THRESHOLD = 5;
const ROAM_WALK_FORCE_MULTIPLIER = 0.2;
const ROAM_WALK_VERTICAL_FACTOR = 0.3;
const ROAM_STEER_FORCE_MULTIPLIER = 0.1;
const ROAM_STEER_VERTICAL_FACTOR = 0.2;
const ROAM_ARRIVAL_THRESHOLD = 10;
const ROAM_RANDOM_MOVE_CHANCE = 0.03;
const ROAM_RANDOM_MOVE_FORCE = 0.3;
const ROAM_RANDOM_MOVE_VERTICAL = 0.1;
const COLLISION_FORCE_MULTIPLIER = 0.02;
const COLLISION_PERSONAL_SPACE_THRESHOLD = 0.1;
const ANGULAR_VELOCITY_FROM_COLLISION = 0.0001;
const DANCE_GRAVITY_FACTOR = -0.2;
const DANCE_ANGULAR_VELOCITY = 0.1;
const DANCE_FREQUENCY = 200;
const TEXT_WIDTH_PADDING = 4;
const WIGGLE_RANGE = 1000;
const MASS_DIVISOR = 1000;
const MOMENT_OF_INERTIA_FACTOR = 0.5;
const HEIGHT_SCALE_SIT = 0.75;
const HEIGHT_SCALE_IDLE = 1.0;
const DT_CAP = 0.05;
const SPAWN_BOUNDS_PADDING = 60;
const SPAWN_SIZE_PADDING = 120;
const SPAWN_Y_OFFSET = 40;
const SPAWN_JITTER = 6;
const VELOCITY_BUMP = 3;
const COLLISION_PROBABILITY_LOW = 0.0;
const COLLISION_PROBABILITY_MEDIUM = 0.5;
const COLLISION_PROBABILITY_HIGH = 1.0;
const COLLISION_COUNT_THRESHOLD_LOW = 5;
const COLLISION_COUNT_THRESHOLD_HIGH = 15;
const FLIP_ANGULAR_VELOCITY = Math.PI / 2;
const JUMP_VELOCITY = -16;

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
  if (count < COLLISION_COUNT_THRESHOLD_LOW) return COLLISION_PROBABILITY_LOW;
  if (count < COLLISION_COUNT_THRESHOLD_HIGH) return COLLISION_PROBABILITY_MEDIUM;
  return COLLISION_PROBABILITY_HIGH;
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
  // Deterministic size based on username hash
  const sizeHash = hashString(username + '_size');
  const sizeRatio = (sizeHash % 10000) / 10000;
  const size = SPRITE_SIZE_MIN + sizeRatio * (SPRITE_SIZE_MAX - SPRITE_SIZE_MIN);

  const textWidth = estimateTextWidth(username);
  const collisionRadius = size / 2;
  const boundaryRadius = Math.max(size / 2, textWidth / 2 + TEXT_WIDTH_PADDING);
  const mass = Math.PI * Math.pow(size / 2, 2) / MASS_DIVISOR;
  const momentOfInertia = MOMENT_OF_INERTIA_FACTOR * mass * Math.pow(size / 2, 2);

  // Deterministic spawn position
  const posHash = hashString(username + '_pos');
  const posRatio = (posHash % 10000) / 10000;
  const jitterHash = hashString(username + '_jitter');
  const jitterRatio = ((jitterHash % 10000) / 10000 - 0.5);

  let x = posRatio * (W - SPAWN_SIZE_PADDING) + SPAWN_BOUNDS_PADDING;
  let y = GROUND_Y - ((hashString(username + '_y') % 10000) / 10000) * SPAWN_Y_OFFSET - size / 2;
  x += jitterRatio * SPAWN_JITTER;
  y += ((hashString(username + '_yj') % 10000) / 10000 - 0.5) * SPAWN_JITTER;

  // Deterministic initial velocity
  const vxHash = hashString(username + '_vx');
  const vx = ((vxHash % 10000) / 10000 - 0.5) * 2;

  // Deterministic wiggle
  const wiggleHash = hashString(username + '_wiggle');
  const wiggle = (wiggleHash % 10000) / 10000 * WIGGLE_RANGE;

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

  spatialHash.reinitialize(SPATIAL_HASH_CELL_SIZE, W, H);
  for (const s of arr) spatialHash.insert(s);

  const zoneWidth = W / NUM_ZONES;
  const zoneCounts = new Array(NUM_ZONES).fill(0);
  for (const s of arr) {
    const zone = Math.floor(s.x / zoneWidth);
    if (zone >= 0 && zone < NUM_ZONES) zoneCounts[zone]++;
  }
  const avgDensity = arr.length / NUM_ZONES;

  for (const s of arr) {
    updateSpritePhysics(s, dt, now, W, H, GROUND_Y, GRAVITY, AIR_RESISTANCE,
                        GROUND_FRICTION, BOUNCE_DAMPING, MIN_VELOCITY,
                        zoneCounts, zoneWidth, avgDensity, NUM_ZONES);
  }

  handleCollisions(arr, spatialHash, now);
  applyAvoidance(arr, spatialHash, W, H, GROUND_Y, zoneCounts, zoneWidth, avgDensity, NUM_ZONES);

  return now;
}

function updateSpritePhysics(sprite, dt, now, W, H, GROUND_Y, GRAVITY, AIR_RESISTANCE,
                             GROUND_FRICTION, BOUNCE_DAMPING, MIN_VELOCITY,
                             zoneCounts, zoneWidth, avgDensity, NUM_ZONES) {
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
      sprite.lastTiltTime = now - TILT_RETURN_TIME;
    }
  }

  if (sprite.state === 'dance') {
    sprite.angularVelocity = (Math.random() - 0.5) * DANCE_ANGULAR_VELOCITY;
  } else {
    sprite.angularVelocity *= ANGULAR_VELOCITY_DECAY;
  }
  sprite.angle += sprite.angularVelocity;

  if (sprite.isExhausted && sprite.flipUntil && now < sprite.flipUntil) {
    sprite.vx = 0;
    if (sprite.y >= GROUND_Y - (sprite.collisionRadius || sprite.size / 2) - 1) {
      sprite.vy = 0;
      sprite.y = GROUND_Y - (sprite.collisionRadius || sprite.size / 2);
    }
    const leftRightRadius = sprite.boundaryRadius || Math.max(sprite.size / 2, (sprite.textWidth || 0) / 2 + TEXT_WIDTH_PADDING);
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

  const leftRightRadius = sprite.boundaryRadius || Math.max(sprite.size / 2, (sprite.textWidth || 0) / 2 + TEXT_WIDTH_PADDING);
  const topBottomRadius = sprite.collisionRadius || sprite.size / 2;

  if (sprite.vx > DIRECTION_CHANGE_THRESHOLD) {
    sprite.facingRight = true;
  } else if (sprite.vx < -DIRECTION_CHANGE_THRESHOLD) {
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
    sprite.vy += Math.sin((now + sprite.wiggle) / DANCE_FREQUENCY) * DANCE_GRAVITY_FACTOR;
  }

  if (!sprite.flipUntil && sprite.lastTiltTime && sprite.angle !== 0) {
    sprite.angularVelocity *= TILT_ANGULAR_DECAY;
    const topRadius = sprite.collisionRadius || sprite.size / 2;
    const onGround = sprite.y >= GROUND_Y - topRadius - 1;
    if (onGround) {
      const timeSinceTilt = now - sprite.lastTiltTime;
      if (timeSinceTilt > TILT_RETURN_TIME) {
        sprite.angle *= ANGLE_DECAY;
        if (Math.abs(sprite.angle) < TILT_ANGLE_THRESHOLD) {
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
  if (sprite.state === 'idle' || sprite.state === 'dance') {
    if (sprite.roamTargetX === null || sprite.roamTargetY === null || sprite.roamTimer <= 0) {
      let targetZone;
      const currentZone = Math.floor(sprite.x / zoneWidth);

      let minDensity = Infinity;
      let underpopulatedZones = [];
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
      } else {
        if (Math.random() >= ZONE_SELECTION_BIAS) {
          targetZone = underpopulatedZones[Math.floor(Math.random() * underpopulatedZones.length)];
        }
      }

      const zoneLeft = targetZone * zoneWidth;
      const zoneRight = zoneLeft + zoneWidth;
      sprite.roamTargetX = zoneLeft + leftRightRadius + Math.random() * (zoneWidth - leftRightRadius * 2);
      sprite.roamTargetY = GROUND_Y - topBottomRadius - Math.random() * ROAM_ZONE_Y_OFFSET;
      sprite.roamDuration = ROAM_DURATION_BASE + Math.random() * ROAM_DURATION_VAR;
      sprite.roamTimer = sprite.roamDuration;

      const speed = sprite.roamSpeed;
      const dx = sprite.roamTargetX - sprite.x;
      const dy = sprite.roamTargetY - sprite.y;
      const dist = Math.hypot(dx, dy);
      if (dist > ROAM_DISTANCE_THRESHOLD) {
        const nx = dx / dist;
        const ny = dy / dist;
        const walkForce = speed * ROAM_WALK_FORCE_MULTIPLIER;
        sprite.vx += nx * walkForce;
        sprite.vy += ny * walkForce * ROAM_WALK_VERTICAL_FACTOR;
      }
    }

    sprite.roamTimer -= dt * 1000;

    if (sprite.roamTimer > 0 && sprite.roamTargetX !== null) {
      const dx = sprite.roamTargetX - sprite.x;
      const dy = sprite.roamTargetY - sprite.y;
      const dist = Math.hypot(dx, dy);
      if (dist > ROAM_ARRIVAL_THRESHOLD) {
        const nx = dx / dist;
        const ny = dy / dist;
        const steerForce = sprite.roamSpeed * ROAM_STEER_FORCE_MULTIPLIER;
        sprite.vx += nx * steerForce;
        sprite.vy += ny * steerForce * ROAM_STEER_VERTICAL_FACTOR;
      } else if (dist <= ROAM_ARRIVAL_THRESHOLD) {
        sprite.roamTimer = 0;
        sprite.roamTargetX = null;
        sprite.roamTargetY = null;
      }
    }

    if (Math.random() < ROAM_RANDOM_MOVE_CHANCE) {
      sprite.vx += (Math.random() - 0.5) * ROAM_RANDOM_MOVE_FORCE;
      sprite.vy += (Math.random() - 0.5) * ROAM_RANDOM_MOVE_VERTICAL;
    }
  }
}

function handleCollisions(arr, grid, now) {
  const collisionProbability = getCollisionProbability(arr.length);
  const thresholdSq = COLLISION_PERSONAL_SPACE_THRESHOLD * COLLISION_PERSONAL_SPACE_THRESHOLD;
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

      if (distSq < personalSpaceSq && distSq > thresholdSq) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist, ny = dy / dist;
        const force = (personalSpace - dist) * COLLISION_FORCE_MULTIPLIER;

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
        a.angularVelocity += tangentVel * ANGULAR_VELOCITY_FROM_COLLISION;
        b.angularVelocity -= tangentVel * ANGULAR_VELOCITY_FROM_COLLISION;

        if (!a.lastTiltTime) a.lastTiltTime = now;
        if (!b.lastTiltTime) b.lastTiltTime = now;
      }
    }
  }
}

function applyAvoidance(arr, grid, W, H, GROUND_Y, zoneCounts, zoneWidth, avgDensity, NUM_ZONES) {
  const centerX = W / 2;
  const centerY = GROUND_Y * GROUND_Y_CENTER_OFFSET;
  const centerPushRadiusSq = CENTER_PUSH_RADIUS * CENTER_PUSH_RADIUS;

  for (const a of arr) {
    if (a.isFighting) continue;

    const near = grid.query(a, a);
    for (const b of near) {
      if (b.isFighting) continue;

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
      const sizeRatio = smallerSize / largerSize;

      const baseAvoidanceRadius = (a.collisionRadius + b.collisionRadius) * AVOIDANCE_RADIUS_MULTIPLIER;
      const baseAvoidanceRadiusSq = baseAvoidanceRadius * baseAvoidanceRadius;

      if (sizeRatio > SIZE_SIMILARITY_THRESHOLD) {
        const expandedRadius = baseAvoidanceRadius * (1.0 + (sizeRatio - SIZE_SIMILARITY_THRESHOLD) * EXPANDED_RADIUS_MULTIPLIER);
        const expandedRadiusSq = expandedRadius * expandedRadius;
        if (distSq < expandedRadiusSq) {
          const normalizedDist = dist / expandedRadius;
          const force = Math.pow(1 - normalizedDist, 3) * 0.25;
          a.vx -= nx * force;
          a.vy -= ny * force;
          b.vx += nx * force;
          b.vy += ny * force;
        }
      } else if (sizeRatio < SIZE_DIFF_THRESHOLD_LOW) {
        const attractionRadius = baseAvoidanceRadius * 1.5;
        const attractionRadiusSq = attractionRadius * attractionRadius;
        const minAttrDistSq = MIN_ATTRACTION_DISTANCE * MIN_ATTRACTION_DISTANCE;
        if (distSq < attractionRadiusSq && distSq > minAttrDistSq) {
          const sizeDiffFactor = (1 - sizeRatio) * SIZE_DIFF_FACTOR;
          const proximityFactor = 1 - (dist / attractionRadius);
          const attractionForce = sizeDiffFactor * proximityFactor * ATTRACTION_FORCE_BASE;
          if (sizeA < sizeB) {
            a.vx += nx * attractionForce;
            a.vy += ny * attractionForce;
            b.vx -= nx * attractionForce * LARGER_REPULSION_FACTOR;
            b.vy -= ny * attractionForce * LARGER_REPULSION_FACTOR;
          } else {
            b.vx += nx * attractionForce;
            b.vy += ny * attractionForce;
            a.vx -= nx * attractionForce * LARGER_REPULSION_FACTOR;
            a.vy -= ny * attractionForce * LARGER_REPULSION_FACTOR;
          }
        }
      } else {
        if (distSq < baseAvoidanceRadiusSq) {
          const normalizedDist = dist / baseAvoidanceRadius;
          const force = Math.pow(1 - normalizedDist, 2) * MODERATE_REPULSION_FORCE;
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
    if (distFromCenterSq < centerPushRadiusSq) {
      const distFromCenter = Math.sqrt(distFromCenterSq);
      const nx = dcx / distFromCenter;
      const ny = dcy / distFromCenter;
      const centerForce = (CENTER_PUSH_RADIUS - distFromCenter) / CENTER_PUSH_RADIUS * CENTER_PUSH_FORCE;
      a.vx += nx * centerForce;
      a.vy += ny * centerForce;
    }
  }
}

// ── Lifetime Management ──────────────────────────────────────────────────

function manageLifetime(spriteMap, spriteArray, SPRITE_LIFETIME_MS, FADE_WARNING_MS, now) {
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

  for (const [id, sprite] of spriteMap) {
    if (sprite.markedForRemoval && sprite.opacity <= 0) {
      spriteMap.delete(id);
    }
  }
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
    vx: Math.round(sprite.vx * 1000) / 1000,
    vy: Math.round(sprite.vy * 1000) / 1000,
    size: Math.round(sprite.size * 100) / 100,
    angle: Math.round(sprite.angle * 1000) / 1000,
    angularVelocity: Math.round(sprite.angularVelocity * 10000) / 10000,
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
