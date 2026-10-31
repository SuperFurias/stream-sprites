// Sprite creation and spawning module — optimized with text measurement cache
import { getUserSkinFromCache } from './core.js';
import { colorFromName } from './utils.js';
import {
  SPAWN_MAX_TRIES,
  SPAWN_SIZE_PADDING,
  SPAWN_BOUNDS_PADDING,
  SPAWN_Y_OFFSET,
  SPAWN_JITTER,
  TEXT_WIDTH_PADDING,
  MASS_DIVISOR,
  MOMENT_OF_INERTIA_FACTOR,
  VELOCITY_BUMP,
  WIGGLE_RANGE
} from './config.js';

// Text measurement cache with LRU eviction to prevent unbounded growth
const TEXT_WIDTH_CACHE_MAX = 1000;
const textWidthCache = new Map();

function getCachedTextWidth(ctx, username) {
  const cached = textWidthCache.get(username);
  if (cached !== undefined) {
    // Move to end (most recently used)
    textWidthCache.delete(username);
    textWidthCache.set(username, cached);
    return cached;
  }
  const width = ctx.measureText(username).width;
  textWidthCache.set(username, width);
  // Evict oldest entry if over capacity
  if (textWidthCache.size > TEXT_WIDTH_CACHE_MAX) {
    const oldestKey = textWidthCache.keys().next().value;
    textWidthCache.delete(oldestKey);
  }
  return width;
}

export function createSprite(username, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX) {
  // Random size within configured range
  const size = SPRITE_SIZE_MIN + Math.random() * (SPRITE_SIZE_MAX - SPRITE_SIZE_MIN);
  const skinId = getUserSkinFromCache(userSkinCache, username);
  const textWidth = getCachedTextWidth(ctx, username);
  const collisionRadius = size / 2;
  const boundaryRadius = Math.max(size / 2, textWidth / 2 + TEXT_WIDTH_PADDING);
  const mass = Math.PI * Math.pow(size / 2, 2) / MASS_DIVISOR;
  const momentOfInertia = MOMENT_OF_INERTIA_FACTOR * mass * Math.pow(size / 2, 2);

  // Generate spawn position (overlap check done by caller if needed)
  let x = Math.random() * (W - SPAWN_SIZE_PADDING) + SPAWN_BOUNDS_PADDING;
  let y = GROUND_Y - Math.random() * SPAWN_Y_OFFSET - size / 2;
  x += (Math.random() - 0.5) * SPAWN_JITTER;
  y += (Math.random() - 0.5) * SPAWN_JITTER;

  return {
    id: username.toLowerCase(),
    username,
    x,
    y,
    vx: (Math.random() - 0.5) * 2,
    vy: 0,
    size,
    textWidth,
    collisionRadius,
    boundaryRadius,
    skin: skinId,
    color: colorFromName(username),
    state: 'idle',
    createdAt: Date.now(),
    lastActivity: Date.now(),
    wiggle: Math.random() * WIGGLE_RANGE,
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
    isExhausted: false
  };
}

export function spawn(username, sprites, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, createSpriteFn, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX) {
  const key = username.toLowerCase();
  const last = spawnTimes.get(key) || 0;
  if (Date.now() - last < SPAWN_THROTTLE_MS && sprites.has(key)) {
    const sprite = sprites.get(key);
    sprite.vx += (Math.random() - 0.5) * VELOCITY_BUMP;
    sprite.vy -= Math.random() * VELOCITY_BUMP;
    sprite.lastActivity = Date.now();
    return sprite;
  }
  spawnTimes.set(key, Date.now());
  if (sprites.has(key)) {
    const sprite = sprites.get(key);
    sprite.lastActivity = Date.now();
    return sprite;
  }
  if (sprites.size >= MAX_SPRITES) {
    // Find and remove the oldest sprite via single pass (O(n) instead of O(n log n) sort)
    let oldestId = null;
    let oldestTime = Infinity;
    for (const [id, s] of sprites) {
      if (s.createdAt < oldestTime) {
        oldestTime = s.createdAt;
        oldestId = id;
      }
    }
    if (oldestId) sprites.delete(oldestId);
  }
  const sprite = createSpriteFn(username, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX);
  sprites.set(sprite.id, sprite);
  return sprite;
}
