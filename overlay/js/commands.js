// Command handling module
import { spawn } from './sprite.js';
import { EXPLOSION_RADIUS_BASE, EXPLOSION_RADIUS_VAR, EXPLOSION_FORCE_MULTIPLIER, EXPLOSION_UPWARD_BIAS, SPIN_STRENGTH_FACTOR, RANDOM_JITTER_FACTOR, NAME_LENGTH_LIMIT, VELOCITY_BUMP, COLLISION_PERSONAL_SPACE_THRESHOLD, FLIP_DURATION_MS } from './config.js';

// Debug utility
function dbg(...args) {
  if (typeof DEBUG !== 'undefined' && DEBUG) {
    console.log('[COMMANDS DEBUG]', ...args);
  } else {
    console.log('[COMMANDS]', ...args);
  }
}

export function handleCommand(username, text, tags, cfg, sprites, skins, W, GROUND_Y, explosionParticles, createExplosionEffect,
                              spawnTimes, MAX_SPRITES, MAX_SPAWN_QUANTITY, SPAWN_THROTTLE_MS, createSprite, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, sendSpriteUpdate, DEBUG = false) {
  dbg('handleCommand:', { username, text, cmd: text.trim().split(' ')[0].toLowerCase() });
  const cmd = text.trim().split(' ')[0].toLowerCase();
  const args = text.trim().split(' ').slice(1);
  const sprite = sprites.get(username.toLowerCase()) || spawn(username, sprites, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, createSprite, W, GROUND_Y, ctx, userSkinCache);

  let response = null;

  if (cmd === '!jump') {
    dbg('Jump command for', username);
    sprite.vy = -12;
    sprite.state = 'idle';
  } else if (cmd === '!sit') {
    dbg('Sit command for', username);
    sprite.state = 'sit';
    sprite.vx = 0;
    sprite.vy = 0;
    sprite.heightScale = 0.75;
  } else if (cmd === '!unsit') {
    dbg('Unsit command for', username);
    sprite.state = 'idle';
    sprite.heightScale = 1.0;
  } else if (cmd === '!boom') {
    dbg('Boom command by', username);
    handleBoomCommand(sprites, W, GROUND_Y, explosionParticles, createExplosionEffect);
  } else if (cmd === '!skin') {
    const parts = text.trim().split(' ');
    if (parts[1] && skins.has(parts[1])) {
      dbg('Skin change for', username, 'to', parts[1]);
      sprite.skin = parts[1];
    } else {
      dbg('Invalid skin attempt:', parts[1]);
    }
  } else if (cmd === '!skins') {
    dbg('Skins list requested by', username);
    const skinList = Array.from(skins.keys()).sort();
    if (skinList.length > 0) {
      response = `Available skins: ${skinList.join(', ')}`;
    } else {
      response = 'No skins available.';
    }
    dbg('Skins response:', response);
  } else if (cmd === '!spawn') {
    dbg('Spawn command by', username, 'args:', args);
    handleSpawnCommand(username, args, tags, cfg, sprites, spawn, createSprite, W, GROUND_Y, ctx, userSkinCache, skins, spawnTimes, MAX_SPRITES, MAX_SPAWN_QUANTITY, SPAWN_THROTTLE_MS, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, sendSpriteUpdate);
  } else if (cmd === '!flip') {
    dbg('Flip command by', username, 'args:', args);
    handleFlipCommand(username, args, tags, cfg, sprites, spawn, createSprite, W, GROUND_Y, ctx, userSkinCache, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX);
  } else if (cmd === '!fight') {
    dbg('Fight command by', username, 'args:', args);
    handleFightCommand(username, args, tags, cfg, sprites, spawn, createSprite, W, GROUND_Y, ctx, userSkinCache, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX);
  }

  return response;
}

const commandDescriptions = {
  '!jump': 'Make your sprite jump',
  '!sit': 'Make your sprite sit down',
  '!unsit': 'Make your sprite stand up',
  '!boom': 'Create an explosion',
  '!skin': 'Change your sprite skin (!skin <skinname>)',
  '!skins': 'List available skins',
  '!spawn': 'Spawn a new sprite (mods/broadcaster only)',
  '!flip': 'Flip your sprite upside down (!flip [username] for others)',
  '!fight': 'Fight another sprite - loser flips for 10 seconds (!fight <username>)'
};

