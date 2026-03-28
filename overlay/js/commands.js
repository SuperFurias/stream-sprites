// Command handling module
import { spawn } from './sprite.js';
import { applyExplosionPhysics, hasModPermission } from './utils.js';
import { EXPLOSION_RADIUS_BASE, EXPLOSION_RADIUS_VAR, EXPLOSION_FORCE_MULTIPLIER, EXPLOSION_UPWARD_BIAS, SPIN_STRENGTH_FACTOR, RANDOM_JITTER_FACTOR, NAME_LENGTH_LIMIT, VELOCITY_BUMP, COLLISION_PERSONAL_SPACE_THRESHOLD, JUMP_VELOCITY as DEFAULT_JUMP_VELOCITY, HEIGHT_SCALE_SIT as DEFAULT_HEIGHT_SCALE_SIT, HEIGHT_SCALE_IDLE as DEFAULT_HEIGHT_SCALE_IDLE, FLIP_DURATION_MS as DEFAULT_FLIP_DURATION_MS, FIGHT_DURATION_MS as DEFAULT_FIGHT_DURATION_MS, FLIP_ANGULAR_VELOCITY as DEFAULT_FLIP_ANGULAR_VELOCITY, FIGHT_COIN_FLIP_PROBABILITY as DEFAULT_FIGHT_COIN_FLIP_PROBABILITY } from './config.js';

// Debug utility
function dbg(...args) {
  if (typeof DEBUG !== 'undefined' && DEBUG) {
    console.log('[COMMANDS DEBUG]', ...args);
  } else {
    console.log('[COMMANDS]', ...args);
  }
}

export function handleCommand(username, text, tags, cmdCtx) {
  // Destructure from context object instead of 20+ individual params
  const { cfg, sprites, skins, W, GROUND_Y, explosionParticles, createExplosionEffect,
          spawnTimes, MAX_SPRITES, MAX_SPAWN_QUANTITY, SPAWN_THROTTLE_MS,
          createSprite, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX,
          sendSpriteUpdate, DEBUG = false } = cmdCtx;

  dbg('handleCommand:', { username, text, cmd: text.trim().split(' ')[0].toLowerCase() });
  const cmd = text.trim().split(' ')[0].toLowerCase();
  const args = text.trim().split(' ').slice(1);
  const sprite = sprites.get(username.toLowerCase()) || spawn(username, sprites, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, createSprite, W, GROUND_Y, ctx, userSkinCache);

  // Read configurable values from overlay settings (with fallbacks from config.js defaults)
  const ov = cfg?.overlay || {};
  const JUMP_VELOCITY = ov.jumpVelocity ?? DEFAULT_JUMP_VELOCITY;
  const HEIGHT_SCALE_SIT = ov.heightScaleSit ?? DEFAULT_HEIGHT_SCALE_SIT;
  const HEIGHT_SCALE_IDLE = ov.heightScaleIdle ?? DEFAULT_HEIGHT_SCALE_IDLE;
  const FLIP_DURATION_MS = ov.flipDurationMs ?? DEFAULT_FLIP_DURATION_MS;
  const FIGHT_DURATION_MS = ov.fightDurationMs ?? DEFAULT_FIGHT_DURATION_MS;
  const FLIP_ANGULAR_VELOCITY = ov.flipAngularVelocity ?? DEFAULT_FLIP_ANGULAR_VELOCITY;
  const FIGHT_COIN_FLIP_PROBABILITY = ov.fightCoinFlipProbability ?? DEFAULT_FIGHT_COIN_FLIP_PROBABILITY;

  let response = null;

  if (cmd === '!jump') {
    sprite.vy = JUMP_VELOCITY;
    sprite.state = 'idle';
  } else if (cmd === '!sit') {
    sprite.state = 'sit';
    sprite.vx = 0;
    sprite.vy = 0;
    sprite.heightScale = HEIGHT_SCALE_SIT;
  } else if (cmd === '!unsit') {
    sprite.state = 'idle';
    sprite.heightScale = HEIGHT_SCALE_IDLE;
  } else if (cmd === '!boom') {
    handleBoomCommand(sprites, W, GROUND_Y, explosionParticles, createExplosionEffect);
  } else if (cmd === '!skin') {
    const parts = text.trim().split(' ');
    if (parts[1] && skins.has(parts[1])) {
      sprite.skin = parts[1];
    }
  } else if (cmd === '!skins') {
    const skinList = Array.from(skins.keys()).sort();
    response = skinList.length > 0 ? `Available skins: ${skinList.join(', ')}` : 'No skins available.';
  } else if (cmd === '!spawn') {
    handleSpawnCommand(username, args, tags, cfg, sprites, spawn, createSprite, W, GROUND_Y, ctx, userSkinCache, skins, spawnTimes, MAX_SPRITES, MAX_SPAWN_QUANTITY, SPAWN_THROTTLE_MS, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, sendSpriteUpdate);
  } else if (cmd === '!flip') {
    handleFlipCommand(username, args, sprites, spawn, createSprite, W, GROUND_Y, ctx, userSkinCache, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, FLIP_DURATION_MS, FLIP_ANGULAR_VELOCITY);
  } else if (cmd === '!fight') {
    handleFightCommand(username, args, sprites, spawn, createSprite, W, GROUND_Y, ctx, userSkinCache, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, FIGHT_DURATION_MS, FLIP_ANGULAR_VELOCITY, FIGHT_COIN_FLIP_PROBABILITY);
  }

  return response;
}

