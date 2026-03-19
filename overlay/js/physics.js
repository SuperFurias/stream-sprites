// Physics engine module
import { SpatialHash } from './spatialHash.js';
import { getCollisionProbability } from './utils.js';

export function updatePhysics(dt, sprites, W, H, GROUND_Y, draggedSprite,
                              GRAVITY, AIR_RESISTANCE, GROUND_FRICTION,
                              BOUNCE_DAMPING, MIN_VELOCITY) {
  const arr = Array.from(sprites.values());
  const grid = new SpatialHash(64, W, H);
  grid.clear();
  for (const s of arr) grid.insert(s);

  // Calculate zone densities for distribution
  const NUM_ZONES = 5;
  const zoneWidth = W / NUM_ZONES;
  const zoneCounts = new Array(NUM_ZONES).fill(0);
  for (const s of arr) {
    const zone = Math.floor(s.x / zoneWidth);
    if (zone >= 0 && zone < NUM_ZONES) {
      zoneCounts[zone]++;
    }
  }
  const avgDensity = arr.length / NUM_ZONES;

  for (const s of arr) {
    if (s === draggedSprite) {
      updateDraggedSpritePhysics(s, W, H, GROUND_Y);
    } else {
      updateSpritePhysics(s, dt, W, H, GROUND_Y, GRAVITY, AIR_RESISTANCE,
                          GROUND_FRICTION, BOUNCE_DAMPING, MIN_VELOCITY,
                          zoneCounts, zoneWidth, avgDensity, NUM_ZONES);
    }
  }

  // Safety nudge: separate sprites that are exactly overlapping
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      if (a.x === b.x && a.y === b.y) {
        const angle = Math.random() * Math.PI * 2;
        const n = 0.5;
        a.x += Math.cos(angle) * n;
        a.y += Math.sin(angle) * n;
        b.x -= Math.cos(angle) * n;
        b.y -= Math.sin(angle) * n;
      }
    }
  }

  // Handle collisions (probabilistic)
  handleCollisions(arr, grid);
  
  // Always apply gentle avoidance to prevent clustering (pathfinding)
  applyAvoidance(arr, grid, W, H, GROUND_Y, zoneCounts, zoneWidth, avgDensity, NUM_ZONES);
  
  // Manage lifetime
  return { arr };
}

