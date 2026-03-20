// overlay_client.js - Modular skin assignment overlay
import { loadConfig, getConfigConstants } from './js/config.js';
import { setupCanvas, resizeCanvas, initializeCanvasDisplay } from './js/canvas.js';
import { setupInputHandlers } from './js/input.js';
import { createSkinsMap, loadSkinsFromConfig, fetchAutoSkins, preloadSkins } from './js/skins.js';
import { createUserSkinCache, fetchUserSkin } from './js/userSkinCache.js';
import { createSprite, spawn } from './js/sprite.js';
import { handleCommand } from './js/commands.js';
import { updatePhysics, manageLifetime } from './js/physics.js';
import { createExplosionEffect, updateExplosionParticles } from './js/explosion.js';
import { draw as render, updateSpriteCountDisplay } from './js/renderer.js';
import { createGameLoop } from './js/loop.js';
import { setupWebSocket, setupTmiFallback, handleWebSocketMessage } from './js/connection.js';
import { createAnimatedMediaRenderer } from './js/animatedMediaRenderer.js';
import { EXPLOSION_RADIUS_BASE, EXPLOSION_RADIUS_VAR, EXPLOSION_FORCE_MULTIPLIER, EXPLOSION_UPWARD_BIAS, SPIN_STRENGTH_FACTOR, RANDOM_JITTER_FACTOR, COLLISION_PERSONAL_SPACE_THRESHOLD } from './js/config.js';