function handleBoomCommand(sprites, W, GROUND_Y, explosionParticles, createExplosionEffect) {
  if (sprites.size === 0) return;

  const epicenterX = Math.random() * (W - EXPLOSION_RADIUS_BASE) + (EXPLOSION_RADIUS_BASE / 2);
  const explosionRadius = EXPLOSION_RADIUS_BASE + Math.random() * EXPLOSION_RADIUS_VAR;

  createExplosionEffect(epicenterX, GROUND_Y, explosionRadius, explosionParticles);

  applyExplosionPhysics(sprites, epicenterX, GROUND_Y, explosionRadius,
    EXPLOSION_FORCE_MULTIPLIER + Math.random() * (EXPLOSION_FORCE_MULTIPLIER * 0.5),
    EXPLOSION_UPWARD_BIAS, SPIN_STRENGTH_FACTOR, RANDOM_JITTER_FACTOR,
    COLLISION_PERSONAL_SPACE_THRESHOLD);
}

function handleSpawnCommand(username, args, tags, cfg, sprites, spawn, createSprite, W, GROUND_Y, ctx, userSkinCache, skins, spawnTimes, MAX_SPRITES, MAX_SPAWN_QUANTITY, SPAWN_THROTTLE_MS, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, sendSpriteUpdate) {
  if (!hasModPermission(tags, username, cfg)) return;

  let quantity = 1;
  let targetSkin = 'default';
  let targetName = '';

  for (const arg of args) {
    if (/^\d+$/.test(arg)) {
      quantity = Math.min(MAX_SPAWN_QUANTITY, Math.max(1, parseInt(arg, 10)));
    } else if (skins.has(arg)) {
      targetSkin = arg;
    } else if (!targetName) {
      targetName = arg.trim().replace(/^@/, '');
    }
  }

  if (!targetName) {
    targetName = 'Sprite_' + Math.random().toString(36).substring(2, 8);
  } else {
    targetName = targetName.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, NAME_LENGTH_LIMIT);
  }

  for (let i = 0; i < quantity; i++) {
    const uniqueName = quantity > 1 ? targetName + '_' + (i + 1) : targetName;
    const uniqueId = uniqueName.toLowerCase();

    const existing = sprites.get(uniqueId);
    let sprite;
    if (!existing) {
      sprite = spawn(uniqueName, sprites, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, createSprite, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX);
      sprite.skin = targetSkin;
      sprite.lastActivity = Date.now();
    } else {
      sprite = existing;
      sprite.skin = targetSkin;
      sprite.lastActivity = Date.now();
      sprite.vx += (Math.random() - 0.5) * VELOCITY_BUMP;
      sprite.vy -= Math.random() * VELOCITY_BUMP;
    }
    if (sendSpriteUpdate && typeof sendSpriteUpdate === 'function') {
      sendSpriteUpdate(sprite);
    }
  }
}

function handleFlipCommand(username, args, sprites, spawn, createSprite, W, GROUND_Y, ctx, userSkinCache, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, FLIP_DURATION_MS, FLIP_ANGULAR_VELOCITY) {
  const targetUsername = args[0] ? args[0].toLowerCase().replace(/^@/, '') : username.toLowerCase();

  let targetSprite;
  if (targetUsername === username.toLowerCase()) {
    targetSprite = sprites.get(username.toLowerCase()) || spawn(username, sprites, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, createSprite, W, GROUND_Y, ctx, userSkinCache);
  } else {
    targetSprite = sprites.get(targetUsername);
    if (!targetSprite) return;
  }

  targetSprite.flipUntil = Date.now() + FLIP_DURATION_MS;
  targetSprite.angularVelocity = (Math.random() > 0.5 ? 1 : -1) * FLIP_ANGULAR_VELOCITY;
  targetSprite.lastTiltTime = null;
}

function handleFightCommand(username, args, sprites, spawn, createSprite, W, GROUND_Y, ctx, userSkinCache, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, FIGHT_DURATION_MS, FLIP_ANGULAR_VELOCITY, FIGHT_COIN_FLIP_PROBABILITY) {
  const targetUsername = args[0] ? args[0].toLowerCase().replace(/^@/, '') : null;
  if (!targetUsername || targetUsername === username.toLowerCase()) return;

  const commandUserId = username.toLowerCase();
  let commandUserSprite = sprites.get(commandUserId);
  if (!commandUserSprite) {
    commandUserSprite = spawn(commandUserId, sprites, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, createSprite, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX);
  }
  const targetSprite = sprites.get(targetUsername);
  if (!targetSprite) return;

  const commandUserWins = Math.random() < FIGHT_COIN_FLIP_PROBABILITY;
  const loserSprite = commandUserWins ? targetSprite : commandUserSprite;
  loserSprite.flipUntil = Date.now() + FIGHT_DURATION_MS;
  loserSprite.angularVelocity = (Math.random() > 0.5 ? 1 : -1) * FLIP_ANGULAR_VELOCITY;
  loserSprite.lastTiltTime = null;
  loserSprite.vx = 0;
  loserSprite.vy = 0;
  loserSprite.isExhausted = true;
}
