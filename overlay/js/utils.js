// Utility functions
import { COLLISION_PROBABILITY_LOW, COLLISION_PROBABILITY_MEDIUM, COLLISION_PROBABILITY_HIGH, COLLISION_COUNT_THRESHOLD_LOW, COLLISION_COUNT_THRESHOLD_HIGH } from './config.js';

export function colorFromName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i);
    h |= 0;
  }
  return 'hsl(' + (Math.abs(h) % 360) + ' 70% 50%)';
}

export function getCollisionProbability(count) {
  if (count < COLLISION_COUNT_THRESHOLD_LOW) return COLLISION_PROBABILITY_LOW;
  if (count < COLLISION_COUNT_THRESHOLD_HIGH) return COLLISION_PROBABILITY_MEDIUM;
  return COLLISION_PROBABILITY_HIGH;
}

// Shared explosion physics — applies force to all sprites within radius of epicenter
// Accepts optional spriteArray for faster iteration (avoids Map.values() overhead)
export function applyExplosionPhysics(sprites, epicenterX, epicenterY, explosionRadius,
                                       forceMultiplier, upwardBias, spinStrengthFactor, randomJitterFactor,
                                       collisionPersonalSpaceThreshold, spriteArray) {
  const arr = spriteArray || Array.from(sprites.values());
  for (let i = 0; i < arr.length; i++) {
    const sprite = arr[i];
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

// Shared permission check for Twitch chat commands
export function hasModPermission(tags, username, cfg) {
  const isBroadcaster = tags?.badges?.broadcaster || username.toLowerCase() === (cfg.channel || '').toLowerCase();
  const isBot = username === cfg.botUsername;
  const isMod = tags?.mod === '1' || tags?.mod === 1 || tags?.badges?.moderator || tags?.badges?.global_mod || tags?.badges?.admin;
  return isBroadcaster || isBot || isMod;
}
