// Explosion visual effects module
import { PARTICLE_COUNT_BASE, PARTICLE_COUNT_VAR, PARTICLE_SPEED_BASE, PARTICLE_SPEED_VAR, PARTICLE_GRAVITY, PARTICLE_DECAY_BASE, PARTICLE_DECAY_VAR, PARTICLE_SIZE_BASE, PARTICLE_SIZE_VAR, PARTICLE_HUE_BASE, PARTICLE_HUE_RANGE } from './config.js';

export function createExplosionEffect(x, y, radius, explosionParticles) {
  const particleCount = PARTICLE_COUNT_BASE + Math.floor(Math.random() * PARTICLE_COUNT_VAR);
  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = PARTICLE_SPEED_BASE + Math.random() * PARTICLE_SPEED_VAR;
    explosionParticles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - PARTICLE_GRAVITY,
      life: 1.0,
      decay: PARTICLE_DECAY_BASE + Math.random() * PARTICLE_DECAY_VAR,
      size: PARTICLE_SIZE_BASE + Math.random() * PARTICLE_SIZE_VAR,
      color: `hsl(${Math.random() * PARTICLE_HUE_RANGE + PARTICLE_HUE_BASE}, 100%, 50%)`
    });
  }
}

export function updateExplosionParticles(dt, explosionParticles) {
  // Normalize particle motion to 60 FPS so effects last the same wall-clock
  // time on 60 Hz, 120 Hz, and 144 Hz displays.
  const frameScale = Math.min(3, Math.max(0, dt * 60));
  if (frameScale === 0) return;
  for (let i = explosionParticles.length - 1; i >= 0; i--) {
    const p = explosionParticles[i];
    p.x += p.vx * frameScale;
    p.y += p.vy * frameScale;
    p.vy += PARTICLE_GRAVITY * frameScale;
    p.life -= p.decay * frameScale;
    if (p.life <= 0) {
      // Swap with last element and pop — O(1) removal instead of O(n) splice
      explosionParticles[i] = explosionParticles[explosionParticles.length - 1];
      explosionParticles.pop();
    }
  }
}