function handleBoomCommand(sprites, W, GROUND_Y, explosionParticles, createExplosionEffect) {
  if (sprites.size === 0) return;
  
  const epicenterX = Math.random() * (W - EXPLOSION_RADIUS_BASE) + (EXPLOSION_RADIUS_BASE / 2);
  const epicenterY = GROUND_Y;
  const explosionRadius = EXPLOSION_RADIUS_BASE + Math.random() * EXPLOSION_RADIUS_VAR;
  const maxForce = EXPLOSION_FORCE_MULTIPLIER + Math.random() * (EXPLOSION_FORCE_MULTIPLIER * 0.5);
  const upwardBias = EXPLOSION_UPWARD_BIAS;
  
  createExplosionEffect(epicenterX, epicenterY, explosionRadius, explosionParticles);
  
  for (const sprite of sprites.values()) {
    const dx = sprite.x - epicenterX;
    const dy = sprite.y - epicenterY;
    const dist = Math.hypot(dx, dy);
    
    if (dist < explosionRadius && dist > COLLISION_PERSONAL_SPACE_THRESHOLD) {
      const nx = dx / dist;
      const ny = dy / dist;
      const falloff = Math.pow(1 - dist / explosionRadius, 2);
      const force = maxForce * Math.max(0, falloff);
      
      sprite.vx += nx * force;
      sprite.vy += ny * force * (1 - upwardBias) - force * upwardBias;
      
      const spinStrength = force * SPIN_STRENGTH_FACTOR;
      sprite.angularVelocity += (Math.random() - 0.5) * spinStrength;
      sprite.lastTiltTime = Date.now();

      sprite.vx += (Math.random() - 0.5) * force * RANDOM_JITTER_FACTOR;
      sprite.vy += (Math.random() - 0.5) * force * RANDOM_JITTER_FACTOR;
    }
  }
}

function handleSpawnCommand(username, args, tags, cfg, sprites, spawn, createSprite, W, GROUND_Y, ctx, userSkinCache, skins, spawnTimes, MAX_SPRITES, MAX_SPAWN_QUANTITY, SPAWN_THROTTLE_MS, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, sendSpriteUpdate, DEBUG = false) {
  if (DEBUG) console.log('!spawn command received:', { username, args, tags, channel: cfg.channel, botUsername: cfg.botUsername });
  
  const isBroadcaster = tags?.badges?.broadcaster || username.toLowerCase() === (cfg.channel || '').toLowerCase();
  const isBot = username === cfg.botUsername;
  const isMod = tags?.mod === '1' || tags?.badges?.moderator;
  
  if (DEBUG) console.log('Permission check:', { isBroadcaster, isBot, isMod, badges: tags?.badges, mod: tags?.mod });
  
  if (isBroadcaster || isBot || isMod) {
    let quantity = 1;
    let skinIndex = 0;
    let nameIndex = 1;
    
    if (args[0] && /^\d+$/.test(args[0])) {
      quantity = Math.min(MAX_SPAWN_QUANTITY, Math.max(1, parseInt(args[0], 10)));
      skinIndex = 1;
      nameIndex = 2;
    }
    
    const targetSkin = (args[skinIndex] && skins.has(args[skinIndex])) ? args[skinIndex] : 'default';
    let targetName = args[nameIndex] ? args[nameIndex].trim() : '';
    if (!targetName) {
      targetName = 'Sprite_' + Math.random().toString(36).substring(2, 8);
    } else {
      targetName = targetName.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, NAME_LENGTH_LIMIT);
    }
    
    if (DEBUG) console.log('!spawn creating:', { quantity, targetName, targetSkin });
    
    for (let i = 0; i < quantity; i++) {
      const uniqueName = quantity > 1 ? targetName + '_' + (i + 1) : targetName;
      const uniqueId = uniqueName.toLowerCase();
      
      const existing = sprites.get(uniqueId);
      let sprite;
      if (!existing) {
        sprite = spawn(uniqueName, sprites, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, createSprite, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX);
        sprite.skin = targetSkin;
        sprite.lastActivity = Date.now();
        if (DEBUG) console.log('!spawn created new sprite:', sprite.id);
      } else {
        sprite = existing;
        sprite.skin = targetSkin;
        sprite.lastActivity = Date.now();
        sprite.vx += (Math.random() - 0.5) * VELOCITY_BUMP;
        sprite.vy -= Math.random() * VELOCITY_BUMP;
        if (DEBUG) console.log('!spawn updated existing sprite:', sprite.id);
      }
      // Notify server about this sprite (server-authoritative sync)
      if (sendSpriteUpdate && typeof sendSpriteUpdate === 'function') {
        sendSpriteUpdate(sprite);
      }
    }
  } else if (DEBUG) {
    console.log('!spawn denied: insufficient permissions');
  }
}

