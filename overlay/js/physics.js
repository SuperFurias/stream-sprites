// Physics engine module
import { SpatialHash } from './core.js';
import { getCollisionProbability } from './utils.js';
import {
  SPATIAL_HASH_CELL_SIZE,
  NUM_ZONES,
  AVOIDANCE_RADIUS_MULTIPLIER,
  GROUND_Y_CENTER_OFFSET,
  SIZE_SIMILARITY_THRESHOLD,
  EXPANDED_RADIUS_MULTIPLIER,
  SIZE_DIFF_THRESHOLD_LOW,
  SIZE_DIFF_FACTOR,
  ATTRACTION_FORCE_BASE,
  LARGER_REPULSION_FACTOR,
  MODERATE_REPULSION_RADIUS,
  MODERATE_REPULSION_FORCE,
  CENTER_PUSH_RADIUS,
  CENTER_PUSH_FORCE,
  DIRECTION_CHANGE_THRESHOLD,
  ANGULAR_VELOCITY_DECAY,
  ANGLE_DECAY,
  TILT_ANGULAR_DECAY,
  TILT_ANGLE_THRESHOLD,
  TILT_RETURN_TIME,
  ROAM_ZONE_Y_OFFSET,
  ROAM_DURATION_BASE,
  ROAM_DURATION_VAR,
  ROAM_WALK_FORCE_MULTIPLIER,
  ROAM_WALK_VERTICAL_FACTOR,
  ROAM_STEER_FORCE_MULTIPLIER,
  ROAM_STEER_VERTICAL_FACTOR,
  ROAM_ARRIVAL_THRESHOLD,
  ROAM_DISTANCE_THRESHOLD,
  ROAM_RANDOM_MOVE_CHANCE,
  ROAM_RANDOM_MOVE_FORCE,
  ROAM_RANDOM_MOVE_VERTICAL,
  COLLISION_FORCE_MULTIPLIER,
  COLLISION_PERSONAL_SPACE_THRESHOLD,
  ANGULAR_VELOCITY_FROM_COLLISION,
  DRAGGED_GRAVITY,
  DANCE_GRAVITY_FACTOR,
  DANCE_ANGULAR_VELOCITY,
  DANCE_FREQUENCY,
  ZONE_SELECTION_BIAS,
  MIN_ATTRACTION_DISTANCE,
  TEXT_WIDTH_PADDING
} from './config.js';

// Pre-allocated SpatialHash instance (reused across frames to avoid GC pressure)
const spatialHash = new SpatialHash(SPATIAL_HASH_CELL_SIZE, 1920, 1080);

// Pre-allocated sprite array (maintained alongside Map to avoid Array.from per frame)
let spriteArray = [];
let spriteArrayDirty = true;

export function markSpriteArrayDirty() {
  spriteArrayDirty = true;
}

export function updatePhysics(dt, sprites, W, H, GROUND_Y, draggedSprite,
                              GRAVITY, AIR_RESISTANCE, GROUND_FRICTION,
                              BOUNCE_DAMPING, MIN_VELOCITY) {
  // Rebuild sprite array only when sprites have been added/removed
  if (spriteArrayDirty || spriteArray.length !== sprites.size) {
    spriteArray.length = 0;
    for (const s of sprites.values()) {
      spriteArray.push(s);
    }
    spriteArrayDirty = false;
  }
  const arr = spriteArray;
  const now = Date.now();

  // Reuse spatial hash instance (clear + reinitialize instead of new)
  spatialHash.reinitialize(SPATIAL_HASH_CELL_SIZE, W, H);
  for (const s of arr) spatialHash.insert(s);

  // Calculate zone densities for distribution
  const zoneWidth = W / NUM_ZONES;
  const zoneCounts = new Array(NUM_ZONES).fill(0);
  for (const s of arr) {
    const zone = Math.floor(s.x / zoneWidth);
    if (zone >= 0 && zone < NUM_ZONES) {
      zoneCounts[zone]++;
    }
  }
  const avgDensity = arr.length / NUM_ZONES;

  // Update physics for each sprite
  for (const s of arr) {
    if (s === draggedSprite) {
      updateDraggedSpritePhysics(s, W, H, GROUND_Y);
    } else {
      updateSpritePhysics(s, dt, now, W, H, GROUND_Y, GRAVITY, AIR_RESISTANCE,
                          GROUND_FRICTION, BOUNCE_DAMPING, MIN_VELOCITY,
                          zoneCounts, zoneWidth, avgDensity, NUM_ZONES);
    }
  }

  // Handle collisions (probabilistic)
  handleCollisions(arr, spatialHash, now);

  // Apply avoidance forces to prevent clustering
  applyAvoidance(arr, spatialHash, W, H, GROUND_Y, zoneCounts, zoneWidth, avgDensity, NUM_ZONES);

  return { arr, now };
}

