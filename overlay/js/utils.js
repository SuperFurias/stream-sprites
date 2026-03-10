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
  if (count < COLLISION_COUNT_THRESHOLD_LOW) return COLLISION_PROBABILITY_HIGH;
  if (count < COLLISION_COUNT_THRESHOLD_HIGH) return COLLISION_PROBABILITY_MEDIUM;
  return COLLISION_PROBABILITY_LOW;
}
