// Game loop module
import { DT_CAP } from './config.js';

export function createGameLoop(drawFn, updatePhysicsFn, updateExplosionParticlesFn) {
  let last = Date.now();
  
  function loop() {
    const now = Date.now();
    const dt = Math.min(DT_CAP, (now - last) / 1000);
    updatePhysicsFn(dt);
    drawFn();
    updateExplosionParticlesFn(dt);
    last = now;
    requestAnimationFrame(loop);
  }
  
  return loop;
}