function applyAvoidance(arr, grid, W, H, GROUND_Y, zoneCounts, zoneWidth, avgDensity, NUM_ZONES) {
  // Center of the screen
  const centerX = W / 2;
  const centerY = GROUND_Y * GROUND_Y_CENTER_OFFSET;

  // Pre-compute squared center push radius
  const centerPushRadiusSq = CENTER_PUSH_RADIUS * CENTER_PUSH_RADIUS;

  for (const a of arr) {
    if (a.isFighting) continue;

    const near = grid.query(a, a);
    for (const b of near) {
      if (b.isFighting) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      // Use squared distance for initial checks, only sqrt when needed
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

    // Push away from center using squared distance
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

function updateDraggedSpritePhysics(sprite, W, H, GROUND_Y) {
  // Position is set directly by mouse — only clamp to boundaries
  // Do NOT apply gravity or modify vx/vy here; velocity is tracked by input handler
  sprite.vx = 0;
  sprite.vy = 0;

  const leftRightRadius = sprite.boundaryRadius || Math.max(sprite.size / 2, (sprite.textWidth || 0) / 2 + TEXT_WIDTH_PADDING);
  const topBottomRadius = sprite.collisionRadius || sprite.size / 2;

  if (sprite.x < leftRightRadius) sprite.x = leftRightRadius;
  if (sprite.x > W - leftRightRadius) sprite.x = W - leftRightRadius;
  if (sprite.y < topBottomRadius) sprite.y = topBottomRadius;
  const floor = GROUND_Y - topBottomRadius;
  if (sprite.y > floor) sprite.y = floor;
}

function updateSpritePhysics(sprite, dt, now, W, H, GROUND_Y, GRAVITY, AIR_RESISTANCE,
                             GROUND_FRICTION, BOUNCE_DAMPING, MIN_VELOCITY,
                             zoneCounts, zoneWidth, avgDensity, NUM_ZONES) {
  sprite.vy += GRAVITY;

  // Handle flip effect - always runs so angle updates even for exhausted sprites
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

  // Apply angular velocity so flip spin works even for exhausted sprites
  if (sprite.state === 'dance') {
    sprite.angularVelocity = (Math.random() - 0.5) * DANCE_ANGULAR_VELOCITY;
  } else {
    sprite.angularVelocity *= ANGULAR_VELOCITY_DECAY;
  }
  sprite.angle += sprite.angularVelocity;

  // Exhausted sprite (lost a fight) - freeze movement, skip all other physics
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

  // Update facing direction with threshold to prevent trembling
  if (sprite.vx > DIRECTION_CHANGE_THRESHOLD) {
    sprite.facingRight = true;
  } else if (sprite.vx < -DIRECTION_CHANGE_THRESHOLD) {
    sprite.facingRight = false;
  }

  sprite.x += sprite.vx;
  sprite.y += sprite.vy;

  // Ground collision
  const floor = GROUND_Y - topBottomRadius;
  if (sprite.y > floor) {
    sprite.y = floor;
    if (sprite.vy > 0) {
      sprite.vy = -sprite.vy * BOUNCE_DAMPING;
      sprite.vx *= GROUND_FRICTION;
    }
  }

  // Wall boundaries
  if (sprite.x < leftRightRadius) {
    sprite.x = leftRightRadius;
    sprite.vx = -sprite.vx * BOUNCE_DAMPING;
  }
  if (sprite.x > W - leftRightRadius) {
    sprite.x = W - leftRightRadius;
    sprite.vx = -sprite.vx * BOUNCE_DAMPING;
  }

  // Stop very small velocities
  if (Math.abs(sprite.vx) < MIN_VELOCITY) sprite.vx = 0;
  if (Math.abs(sprite.vy) < MIN_VELOCITY) sprite.vy = 0;

  // Roaming behavior
  updateRoamingBehavior(sprite, dt, W, H, GROUND_Y, leftRightRadius, topBottomRadius,
                        zoneCounts, zoneWidth, avgDensity, NUM_ZONES);

  // Dance animation (vy only; angular velocity already handled above)
  if (sprite.state === 'dance') {
    sprite.vy += Math.sin((now + sprite.wiggle) / DANCE_FREQUENCY) * DANCE_GRAVITY_FACTOR;
  }

  // Auto-return upright (only if not currently flipped and on the ground)
  if (!sprite.flipUntil && sprite.lastTiltTime && sprite.angle !== 0) {
    // Always decay angular velocity so it doesn't accumulate forever
    sprite.angularVelocity *= TILT_ANGULAR_DECAY;

    // Check if sprite is resting on the ground
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
      // Reset the timer while airborne — return only starts after landing
      sprite.lastTiltTime = now;
    }
  }
}

function updateRoamingBehavior(sprite, dt, W, H, GROUND_Y, leftRightRadius, topBottomRadius,
                               zoneCounts, zoneWidth, avgDensity, NUM_ZONES) {
  if (sprite.state === 'idle' || sprite.state === 'dance') {
    if (sprite.roamTargetX === null || sprite.roamTargetY === null || sprite.roamTimer <= 0) {
      // Choose target based on zone density - prefer underpopulated zones
      let targetZone;
      const currentZone = Math.floor(sprite.x / zoneWidth);
      
      // Find the most underpopulated zone
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
      
      // If all zones are at or above average, pick random
      if (underpopulatedZones.length === 0) {
        targetZone = Math.floor(Math.random() * NUM_ZONES);
      } else {
        // 70% chance to pick the most underpopulated zone, 30% for any underpopulated zone
        if (Math.random() < ZONE_SELECTION_BIAS) {
          // Keep targetZone as the most underpopulated
        } else {
          targetZone = underpopulatedZones[Math.floor(Math.random() * underpopulatedZones.length)];
        }
      }
      
      // Set target position within the chosen zone
      const zoneLeft = targetZone * zoneWidth;
      const zoneRight = zoneLeft + zoneWidth;
      sprite.roamTargetX = zoneLeft + leftRightRadius + Math.random() * (zoneWidth - leftRightRadius * 2);
      sprite.roamTargetY = GROUND_Y - topBottomRadius - Math.random() * ROAM_ZONE_Y_OFFSET;
      sprite.roamDuration = ROAM_DURATION_BASE + Math.random() * ROAM_DURATION_VAR; // Longer duration for more purposeful movement
      sprite.roamTimer = sprite.roamDuration;
      
      const speed = sprite.roamSpeed;
      const dx = sprite.roamTargetX - sprite.x;
      const dy = sprite.roamTargetY - sprite.y;
      const dist = Math.hypot(dx, dy);
      if (dist > ROAM_DISTANCE_THRESHOLD) {
        const nx = dx / dist;
        const ny = dy / dist;
        const walkForce = speed * ROAM_WALK_FORCE_MULTIPLIER; // Slightly stronger initial push
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
        const steerForce = sprite.roamSpeed * ROAM_STEER_FORCE_MULTIPLIER; // Stronger steering toward target
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

export function manageLifetime(sprites, SPRITE_LIFETIME_MS, FADE_WARNING_MS, prebuiltArray, now) {
  // Use prebuilt array if provided to avoid Map-to-Array conversion overhead
  const arr = prebuiltArray || Array.from(sprites.values());
  now = now || Date.now();
  
  // Update opacity based on age
  for (const sprite of arr) {
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
  
  // Remove expired sprites from Map
  for (const [id, sprite] of sprites) {
    if (sprite.markedForRemoval && sprite.opacity <= 0) {
      sprites.delete(id);
    }
  }
}