function handleFlipCommand(username, args, tags, cfg, sprites, spawn, createSprite, W, GROUND_Y, ctx, userSkinCache, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX) {
  const targetUsername = args[0] ? args[0].toLowerCase() : username.toLowerCase();
  const isBroadcaster = tags?.badges?.broadcaster || username.toLowerCase() === (cfg?.channel || '').toLowerCase();
  const isBot = username === cfg?.botUsername;
  const isMod = tags?.mod === '1' || tags?.badges?.moderator;
  const canFlipOthers = isBroadcaster || isBot || isMod;
  
  let targetSprite;
  if (targetUsername === username.toLowerCase()) {
    // Flipping yourself - always allowed
    targetSprite = sprites.get(username.toLowerCase()) || spawn(username, sprites, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, createSprite, W, GROUND_Y, ctx, userSkinCache);
  } else {
    // Flipping someone else - requires permissions
    if (!canFlipOthers) {
      dbg('Flip denied: insufficient permissions for user', username);
      return `Only broadcaster/mods can flip other users.`;
    }
    targetSprite = sprites.get(targetUsername);
    if (!targetSprite) {
      dbg('Flip failed: target sprite not found for', targetUsername);
      return `User ${targetUsername} not found.`;
    }
  }
  
  // Apply animated flip effect
  const now = Date.now();
  targetSprite.flipUntil = now + FLIP_DURATION_MS;
  // Start with a strong spin to create the flipping animation
  targetSprite.angularVelocity = (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2); // 90 degrees per frame initially
  targetSprite.lastTiltTime = null; // Clear any existing tilt timer
  
  dbg('Flip applied to', targetUsername, 'until', new Date(targetSprite.flipUntil).toISOString());
}

function handleFightCommand(username, args, tags, cfg, sprites, spawn, createSprite, W, GROUND_Y, ctx, userSkinCache, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX) {
  const targetUsername = args[0] ? args[0].toLowerCase() : null;
  if (!targetUsername) {
    return 'Usage: !fight <username>';
  }
  if (targetUsername === username.toLowerCase()) {
    return 'You cannot fight yourself.';
  }
  // Ensure command user has a sprite (spawn if needed)
  const commandUserId = username.toLowerCase();
  let commandUserSprite = sprites.get(commandUserId);
  if (!commandUserSprite) {
    commandUserSprite = spawn(commandUserId, sprites, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, createSprite, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX);
  }
  // Ensure target exists
  const targetSprite = sprites.get(targetUsername);
  if (!targetSprite) {
    return `User '${targetUsername}' not found.`;
  }
  // Randomly choose loser (50% chance)
  const commandUserWins = Math.random() < 0.5;
  const loser = commandUserWins ? targetUsername : commandUserId;
  const loserSprite = commandUserWins ? targetSprite : commandUserSprite;
  const duration = 10000; // 10 seconds
  // Apply animated flip to loser
  const now = Date.now();
  loserSprite.flipUntil = now + duration;
  loserSprite.angularVelocity = (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2);
  loserSprite.lastTiltTime = null;
  dbg('Fight result:', { winner: commandUserWins ? commandUserId : targetUsername, loser, duration });
  // No chat response (silent command)
}
