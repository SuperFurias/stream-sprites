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

      // Re-scale all sprite positions from server coordinates
      if (USE_SERVER) {
        const scaleX = getScaleX();
        const scaleY = getScaleY();
        for (const sprite of sprites.values()) {
          if (sprite._serverX !== undefined) {
            sprite.x = sprite._serverX * scaleX;
            sprite.y = sprite._serverY * scaleY;
          }
        }
        markSpritesDirty();
        markSpriteArrayDirty();
      }
    }, RESIZE_DEBOUNCE_MS);
  };
  resize();
  window.addEventListener('resize', resize);

  // Input handling
  let draggedSprite = null;
  setupInputHandlers(canvas, sprites,
    (sprite) => {
      draggedSprite = sprite;
      // Notify server of drag start (convert client coords to server coords)
      if (USE_SERVER && window._SA?.connection) {
        const invScaleX = serverW / W;
        const invScaleY = serverH / H;
        window._SA.connection.send(JSON.stringify({
          type: 'dragStart',
          spriteId: sprite.id,
          x: sprite.x * invScaleX,
          y: sprite.y * invScaleY
        }));
      }
    },
    (sprite, mx, my) => {
      // Notify server of drag move (convert client coords to server coords)
      if (USE_SERVER && window._SA?.connection) {
        const invScaleX = serverW / W;
        const invScaleY = serverH / H;
        window._SA.connection.send(JSON.stringify({
          type: 'dragMove',
          spriteId: sprite.id,
          x: sprite.x * invScaleX,
          y: sprite.y * invScaleY
        }));
      }
    },
    (sprite) => {
      // Notify server of drag end with throw velocity (convert client coords to server coords)
      if (USE_SERVER && window._SA?.connection) {
        const invScaleX = serverW / W;
        const invScaleY = serverH / H;
        window._SA.connection.send(JSON.stringify({
          type: 'dragEnd',
          spriteId: sprite.id,
          x: sprite.x * invScaleX,
          y: sprite.y * invScaleY,
          vx: sprite.vx * invScaleX,
          vy: sprite.vy * invScaleY
        }));
      }
      draggedSprite = null;
    }
  );

  // Create sprite factory bound to current context
  function createSpriteWithContext(username) {
    return createSprite(username, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX);
  }

  // Send sprite update to server (for local mode only)
  function sendSpriteUpdateToServer(sprite) {
    if (!USE_SERVER) return;
    // Server is authoritative — sprite creation is handled server-side
    // This function is kept for compatibility but does nothing in server mode
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

  // Send full current sprite state to server (for local mode sync only)
  function sendFullStateToServer() {
    if (!USE_SERVER) return;
    // Server is authoritative — no need to send client state
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

  // Server-authoritative scaling and interpolation state
  let serverW = W;   // Server's canvas width
  let serverH = H;   // Server's canvas height
  let serverGROUND_Y = GROUND_Y; // Server's ground Y
  let prevPhysicsState = null; // Previous server state for interpolation
  let currPhysicsState = null; // Current server state for interpolation
  let physicsStateTimestamp = 0; // When last state was received

  // Scale factors from server space to client space
  function getScaleX() { return W / serverW; }
  function getScaleY() { return H / serverH; }

  // Sync physics state from server — with interpolation support
  function syncPhysicsFromServer(data) {
    const serverSprites = data.sprites;

    // Update server dimensions if provided
    if (data.W && data.H) {
      serverW = data.W;
      serverH = data.H;
      serverGROUND_Y = data.GROUND_Y || serverH * GROUND_Y_MULTIPLIER;
    }

    // Store states for interpolation
    prevPhysicsState = currPhysicsState;
    currPhysicsState = { sprites: serverSprites, timestamp: data.timestamp || Date.now() };
    physicsStateTimestamp = Date.now();

    const serverIds = new Set(serverSprites.map(s => s.id));
    let changed = false;

    // Remove sprites that are no longer on the server
    for (const [id, sprite] of sprites) {
      if (!serverIds.has(id)) {
        sprites.delete(id);
        changed = true;
      }
    }

    const scaleX = getScaleX();
    const scaleY = getScaleY();

    // Apply server-authoritative physics state (scaled to client canvas)
    for (const ss of serverSprites) {
      let sprite = sprites.get(ss.id);
      if (!sprite) {
        sprite = {
          id: ss.id,
          username: ss.username,
          x: ss.x * scaleX, y: ss.y * scaleY,
          vx: 0, vy: 0,
          size: ss.size * scaleX,
          collisionRadius: (ss.collisionRadius || ss.size / 2) * scaleX,
          boundaryRadius: (ss.boundaryRadius || ss.size / 2) * scaleX,
          angle: ss.angle,
          angularVelocity: 0,
          facingRight: ss.facingRight,
          skin: ss.skin,
          color: '#888',
          state: ss.state,
          opacity: ss.opacity,
          heightScale: ss.heightScale,
          createdAt: ss.createdAt,
          lastActivity: ss.lastActivity,
          wiggle: Math.random() * 1000,
          mass: 1,
          lastTiltTime: null,
          flipUntil: null,
          isExhausted: false,
          textWidth: 0,
          // Server-space values for interpolation
          _serverX: ss.x, _serverY: ss.y,
          _prevServerX: ss.x, _prevServerY: ss.y
        };
        sprites.set(ss.id, sprite);
        changed = true;
      } else {
        // Store previous server position for interpolation
        sprite._prevServerX = sprite._serverX;
        sprite._prevServerY = sprite._serverY;
        sprite._serverX = ss.x;
        sprite._serverY = ss.y;

        // Update with scaled values
        sprite.x = ss.x * scaleX;
        sprite.y = ss.y * scaleY;
        sprite.size = ss.size * scaleX;
        sprite.collisionRadius = (ss.collisionRadius || ss.size / 2) * scaleX;
        sprite.boundaryRadius = (ss.boundaryRadius || ss.size / 2) * scaleX;
        sprite.angle = ss.angle;
        sprite.facingRight = ss.facingRight;
        sprite.opacity = ss.opacity;
        sprite.heightScale = ss.heightScale;
        sprite.state = ss.state;
        sprite.skin = ss.skin;
        sprite.lastActivity = ss.lastActivity;
      }
    }

    if (changed) {
      markSpritesDirty();
      markSpriteArrayDirty();
    }
  }

  // Interpolate sprite positions between physics state updates
  function interpolateSprites() {
    if (!currPhysicsState || !prevPhysicsState) return;

    const now = Date.now();
    const elapsed = now - physicsStateTimestamp;
    const interval = 33; // 30Hz broadcast interval
    const t = Math.min(1, elapsed / interval);

    const scaleX = getScaleX();
    const scaleY = getScaleY();

    for (const sprite of sprites.values()) {
      if (sprite._serverX !== undefined && sprite._prevServerX !== undefined) {
        // Linear interpolation between previous and current server positions
        const interpX = sprite._prevServerX + (sprite._serverX - sprite._prevServerX) * t;
        const interpY = sprite._prevServerY + (sprite._serverY - sprite._prevServerY) * t;
        sprite.x = interpX * scaleX;
        sprite.y = interpY * scaleY;
      }
    }
  }

  // Physics update: server mode interpolates, local mode runs physics
  let spriteArrayCache = null;

  function updatePhysicsWrapper(dt) {
    if (USE_SERVER) {
      // Interpolate sprite positions between server updates for smooth rendering
      interpolateSprites();
      spriteArrayCache = Array.from(sprites.values());
      return;
    }

    // Local mode: run physics client-side
    const result = updatePhysics(dt, sprites, W, H, GROUND_Y, draggedSprite,
                      GRAVITY, AIR_RESISTANCE, GROUND_FRICTION,
                      BOUNCE_DAMPING, MIN_VELOCITY);
    spriteArrayCache = result.arr;
    manageLifetime(sprites, SPRITE_LIFETIME_MS, FADE_WARNING_MS, spriteArrayCache, result.now);

    // Check active fights for collision (local mode only)
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
              // Server handles physics, client just renders explosion effect
              const epicenterX = data?.x || Math.random() * (W - EXPLOSION_RADIUS_BASE) + (EXPLOSION_RADIUS_BASE / 2);
              const explosionRadius = data?.radius || EXPLOSION_RADIUS_BASE + Math.random() * EXPLOSION_RADIUS_VAR;
              createExplosionEffect(epicenterX, GROUND_Y, explosionRadius, explosionParticles);
            }
            // jump, flip, fight are handled server-side via physicsState updates
          },
          (spriteState) => {
            if (USE_SERVER) {
              syncPhysicsFromServer(spriteState.sprites);
            } else {
              syncSpritesFromServer(spriteState.sprites);
            }
          },
          (spriteDelta) => {
            if (USE_SERVER) {
              syncPhysicsFromServer(spriteDelta.sprites);
            } else {
              syncSpritesDelta(spriteDelta);
            }
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