function applyAvoidance(arr, grid, W, H, GROUND_Y, zoneCounts, zoneWidth, avgDensity, NUM_ZONES) {
  // Base avoidance radius multiplier
  const AVOIDANCE_RADIUS_MULTIPLIER = 2.0;
  
  // Center of the screen
  const centerX = W / 2;
  const centerY = GROUND_Y * 0.8; // Slightly above ground
  
  for (const a of arr) {
    const near = grid.query(a);
    for (const b of near) {
      if (b === a) continue;
      
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      
      if (dist <= 0) continue;
      
      const nx = dx / dist;
      const ny = dy / dist;
      
      // Calculate size ratio (smaller / larger)
      const sizeA = a.size || 50;
      const sizeB = b.size || 50;
      const largerSize = Math.max(sizeA, sizeB);
      const smallerSize = Math.min(sizeA, sizeB);
      const sizeRatio = smallerSize / largerSize;
      const sizeDiff = largerSize - smallerSize;
      
      // Calculate base avoidance radius based on combined size
      const baseAvoidanceRadius = (a.collisionRadius + b.collisionRadius) * AVOIDANCE_RADIUS_MULTIPLIER;
      
      // Determine interaction type based on size similarity
      // sizeSimilarity: 1.0 = identical size, 0.0 = very different sizes
      const sizeSimilarity = sizeRatio;
      
      if (sizeSimilarity > 0.85) {
        // Similar sizes: Strong repulsion that increases exponentially as they get closer
        // Also increase the effective avoidance radius for similar-sized sprites
        const expandedRadius = baseAvoidanceRadius * (1.0 + (sizeSimilarity - 0.85) * 4); // Up to 3x radius for identical sizes
        if (dist < expandedRadius) {
          const normalizedDist = dist / expandedRadius;
          // Exponential force curve: much stronger when very close
          const force = Math.pow(1 - normalizedDist, 3) * 0.25;
          
          // Apply repulsion to both
          a.vx -= nx * force;
          a.vy -= ny * force;
          b.vx += nx * force;
          b.vy += ny * force;
        }
      } else if (sizeSimilarity < 0.7) {
        // Different sizes: Attraction of smaller towards larger
        // Only apply when within a reasonable distance
        const attractionRadius = baseAvoidanceRadius * 1.5;
        if (dist < attractionRadius && dist > 20) {
          // Attraction strength based on size difference and proximity
          // Stronger attraction when very small is near very large
          const sizeDiffFactor = (1 - sizeSimilarity) * 2; // Up to 2x for very different sizes
          const proximityFactor = 1 - (dist / attractionRadius); // Stronger when closer
          const attractionForce = sizeDiffFactor * proximityFactor * 0.08;
          
          // Determine which is smaller and apply attraction towards larger
          if (sizeA < sizeB) {
            a.vx += nx * attractionForce;
            a.vy += ny * attractionForce;
            // Larger sprite gets slight repulsion to prevent clustering
            b.vx -= nx * attractionForce * 0.3;
            b.vy -= ny * attractionForce * 0.3;
          } else {
            b.vx += nx * attractionForce;
            b.vy += ny * attractionForce;
            a.vx -= nx * attractionForce * 0.3;
            a.vy -= ny * attractionForce * 0.3;
          }
        }
      } else {
        // Moderate size difference: mild repulsion
        if (dist < baseAvoidanceRadius) {
          const normalizedDist = dist / baseAvoidanceRadius;
          const force = Math.pow(1 - normalizedDist, 2) * 0.08;
          
          a.vx -= nx * force;
          a.vy -= ny * force;
          b.vx += nx * force;
          b.vy += ny * force;
        }
      }
    }
    
    // Add gentle push away from center to distribute sprites to edges
    const distFromCenter = Math.hypot(a.x - centerX, a.y - centerY);
    if (distFromCenter < 150) {
      const nx = (a.x - centerX) / distFromCenter;
      const ny = (a.y - centerY) / distFromCenter;
      const centerForce = (150 - distFromCenter) / 150 * 0.02;
      a.vx += nx * centerForce;
      a.vy += ny * centerForce;
    }
  }
}

function updateDraggedSpritePhysics(sprite, W, H, GROUND_Y) {
  sprite.vy += 0.5; // Reduced gravity for dragged
  
  const leftRightRadius = sprite.boundaryRadius || Math.max(sprite.size / 2, (sprite.textWidth || 0) / 2 + 4);
  const topBottomRadius = sprite.collisionRadius || sprite.size / 2;
  
  if (sprite.x < leftRightRadius) {
    sprite.x = leftRightRadius;
    sprite.vx = 0;
  }
  if (sprite.x > W - leftRightRadius) {
    sprite.x = W - leftRightRadius;
    sprite.vx = 0;
  }
  const floor = GROUND_Y - topBottomRadius;
  if (sprite.y > floor) {
    sprite.y = floor;
    if (sprite.vy > 0) sprite.vy = 0;
  }
}

