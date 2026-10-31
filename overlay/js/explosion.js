// Explosion visual effects module
import { PARTICLE_COUNT_BASE, PARTICLE_COUNT_VAR, PARTICLE_SPEED_BASE, PARTICLE_SPEED_VAR, PARTICLE_GRAVITY, PARTICLE_DECAY_BASE, PARTICLE_DECAY_VAR, PARTICLE_SIZE_BASE, PARTICLE_SIZE_VAR, PARTICLE_HUE_BASE, PARTICLE_HUE_RANGE } from './config.js';

function numberOption(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createExplosionEffect(x, y, radius, explosionParticles, options = {}) {
  const countBase = Math.max(0, numberOption(options.countBase, PARTICLE_COUNT_BASE));
  const countVar = Math.max(0, numberOption(options.countVar, PARTICLE_COUNT_VAR));
  const speedBase = numberOption(options.speedBase, PARTICLE_SPEED_BASE);
  const speedVar = Math.max(0, numberOption(options.speedVar, PARTICLE_SPEED_VAR));
  const gravity = numberOption(options.gravity, PARTICLE_GRAVITY);
  const decayBase = Math.max(0, numberOption(options.decayBase, PARTICLE_DECAY_BASE));
  const decayVar = Math.max(0, numberOption(options.decayVar, PARTICLE_DECAY_VAR));
  const sizeBase = Math.max(0, numberOption(options.sizeBase, PARTICLE_SIZE_BASE));
  const sizeVar = Math.max(0, numberOption(options.sizeVar, PARTICLE_SIZE_VAR));
  const hueBase = numberOption(options.hueBase, PARTICLE_HUE_BASE);
  const hueRange = Math.max(0, numberOption(options.hueRange, PARTICLE_HUE_RANGE));

  const particleCount = countBase + Math.floor(Math.random() * countVar);
  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = speedBase + Math.random() * speedVar;
    explosionParticles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - gravity,
      life: 1.0,
      decay: decayBase + Math.random() * decayVar,
      gravity,
      size: sizeBase + Math.random() * sizeVar,
      color: `hsl(${Math.random() * hueRange + hueBase}, 100%, 50%)`
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
    p.vy += (p.gravity ?? PARTICLE_GRAVITY) * frameScale;
    p.life -= p.decay * frameScale;
    if (p.life <= 0) {
      // Swap with last element and pop — O(1) removal instead of O(n) splice
      explosionParticles[i] = explosionParticles[explosionParticles.length - 1];
      explosionParticles.pop();
    }
  }
}
