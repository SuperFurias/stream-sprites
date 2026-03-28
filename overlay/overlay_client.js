// overlay_client.js - Modular skin assignment overlay
import { loadConfig, getConfigConstants } from './js/config.js';
import { setupCanvas, resizeCanvas, initializeCanvasDisplay } from './js/canvas.js';
import { setupInputHandlers } from './js/input.js';
import { createSkinsMap, loadSkinsFromConfig, fetchAutoSkins, preloadSkins } from './js/skins.js';
import { createUserSkinCache, fetchUserSkin, createGameLoop } from './js/core.js';
import { createSprite, spawn } from './js/sprite.js';
import { handleCommand } from './js/commands.js';
import { updatePhysics, manageLifetime, markSpriteArrayDirty } from './js/physics.js';
import { createExplosionEffect, updateExplosionParticles } from './js/explosion.js';
import { draw as render, updateSpriteCountDisplay, markSpritesDirty } from './js/renderer.js';
import { setupWebSocket, setupTmiFallback, handleWebSocketMessage } from './js/connection.js';
import { createAnimatedMediaRenderer } from './js/animatedMediaRenderer.js';
import { applyExplosionPhysics, hasModPermission } from './js/utils.js';
import { EXPLOSION_RADIUS_BASE, EXPLOSION_RADIUS_VAR, EXPLOSION_FORCE_MULTIPLIER, EXPLOSION_UPWARD_BIAS, SPIN_STRENGTH_FACTOR, RANDOM_JITTER_FACTOR, COLLISION_PERSONAL_SPACE_THRESHOLD, JUMP_VELOCITY, HEIGHT_SCALE_SIT, HEIGHT_SCALE_IDLE, FIGHT_DURATION_MS, RESIZE_DEBOUNCE_MS, FLIP_DURATION_MS, GROUND_Y_MULTIPLIER, FLIP_ANGULAR_VELOCITY } from './js/config.js';

// Debug utility
function dbg(...args) {
  if (typeof DEBUG !== 'undefined' && DEBUG) {
    console.log('[OVERLAY DEBUG]', ...args);
  } else {
    console.log('[OVERLAY]', ...args);
  }
}

// Shared helper: apply server sprite state to a local sprite
function applySpriteState(sprite, serverSprite) {
  let changed = false;
  if (sprite.skin !== serverSprite.skin) {
    sprite.skin = serverSprite.skin;
  }
  if (serverSprite.state !== undefined && sprite.state !== serverSprite.state) {
    sprite.state = serverSprite.state;
    changed = true;
  }
  const prevHeightScale = sprite.heightScale;
  if (sprite.state === 'sit') {
    sprite.heightScale = HEIGHT_SCALE_SIT;
    sprite.vx = 0;
    sprite.vy = 0;
  } else {
    sprite.heightScale = HEIGHT_SCALE_IDLE;
  }
  if (prevHeightScale !== sprite.heightScale) changed = true;
  sprite.lastActivity = serverSprite.lastActivity;
  sprite.createdAt = serverSprite.createdAt;
  return changed;
}

// Shared helper: send chat response via server API
async function sendChatResponse(username, message) {
  try {
    const res = await fetch('/api/chat/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, message })
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[DEBUG] Failed to send chat response:', res.status, err);
    }
  } catch (err) {
    console.error('[DEBUG] Failed to send chat response:', err);
  }
}