function updateSpritePhysics(sprite, dt, W, H, GROUND_Y, GRAVITY, AIR_RESISTANCE,
                             GROUND_FRICTION, BOUNCE_DAMPING, MIN_VELOCITY,
                             zoneCounts, zoneWidth, avgDensity, NUM_ZONES) {
  sprite.vy += GRAVITY;

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

  const leftRightRadius = sprite.boundaryRadius || Math.max(sprite.size / 2, (sprite.textWidth || 0) / 2 + 4);
  const topBottomRadius = sprite.collisionRadius || sprite.size / 2;

  // Update facing direction with threshold to prevent trembling
  const DIRECTION_CHANGE_THRESHOLD = 0.3;
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

  // Dance animation
  if (sprite.state === 'dance') {
    sprite.vy += Math.sin((Date.now() + sprite.wiggle) / 200) * -0.2;
    sprite.angularVelocity = (Math.random() - 0.5) * 0.1;
  } else {
    sprite.angularVelocity *= 0.98;
  }

  // Auto-return upright
  if (sprite.lastTiltTime && sprite.angle !== 0) {
    const timeSinceTilt = Date.now() - sprite.lastTiltTime;
    if (timeSinceTilt > 1000) {
      sprite.angle *= 0.95;
      sprite.angularVelocity *= 0.9;
      if (Math.abs(sprite.angle) < 0.01) {
        sprite.angle = 0;
        sprite.lastTiltTime = null;
      }
    }
  }

  sprite.angle += sprite.angularVelocity;
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
        if (Math.random() < 0.7) {
          // Keep targetZone as the most underpopulated
        } else {
          targetZone = underpopulatedZones[Math.floor(Math.random() * underpopulatedZones.length)];
        }
      }
      
      // Set target position within the chosen zone
      const zoneLeft = targetZone * zoneWidth;
      const zoneRight = zoneLeft + zoneWidth;
      sprite.roamTargetX = zoneLeft + leftRightRadius + Math.random() * (zoneWidth - leftRightRadius * 2);
      sprite.roamTargetY = GROUND_Y - topBottomRadius - Math.random() * 30;
      sprite.roamDuration = 3000 + Math.random() * 4000; // Longer duration for more purposeful movement
      sprite.roamTimer = sprite.roamDuration;
      
      const speed = sprite.roamSpeed;
      const dx = sprite.roamTargetX - sprite.x;
      const dy = sprite.roamTargetY - sprite.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 5) {
        const nx = dx / dist;
        const ny = dy / dist;
        const walkForce = speed * 0.2; // Slightly stronger initial push
        sprite.vx += nx * walkForce;
        sprite.vy += ny * walkForce * 0.3;
      }
    }
    
    sprite.roamTimer -= dt * 1000;
    
    if (sprite.roamTimer > 0 && sprite.roamTargetX !== null) {
      const dx = sprite.roamTargetX - sprite.x;
      const dy = sprite.roamTargetY - sprite.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 10) {
        const nx = dx / dist;
        const ny = dy / dist;
        const steerForce = sprite.roamSpeed * 0.1; // Stronger steering toward target
        sprite.vx += nx * steerForce;
        sprite.vy += ny * steerForce * 0.2;
      } else if (dist <= 10) {
        sprite.roamTimer = 0;
        sprite.roamTargetX = null;
        sprite.roamTargetY = null;
      }
    }
    
    if (Math.random() < 0.03) {
      sprite.vx += (Math.random() - 0.5) * 0.3;
      sprite.vy += (Math.random() - 0.5) * 0.1;
    }
  }
}

function handleCollisions(arr, grid) {
  const collisionProbability = getCollisionProbability(arr.length);
  for (const a of arr) {
    const near = grid.query(a);
    for (const b of near) {
      if (b === a) continue;
      if (a.id >= b.id) continue;
      
      if (Math.random() > collisionProbability) continue;
      
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const personalSpace = a.collisionRadius + b.collisionRadius;
      
      if (dist < personalSpace && dist > 0.1) {
        const nx = dx / dist, ny = dy / dist;
        const force = (personalSpace - dist) * 0.02;
        
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
        a.angularVelocity += tangentVel * 0.0001;
        b.angularVelocity -= tangentVel * 0.0001;
        
        const now = Date.now();
        a.lastTiltTime = now;
        b.lastTiltTime = now;
      }
    }
  }
}

export function manageLifetime(sprites, SPRITE_LIFETIME_MS, FADE_WARNING_MS) {
  const arr = Array.from(sprites.values());
  for (const sprite of arr) {
    const now = Date.now();
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
  
  // Remove expired
  for (const [id, sprite] of sprites) {
    if (sprite.markedForRemoval && sprite.opacity <= 0) {
      sprites.delete(id);
    }
  }
}
