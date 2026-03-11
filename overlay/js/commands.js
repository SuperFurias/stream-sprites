// Command handling module
import { spawn } from './avatar.js';
import { EXPLOSION_RADIUS_BASE, EXPLOSION_RADIUS_VAR, EXPLOSION_FORCE_MULTIPLIER, EXPLOSION_UPWARD_BIAS, SPIN_STRENGTH_FACTOR, RANDOM_JITTER_FACTOR, MAX_SPAWN_QUANTITY, NAME_LENGTH_LIMIT, VELOCITY_BUMP, COLLISION_PERSONAL_SPACE_THRESHOLD } from './config.js';

// Debug utility
function dbg(...args) {
  if (typeof DEBUG !== 'undefined' && DEBUG) {
    console.log('[COMMANDS DEBUG]', ...args);
  } else {
    console.log('[COMMANDS]', ...args);
  }
}

export function handleCommand(username, text, tags, cfg, avatars, skins, W, GROUND_Y, explosionParticles, createExplosionEffect,
                              spawnTimes, MAX_AVATARS, SPAWN_THROTTLE_MS, createAvatar, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, sendAvatarUpdate, DEBUG = false) {
  dbg('handleCommand:', { username, text, cmd: text.trim().split(' ')[0].toLowerCase() });
  const cmd = text.trim().split(' ')[0].toLowerCase();
  const args = text.trim().split(' ').slice(1);
  const av = avatars.get(username.toLowerCase()) || spawn(username, avatars, spawnTimes, MAX_AVATARS, SPAWN_THROTTLE_MS, createAvatar, W, GROUND_Y, ctx, userSkinCache);

  let response = null;

  if (cmd === '!jump') {
    dbg('Jump command for', username);
    av.vy = -12;
    av.state = 'idle';
  } else if (cmd === '!sit') {
    dbg('Sit command for', username);
    av.state = 'sit';
    av.vx = 0;
    av.vy = 0;
    av.heightScale = 0.75;
  } else if (cmd === '!unsit') {
    dbg('Unsit command for', username);
    av.state = 'idle';
    av.heightScale = 1.0;
  } else if (cmd === '!boom') {
    dbg('Boom command by', username);
    handleBoomCommand(avatars, W, GROUND_Y, explosionParticles, createExplosionEffect);
  } else if (cmd === '!skin') {
    const parts = text.trim().split(' ');
    if (parts[1] && skins.has(parts[1])) {
      dbg('Skin change for', username, 'to', parts[1]);
      av.skin = parts[1];
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
    handleSpawnCommand(username, args, tags, cfg, avatars, spawn, createAvatar, W, GROUND_Y, ctx, userSkinCache, skins, spawnTimes, MAX_AVATARS, SPAWN_THROTTLE_MS, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, sendAvatarUpdate);
  }

  return response;
}

function handleBoomCommand(avatars, W, GROUND_Y, explosionParticles, createExplosionEffect) {
  if (avatars.size === 0) return;
  
  const epicenterX = Math.random() * (W - EXPLOSION_RADIUS_BASE) + (EXPLOSION_RADIUS_BASE / 2);
  const epicenterY = GROUND_Y;
  const explosionRadius = EXPLOSION_RADIUS_BASE + Math.random() * EXPLOSION_RADIUS_VAR;
  const maxForce = EXPLOSION_FORCE_MULTIPLIER + Math.random() * (EXPLOSION_FORCE_MULTIPLIER * 0.5);
  const upwardBias = EXPLOSION_UPWARD_BIAS;
  
  createExplosionEffect(epicenterX, epicenterY, explosionRadius, explosionParticles);
  
  for (const a of avatars.values()) {
    const dx = a.x - epicenterX;
    const dy = a.y - epicenterY;
    const dist = Math.hypot(dx, dy);
    
    if (dist < explosionRadius && dist > COLLISION_PERSONAL_SPACE_THRESHOLD) {
      const nx = dx / dist;
      const ny = dy / dist;
      const falloff = Math.pow(1 - dist / explosionRadius, 2);
      const force = maxForce * Math.max(0, falloff);
      
      a.vx += nx * force;
      a.vy += ny * force * (1 - upwardBias) - force * upwardBias;
      
      const spinStrength = force * SPIN_STRENGTH_FACTOR;
      a.angularVelocity += (Math.random() - 0.5) * spinStrength;
      a.lastTiltTime = Date.now();

      a.vx += (Math.random() - 0.5) * force * RANDOM_JITTER_FACTOR;
      a.vy += (Math.random() - 0.5) * force * RANDOM_JITTER_FACTOR;
    }
  }
}

function handleSpawnCommand(username, args, tags, cfg, avatars, spawn, createAvatar, W, GROUND_Y, ctx, userSkinCache, skins, spawnTimes, MAX_AVATARS, SPAWN_THROTTLE_MS, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, sendAvatarUpdate, DEBUG = false) {
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
      
      const existing = avatars.get(uniqueId);
      let av;
      if (!existing) {
        av = spawn(uniqueName, avatars, spawnTimes, MAX_AVATARS, SPAWN_THROTTLE_MS, createAvatar, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX);
        av.skin = targetSkin;
        av.lastActivity = Date.now();
        if (DEBUG) console.log('!spawn created new sprite:', av.id);
      } else {
        av = existing;
        av.skin = targetSkin;
        av.lastActivity = Date.now();
        av.vx += (Math.random() - 0.5) * VELOCITY_BUMP;
        av.vy -= Math.random() * VELOCITY_BUMP;
        if (DEBUG) console.log('!spawn updated existing sprite:', av.id);
      }
      // Notify server about this avatar (server-authoritative sync)
      if (sendAvatarUpdate && typeof sendAvatarUpdate === 'function') {
        sendAvatarUpdate(av);
      }
    }
  } else if (DEBUG) {
    console.log('!spawn denied: insufficient permissions');
  }
}