// Debug utility
function dbg(...args) {
  if (typeof DEBUG !== 'undefined' && DEBUG) {
    console.log('[OVERLAY DEBUG]', ...args);
  } else {
    console.log('[OVERLAY]', ...args);
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
    SPRITE_SIZE_MAX
  } = constants;
  
  // Canvas setup
  const { canvas, ctx, DPR } = setupCanvas();
  let W = overlay.canvasWidth || 1920;
  let H = overlay.canvasHeight || 1080;
  let GROUND_Y = H * 0.95;
  
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
    }, 100);
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
    sendSpriteUpdateToServer(sprite);
    return sprite;
  }
  
  // Sync sprites from server state (server-authoritative)
  function syncSpritesFromServer(serverSpriteList) {
    const serverIds = new Set(serverSpriteList.map(s => s.id));
    
    // Remove sprites that are no longer on the server
    for (const [id, sprite] of sprites) {
      if (!serverIds.has(id)) {
        sprites.delete(id);
      }
    }
    
    // Update existing sprites and add new ones
    for (const serverSprite of serverSpriteList) {
      const existingSprite = sprites.get(serverSprite.id);
      if (existingSprite) {
        // Update skin, state, and activity from server (preserve physics state)
        if (existingSprite.skin !== serverSprite.skin) {
          existingSprite.skin = serverSprite.skin;
        }
        // Sync state from server - always set heightScale based on state
        if (serverSprite.state !== undefined && existingSprite.state !== serverSprite.state) {
          existingSprite.state = serverSprite.state;
        }
        // Always apply heightScale and velocity based on current state
        if (existingSprite.state === 'sit') {
          existingSprite.heightScale = 0.75;
          existingSprite.vx = 0;
          existingSprite.vy = 0;
        } else {
          existingSprite.heightScale = 1.0;
        }
        existingSprite.lastActivity = serverSprite.lastActivity;
        existingSprite.createdAt = serverSprite.createdAt;
      } else {
        // Create new sprite from server state
        const newSprite = createSpriteWithContext(serverSprite.username);
        newSprite.skin = serverSprite.skin;
        newSprite.state = serverSprite.state || 'idle';
        // Always set heightScale based on state
        if (newSprite.state === 'sit') {
          newSprite.heightScale = 0.75;
          newSprite.vx = 0;
          newSprite.vy = 0;
        } else {
          newSprite.heightScale = 1.0;
        }
        newSprite.lastActivity = serverSprite.lastActivity;
        newSprite.createdAt = serverSprite.createdAt;
        sprites.set(newSprite.id, newSprite);
      }
    }
    
    // Optional: summary log at reduced frequency could be added here
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
    console.log('[DEBUG] handleUserCommand:', { username, text });
    const response = handleCommand(username, text, tags, cfg, sprites, skins, W, GROUND_Y, explosionParticles, createExplosionEffect,
                  spawnTimes, MAX_SPRITES, MAX_SPAWN_QUANTITY, SPAWN_THROTTLE_MS, createSpriteWithContext, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, sendSpriteUpdateToServer, DEBUG);
    
    console.log('[DEBUG] Command response:', response);
    
    // If server already processed this command and sent a response, don't send another one
    if (tags?.commandResult && tags.commandResult.result) {
      console.log('[DEBUG] Server already sent response for this command, skipping duplicate');
      return;
    }
    
    // If command returned a response, send it back to chat
    if (response) {
      try {
        const res = await fetch('/api/chat/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, message: response })
        });
        if (!res.ok) {
          const err = await res.text();
          console.error('[DEBUG] Failed to send chat response:', res.status, err);
        } else {
          console.log('[DEBUG] Chat response sent successfully');
        }
      } catch (err) {
        console.error('[DEBUG] Failed to send chat response:', err);
      }
    }
  }
  
  // Send chat response via server
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
      } else {
        console.log('[DEBUG] Chat response sent successfully');
      }
    } catch (err) {
      console.error('[DEBUG] Failed to send chat response:', err);
    }
  }
  
  // Handle server-processed commands (for visual effects)
  // Note: Most command effects are now handled via the onCommand callback (boom, jump) or state sync (sit)
  function handleServerCommand(commandResult) {
    dbg('handleServerCommand:', commandResult);
    // No additional handling needed - effects are applied through:
    // - onCommand('boom') for explosion
    // - onCommand('jump') for jump velocity
    // - spriteState sync for sit/unsit state changes
  }
  
  // Physics update wrapper - reuses array from physics to minimize GC
  let spriteArrayCache = null;
  
  function updatePhysicsWrapper(dt) {
    // Get array from physics update (already created there)
    spriteArrayCache = updatePhysics(dt, sprites, W, H, GROUND_Y, draggedSprite,
                      GRAVITY, AIR_RESISTANCE, GROUND_FRICTION,
                      BOUNCE_DAMPING, MIN_VELOCITY);
    // Pass cached array to lifetime management to avoid re-converting Map to Array
    manageLifetime(sprites, SPRITE_LIFETIME_MS, FADE_WARNING_MS, spriteArrayCache);
    
    // Check active fights for collision
    for (const fightId of activeFights) {
      const [winnerId, loserId] = fightId.split('_');
      const winnerSprite = sprites.get(winnerId);
      const loserSprite = sprites.get(loserId);
      
      if (!winnerSprite || !loserSprite) {
        // One of the sprites is gone, end the fight
        activeFights.delete(fightId);
        continue;
      }
      
      // Check if they've collided (within combined collision radius)
      const dx = winnerSprite.x - loserSprite.x;
      const dy = winnerSprite.y - loserSprite.y;
      const dist = Math.hypot(dx, dy);
      const collisionDist = (winnerSprite.collisionRadius || winnerSprite.size/2) + (loserSprite.collisionRadius || loserSprite.size/2);
      
      if (dist < collisionDist) {
        // Collision detected! Trigger fight effects.
        const midX = (winnerSprite.x + loserSprite.x) / 2;
        const duration = 10000; // 10 seconds
        
        // Explosion effect
        const collisionRadius = 200 + Math.random() * 100;
        createExplosionEffect(midX, GROUND_Y, collisionRadius, explosionParticles);
        
        // Flip loser
        loserSprite.flipUntil = Date.now() + duration;
        loserSprite.angularVelocity = (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2);
        loserSprite.lastTiltTime = null;
        
        // Bump winner back
        const bumpForce = 8;
        winnerSprite.vx += (Math.random() - 0.5) * bumpForce;
        winnerSprite.vy -= bumpForce * 0.5;
        
        dbg('Fight collision resolved:', { winnerId, loserId });
        
        // Remove this fight from active tracking
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
            // Only spawn locally if server didn't handle it (skipSpawn not set)
            // skipSpawn and isCommand are in tags object
            if (!tags?.skipSpawn) {
              spawnSprite(username);
            }
            // If server processed command, handle visual effects (server is authoritative)
            if (tags?.isCommand && tags?.commandResult) {
              handleServerCommand(tags.commandResult);
              // Server already sent response via Twitch bot, no need to send again
              dbg('Server command result:', tags.commandResult.result);
            } else if (message && message.trim().startsWith('!') && !tags?.commandResult) {
              // Command was not processed by server (USE_SERVER=false or local mode)
              handleUserCommand(username, message, tags);
            }
          },
          (cmd) => {
            dbg('Command received:', cmd);
            if (cmd === 'clearSprites') {
              dbg('Clearing all sprites');
              sprites.clear();
              animatedMediaRenderer.clear();
            } else if (cmd === 'boom') {
              dbg('Boom command - applying explosion effect');
              // Random epicenter
              const epicenterX = Math.random() * (W - EXPLOSION_RADIUS_BASE) + (EXPLOSION_RADIUS_BASE / 2);
              const epicenterY = GROUND_Y;
              const explosionRadius = EXPLOSION_RADIUS_BASE + Math.random() * EXPLOSION_RADIUS_VAR;
              
              // Create explosion visual effect
              createExplosionEffect(epicenterX, epicenterY, explosionRadius, explosionParticles);
              
              // Apply physics to all sprites
              for (const sprite of sprites.values()) {
                const dx = sprite.x - epicenterX;
                const dy = sprite.y - epicenterY;
                const dist = Math.hypot(dx, dy);
                
                if (dist < explosionRadius && dist > COLLISION_PERSONAL_SPACE_THRESHOLD) {
                  const nx = dx / dist;
                  const ny = dy / dist;
                  const falloff = Math.pow(1 - dist / explosionRadius, 2);
                  const force = EXPLOSION_FORCE_MULTIPLIER * Math.max(0, falloff);
                  
                  sprite.vx += nx * force;
                  sprite.vy += ny * force * (1 - EXPLOSION_UPWARD_BIAS) - force * EXPLOSION_UPWARD_BIAS;
                  
                  const spinStrength = force * SPIN_STRENGTH_FACTOR;
                  sprite.angularVelocity += (Math.random() - 0.5) * spinStrength;
                  sprite.lastTiltTime = Date.now();
                  
                  sprite.vx += (Math.random() - 0.5) * force * RANDOM_JITTER_FACTOR;
                  sprite.vy += (Math.random() - 0.5) * force * RANDOM_JITTER_FACTOR;
                }
              }
            } else if (cmd === 'jump') {
              dbg('Jump command - applying velocity to sprite');
              // Apply jump velocity to the user's sprite
              if (data && data.username) {
                const userId = data.username.toLowerCase();
                const sprite = sprites.get(userId);
                if (sprite) {
                  sprite.vy = -12;
                  sprite.state = 'idle';
                  dbg('Applied jump velocity to', userId);
                } else {
                  dbg('Sprite not found for jump:', userId);
                }
              }
            } else if (cmd === 'flip') {
              dbg('Flip command - flipping sprite upside down');
              if (data && data.username) {
                const userId = data.username.toLowerCase();
                const sprite = sprites.get(userId);
                if (sprite) {
                  const duration = data.duration || 5000;
                  sprite.flipUntil = Date.now() + duration;
                  // Start with a strong spin for animated flip effect
                  sprite.angularVelocity = (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2);
                  sprite.lastTiltTime = null;
                  dbg('Applied flip to', userId, 'for', duration, 'ms');
                } else {
                  dbg('Sprite not found for flip:', userId);
                }
              } else {
                dbg('Fight command missing required data:', data);
              }
            } else if (cmd === 'fight') {
              dbg('Fight command - animating fight between sprites');
              if (data && data.loser && data.winner) {
                const winnerId = data.winner.toLowerCase();
                const loserId = data.loser.toLowerCase();
                const winnerSprite = sprites.get(winnerId);
                const loserSprite = sprites.get(loserId);
                
                if (winnerSprite && loserSprite) {
                  // Set both sprites to walk towards each other using the roaming system
                  // This creates natural walking behavior with acceleration/deceleration
                  winnerSprite.roamTargetX = loserSprite.x;
                  winnerSprite.roamTargetY = GROUND_Y - 50;
                  winnerSprite.roamSpeed = 1.0 + Math.random() * 0.5;
                  winnerSprite.roamTimer = 10000; // Long enough to reach target
                  winnerSprite.state = 'idle';
                  
                  loserSprite.roamTargetX = winnerSprite.x;
                  loserSprite.roamTargetY = GROUND_Y - 50;
                  loserSprite.roamSpeed = 1.0 + Math.random() * 0.5;
                  loserSprite.roamTimer = 10000;
                  loserSprite.state = 'idle';
                  
                  // Track this fight for collision detection
                  const fightId = `${winnerId}_${loserId}`;
                  activeFights.add(fightId);
                  
                  dbg('Fight started - sprites walking towards each other:', { winnerId, loserId });
                } else {
                  dbg('Sprites not found for fight - cannot start fight:', { winnerId, loserId });
                }
              }
            }
          },
          (spriteState) => {
            dbg('Received sprite state from server:', spriteState.sprites.length, 'sprites');
            // Sync local sprites with server state
            syncSpritesFromServer(spriteState.sprites);
          }
        );
      },
      () => {
        dbg('WebSocket connected');
        // Send full sprite state to server to ensure it knows about all current sprites
        sendFullStateToServer();
      }
    );
    
    // Expose connection for sending messages to server
    window._SA.connection = connection;
  } else {
    dbg('USE_SERVER=false - setting up TMI fallback');
    setupTmiFallback(cfg, (username, message, tags, type) => {
      dbg('TMI message from:', username, ':', message);
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
  
  // Debug
  dbg('Overlay initialized successfully');
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    animatedMediaRenderer.destroy();
  });
})();