(async function () {
  dbg('Overlay starting...');
  // Auto-detect if running in OBS
  const userAgent = navigator.userAgent || '';
  const isOBS = userAgent.toLowerCase().includes('obs') || userAgent.toLowerCase().includes('cef');

  if (!isOBS) {
    document.body.classList.add('browser-mode');
  }

  // Load configuration
  dbg('Loading config...');
  const cfg = await loadConfig();
  if (!cfg) {
    dbg('Failed to load config');
    return;
  }
  dbg('Config loaded:', { channel: cfg.channel, botUsername: cfg.botUsername, useServer: cfg.useServer });

  const overlay = cfg.overlay || {};
  const constants = getConfigConstants(cfg, overlay);

  // Destructure constants for easy access
  const {
    USE_SERVER,
    WS_URL,
    CHANNEL,
    BOT_USERNAME,
    OAUTH,
    DEBUG,
    MAX_SPRITES,
    MAX_SPAWN_QUANTITY,
    GRAVITY,
    AIR_RESISTANCE,
    GROUND_FRICTION,
    BOUNCE_DAMPING,
    MIN_VELOCITY,
    SPRITE_LIFETIME_MS,
    FADE_WARNING_MS,
    SPAWN_THROTTLE_MS,
    SPRITE_SIZE_MIN,
    SPRITE_SIZE_MAX,
    HEIGHT_SCALE_SIT,
    HEIGHT_SCALE_IDLE,
    FIGHT_DURATION_MS,
    RESIZE_DEBOUNCE_MS,
    FLIP_DURATION_MS,
    GROUND_Y_MULTIPLIER,
    JUMP_VELOCITY,
    FLIP_ANGULAR_VELOCITY
  } = constants;

  // Canvas setup
  const { canvas, ctx, DPR } = setupCanvas();
  let W = overlay.canvasWidth || 1920;
  let H = overlay.canvasHeight || 1080;
  let GROUND_Y = H * GROUND_Y_MULTIPLIER;

  // Initialize display
  initializeCanvasDisplay(cfg, USE_SERVER);

  // State
  const sprites = new Map();
  const skins = createSkinsMap();
  const spawnTimes = new Map();
  const explosionParticles = [];
  const userSkinCache = createUserSkinCache();
  const animatedMediaRenderer = createAnimatedMediaRenderer();
  // Track active fights: Set of fight IDs (winnerId_loserId)
  const activeFights = new Set();
  // Command cooldown tracking (per user per command) for local mode
  const commandCooldowns = new Map();

  // Only setup cooldown pruning in local mode (server mode handles its own cooldowns)
  if (!USE_SERVER) {
    setInterval(() => {
      const now = Date.now();
      const cooldownMs = (cfg.overlay && cfg.overlay.commandCooldownMs) || 5000;
      const expiry = cooldownMs * 2;
      for (const [key, timestamp] of commandCooldowns) {
        if (now - timestamp > expiry) {
          commandCooldowns.delete(key);
        }
      }
    }, 30000);
  }

  // Initialize window._SA early so connection can be added
  window._SA = {};

  // Load skins
  dbg('Loading skins...');
  loadSkinsFromConfig(skins, cfg);
  dbg('Skins after config:', Array.from(skins.keys()));
  await fetchAutoSkins(skins);
  dbg('Skins after auto-fetch:', Array.from(skins.keys()));
  await preloadSkins(skins);
  dbg('Skins preloaded. Total skins:', Array.from(skins.keys()));

  // Resize canvas with debouncing
  let resizeTimeout;
  const resize = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const result = resizeCanvas(canvas, ctx, DPR, W, H, GROUND_Y, sprites);
      W = result.W;
      H = result.H;
      GROUND_Y = result.GROUND_Y;
    }, RESIZE_DEBOUNCE_MS);
  };
  resize();
  window.addEventListener('resize', resize);

  // Input handling
  let draggedSprite = null;
  setupInputHandlers(canvas, sprites,
    (sprite) => { draggedSprite = sprite; },
    (sprite, mx, my) => { /* drag move */ },
    (sprite) => { draggedSprite = null; }
  );

  // Create sprite factory bound to current context
  function createSpriteWithContext(username) {
    return createSprite(username, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX);
  }

  // Send sprite update to server
  function sendSpriteUpdateToServer(sprite) {
    if (USE_SERVER && window._SA && window._SA.connection) {
      const ws = window._SA.connection.getWebSocket();
      if (ws && ws.readyState === WebSocket.OPEN) {
        window._SA.connection.send(JSON.stringify({
          type: 'spriteUpdate',
          id: sprite.id,
          username: sprite.username,
          skin: sprite.skin,
          state: sprite.state || 'idle',
          lastActivity: Date.now(),
          createdAt: sprite.createdAt,
          action: 'spawn'
        }));
      } else {
        dbg('WebSocket not open (state:', ws?.readyState, '), skipping spriteUpdate for', sprite.username);
      }
    } else if (USE_SERVER) {
      dbg('WebSocket not connected, skipping spriteUpdate for', sprite.username);
    }
  }

  // Spawn wrapper
  function spawnSprite(username) {
    const sprite = spawn(username, sprites, spawnTimes, MAX_SPRITES, SPAWN_THROTTLE_MS, createSpriteWithContext, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX);
    markSpritesDirty();
    markSpriteArrayDirty();
    sendSpriteUpdateToServer(sprite);
    return sprite;
  }

  // Sync sprites from server state (server-authoritative)
  function syncSpritesFromServer(serverSpriteList) {
    const serverIds = new Set(serverSpriteList.map(s => s.id));
    let changed = false;

    // Remove sprites that are no longer on the server
    for (const [id, sprite] of sprites) {
      if (!serverIds.has(id)) {
        sprites.delete(id);
        changed = true;
      }
    }

    // Update existing sprites and add new ones
    for (const serverSprite of serverSpriteList) {
      const existingSprite = sprites.get(serverSprite.id);
      if (existingSprite) {
        if (applySpriteState(existingSprite, serverSprite)) changed = true;
      } else {
        const newSprite = createSpriteWithContext(serverSprite.username);
        newSprite.skin = serverSprite.skin;
        newSprite.state = serverSprite.state || 'idle';
        if (newSprite.state === 'sit') {
          newSprite.heightScale = HEIGHT_SCALE_SIT;
          newSprite.vx = 0;
          newSprite.vy = 0;
        } else {
          newSprite.heightScale = HEIGHT_SCALE_IDLE;
        }
        newSprite.lastActivity = serverSprite.lastActivity;
        newSprite.createdAt = serverSprite.createdAt;
        sprites.set(newSprite.id, newSprite);
        changed = true;
      }
    }

    if (changed) {
      markSpritesDirty();
      markSpriteArrayDirty();
    }
  }

  // Apply delta updates from server (more efficient than full sync)
  function syncSpritesDelta(delta) {
    let changed = false;

    // Remove deleted sprites
    if (delta.removed && delta.removed.length > 0) {
      for (const id of delta.removed) {
        if (sprites.has(id)) {
          sprites.delete(id);
          changed = true;
        }
      }
    }

    // Add new sprites
    if (delta.added && delta.added.length > 0) {
      for (const serverSprite of delta.added) {
        if (!sprites.has(serverSprite.id)) {
          const newSprite = createSpriteWithContext(serverSprite.username);
          newSprite.skin = serverSprite.skin;
          newSprite.state = serverSprite.state || 'idle';
          if (newSprite.state === 'sit') {
            newSprite.heightScale = HEIGHT_SCALE_SIT;
            newSprite.vx = 0;
            newSprite.vy = 0;
          } else {
            newSprite.heightScale = HEIGHT_SCALE_IDLE;
          }
          newSprite.lastActivity = serverSprite.lastActivity;
          newSprite.createdAt = serverSprite.createdAt;
          sprites.set(newSprite.id, newSprite);
          changed = true;
        }
      }
    }

    // Update existing sprites
    if (delta.updated && delta.updated.length > 0) {
      for (const serverSprite of delta.updated) {
        const existing = sprites.get(serverSprite.id);
        if (existing) {
          if (applySpriteState(existing, serverSprite)) changed = true;
        }
      }
    }

    if (changed) {
      markSpritesDirty();
      markSpriteArrayDirty();
    }
  }

  // Send full current sprite state to server
  function sendFullStateToServer() {
    if (!USE_SERVER || !window._SA || !window._SA.connection || !window._SA.connection.isConnected()) {
      dbg('Cannot send full state: WebSocket not connected');
      return;
    }

    const spriteList = Array.from(sprites.values()).map(sprite => ({
      id: sprite.id,
      username: sprite.username,
      skin: sprite.skin,
      state: sprite.state || 'idle',
      createdAt: sprite.createdAt,
      lastActivity: Date.now()
    }));

    window._SA.connection.send(JSON.stringify({
      type: 'fullState',
      sprites: spriteList,
      timestamp: Date.now()
    }));

    dbg('Sent full state to server:', spriteList.length, 'sprites');
  }

  // Command handler wrapper
  async function handleUserCommand(username, text, tags = {}) {
    // In server mode, the server handles all command responses to avoid duplicates
    if (USE_SERVER) {
      return;
    }

    // Cooldown check for local mode (exemptions: broadcaster, mods, vips, subs)
    const cooldownMs = (cfg.overlay && cfg.overlay.commandCooldownMs) || 5000;
    if (cooldownMs > 0) {
      const isVip = tags?.badges?.vip;
      const isSub = tags?.badges?.subscriber;
      const exempt = hasModPermission(tags, username, cfg) || isVip || isSub;

      if (!exempt) {
        const userId = username.toLowerCase();
        const cmd = text.trim().split(' ')[0].toLowerCase();
        const cooldownKey = userId + ':' + cmd;
        const now = Date.now();
        const lastUsed = commandCooldowns.get(cooldownKey) || 0;
        if (now - lastUsed < cooldownMs) {
          const remaining = Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
          await sendChatResponse(username, `Please wait ${remaining} seconds before using ${cmd} again.`);
          return;
        }
        commandCooldowns.set(cooldownKey, now);
      }
    }

    // Build command context object instead of passing 20+ individual params
    const cmdCtx = {
      cfg, sprites, skins, W, GROUND_Y, explosionParticles, createExplosionEffect,
      spawnTimes, MAX_SPRITES, MAX_SPAWN_QUANTITY, SPAWN_THROTTLE_MS,
      createSprite: createSpriteWithContext, ctx, userSkinCache,
      SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, sendSpriteUpdate: sendSpriteUpdateToServer, DEBUG
    };

    const response = handleCommand(username, text, tags, cmdCtx);

    // If server already processed this command and sent a response, don't send another one
    if (tags?.commandResult && tags.commandResult.result) {
      return;
    }

    // If command returned a response, send it back to chat
    if (response) {
      await sendChatResponse(username, response);
    }
  }

  // Physics update wrapper - reuses array from physics to minimize GC
  let spriteArrayCache = null;

  function updatePhysicsWrapper(dt) {
    spriteArrayCache = updatePhysics(dt, sprites, W, H, GROUND_Y, draggedSprite,
                      GRAVITY, AIR_RESISTANCE, GROUND_FRICTION,
                      BOUNCE_DAMPING, MIN_VELOCITY);
    manageLifetime(sprites, SPRITE_LIFETIME_MS, FADE_WARNING_MS, spriteArrayCache);

    // Check active fights for collision
    for (const fightId of activeFights) {
      const [winnerId, loserId] = fightId.split('|');
      const winnerSprite = sprites.get(winnerId);
      const loserSprite = sprites.get(loserId);

      if (!winnerSprite || !loserSprite) {
        if (winnerSprite) winnerSprite.isFighting = false;
        if (loserSprite) loserSprite.isFighting = false;
        activeFights.delete(fightId);
        continue;
      }

      const dx = winnerSprite.x - loserSprite.x;
      const dy = winnerSprite.y - loserSprite.y;
      const distSq = dx * dx + dy * dy;
      const collisionDist = (winnerSprite.collisionRadius || winnerSprite.size/2) + (loserSprite.collisionRadius || loserSprite.size/2);

      if (distSq < collisionDist * collisionDist) {
        const midX = (winnerSprite.x + loserSprite.x) / 2;
        createExplosionEffect(midX, GROUND_Y, 200 + Math.random() * 100, explosionParticles);

        loserSprite.flipUntil = Date.now() + FIGHT_DURATION_MS;
        loserSprite.angularVelocity = (Math.random() > 0.5 ? 1 : -1) * FLIP_ANGULAR_VELOCITY;
        loserSprite.lastTiltTime = null;
        loserSprite.vx = 0;
        loserSprite.vy = 0;
        loserSprite.isExhausted = true;

        winnerSprite.vx += (Math.random() - 0.5) * 8;
        winnerSprite.vy -= 4;

        winnerSprite.isFighting = false;
        loserSprite.isFighting = false;

        dbg('Fight collision resolved:', { winnerId, loserId });
        activeFights.delete(fightId);
      }
    }
  }

  // Explosion particles update wrapper
  function updateExplosionParticlesWrapper(dt) {
    updateExplosionParticles(dt, explosionParticles);
  }

  // Render wrapper
  function renderWrapper() {
    render(ctx, W, H, GROUND_Y, sprites, skins, explosionParticles);
    animatedMediaRenderer.update(sprites, skins, W, H, GROUND_Y);
    updateSpriteCountDisplay(sprites);
  }

  // Game loop
  const loop = createGameLoop(renderWrapper, updatePhysicsWrapper, updateExplosionParticlesWrapper);
  requestAnimationFrame(loop);

  // Connection handling
  if (USE_SERVER) {
    dbg('Setting up WebSocket connection to:', WS_URL);
    const connection = setupWebSocket(WS_URL,
      (data) => {
        dbg('WebSocket message received:', data);
        handleWebSocketMessage(data,
          (username, message, tags) => {
            dbg('Chat message from:', username, ':', message);
            if (!userSkinCache.has(username.toLowerCase())) {
              fetchUserSkin(username, userSkinCache).then(() => {});
            }
            if (!tags?.skipSpawn) {
              spawnSprite(username);
            }
            if (tags?.isCommand && tags?.commandResult) {
              dbg('Server command result:', tags.commandResult.result);
            } else if (message && message.trim().startsWith('!') && !tags?.commandResult) {
              handleUserCommand(username, message, tags);
            }
          },
          (cmd, data) => {
            dbg('Command received:', cmd);
            if (cmd === 'clearSprites') {
              sprites.clear();
              markSpritesDirty();
              markSpriteArrayDirty();
              animatedMediaRenderer.clear();
            } else if (cmd === 'boom') {
              const epicenterX = Math.random() * (W - EXPLOSION_RADIUS_BASE) + (EXPLOSION_RADIUS_BASE / 2);
              const explosionRadius = EXPLOSION_RADIUS_BASE + Math.random() * EXPLOSION_RADIUS_VAR;
              createExplosionEffect(epicenterX, GROUND_Y, explosionRadius, explosionParticles);
              applyExplosionPhysics(sprites, epicenterX, GROUND_Y, explosionRadius,
                EXPLOSION_FORCE_MULTIPLIER, EXPLOSION_UPWARD_BIAS, SPIN_STRENGTH_FACTOR,
                RANDOM_JITTER_FACTOR, COLLISION_PERSONAL_SPACE_THRESHOLD);
            } else if (cmd === 'jump' && data?.username) {
              const userId = data.username.toLowerCase();
              const sprite = sprites.get(userId);
              if (sprite) {
                sprite.vy = JUMP_VELOCITY;
                sprite.state = 'idle';
              }
            } else if (cmd === 'flip' && data?.username) {
              const userId = data.username.toLowerCase();
              const sprite = sprites.get(userId);
              if (sprite) {
                sprite.flipUntil = Date.now() + (data.duration || FLIP_DURATION_MS);
                sprite.angularVelocity = (Math.random() > 0.5 ? 1 : -1) * FLIP_ANGULAR_VELOCITY;
                sprite.lastTiltTime = null;
              }
            } else if (cmd === 'fight' && data?.loser && data?.winner) {
              const winnerId = data.winner.toLowerCase();
              const loserId = data.loser.toLowerCase();
              const winnerSprite = sprites.get(winnerId);
              const loserSprite = sprites.get(loserId);
              if (winnerSprite && loserSprite) {
                winnerSprite.roamTargetX = loserSprite.x;
                winnerSprite.roamTargetY = GROUND_Y - 50;
                winnerSprite.roamSpeed = 1.0 + Math.random() * 0.5;
                winnerSprite.roamTimer = FIGHT_DURATION_MS;
                winnerSprite.state = 'idle';
                winnerSprite.isFighting = true;

                loserSprite.roamTargetX = winnerSprite.x;
                loserSprite.roamTargetY = GROUND_Y - 50;
                loserSprite.roamSpeed = 1.0 + Math.random() * 0.5;
                loserSprite.roamTimer = FIGHT_DURATION_MS;
                loserSprite.state = 'idle';
                loserSprite.isFighting = true;

                activeFights.add(`${winnerId}|${loserId}`);
              }
            }
          },
          (spriteState) => {
            syncSpritesFromServer(spriteState.sprites);
          },
          (spriteDelta) => {
            syncSpritesDelta(spriteDelta);
          }
        );
      },
      () => {
        dbg('WebSocket connected');
        sendFullStateToServer();
      }
    );

    window._SA.connection = connection;
  } else {
    dbg('USE_SERVER=false - setting up TMI fallback');
    setupTmiFallback(cfg, (username, message, tags, type) => {
      spawnSprite(username);
      if (message && message.trim().startsWith('!')) {
        handleUserCommand(username, message, tags);
      }
    });
  }

  // Complete window._SA initialization with remaining properties
  window._SA.spawn = spawnSprite;
  window._SA.sprites = sprites;
  window._SA.skins = skins;
  window._SA.animatedMediaRenderer = animatedMediaRenderer;

  dbg('Overlay initialized successfully');

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    animatedMediaRenderer.destroy();
  });
})();
