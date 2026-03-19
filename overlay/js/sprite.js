// Sprite creation and spawning module
import { getUserSkinFromCache } from './userSkinCache.js';
import { colorFromName } from './utils.js';

export function createSprite(username, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX) {
  // Random size within configured range
  const size = SPRITE_SIZE_MIN + Math.random() * (SPRITE_SIZE_MAX - SPRITE_SIZE_MIN);
  const skinId = getUserSkinFromCache(userSkinCache, username);
  const textWidth = ctx.measureText(username).width;
  const collisionRadius = size / 2;
  const boundaryRadius = Math.max(size / 2, textWidth / 2 + 4);
  const mass = Math.PI * Math.pow(size / 2, 2) / 1000;
  const momentOfInertia = 0.5 * mass * Math.pow(size / 2, 2);

  // Try to find a non-overlapping spawn position
  const MAX_TRIES = 8;
  let x, y;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    x = Math.random() * (W - 120) + 60;
    y = GROUND_Y - Math.random() * 40 - size / 2;
    // Note: overlap check will be done by caller passing sprites
  }
  if (typeof x === 'undefined') {
    x = Math.random() * (W - 120) + 60;
    y = GROUND_Y - Math.random() * 40 - size / 2;
  }
  x += (Math.random() - 0.5) * 6;
  y += (Math.random() - 0.5) * 6;

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
    wiggle: Math.random() * 1000,
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
    facingRight: true
  };
}

export function spawn(username, sprites, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, createSpriteFn, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX) {
  const key = username.toLowerCase();
  const last = spawnTimes.get(key) || 0;
  if (Date.now() - last < SPAWN_THROTTLE_MS && sprites.has(key)) {
    const sprite = sprites.get(key);
    sprite.vx += (Math.random() - 0.5) * 3;
    sprite.vy -= Math.random() * 3;
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
    const arr = Array.from(sprites.values()).sort((a, b) => a.createdAt - b.createdAt);
    const removeCount = Math.max(1, Math.floor(arr.length * 0.05));
    for (let i = 0; i < removeCount; i++) {
      sprites.delete(arr[i].id);
    }
  }
  const sprite = createSpriteFn(username, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX);
  sprites.set(sprite.id, sprite);
  return sprite;
}
