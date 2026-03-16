// overlay_client.js - Modular skin assignment overlay
import { loadConfig, getConfigConstants } from './js/config.js';
import { setupCanvas, resizeCanvas, initializeCanvasDisplay } from './js/canvas.js';
import { setupInputHandlers } from './js/input.js';
import { createSkinsMap, loadSkinsFromConfig, fetchAutoSkins, preloadSkins } from './js/skins.js';
import { createUserSkinCache, fetchUserSkin } from './js/userSkinCache.js';
import { createAvatar, spawn } from './js/avatar.js';
import { handleCommand } from './js/commands.js';
import { updatePhysics, manageLifetime } from './js/physics.js';
import { createExplosionEffect, updateExplosionParticles } from './js/explosion.js';
import { draw as render, updateAvatarCountDisplay } from './js/renderer.js';
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
    MAX_AVATARS,
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
  const avatars = new Map();
  const skins = createSkinsMap();
  const spawnTimes = new Map();
  const explosionParticles = [];
  const userSkinCache = createUserSkinCache();
  const animatedMediaRenderer = createAnimatedMediaRenderer();
  
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
      const result = resizeCanvas(canvas, ctx, DPR, W, H, GROUND_Y, avatars);
      W = result.W;
      H = result.H;
      GROUND_Y = result.GROUND_Y;
    }, 100);
  };
  resize();
  window.addEventListener('resize', resize);
  
  // Input handling
  let draggedAvatar = null;
  setupInputHandlers(canvas, avatars, 
    (av) => { draggedAvatar = av; },
    (av, mx, my) => { /* drag move */ },
    (av) => { draggedAvatar = null; }
  );
  
  // Create avatar factory bound to current context
  function createAvatarWithContext(username) {
    return createAvatar(username, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX);
  }
  
  // Send avatar update to server
  function sendAvatarUpdateToServer(av) {
    if (USE_SERVER && window._SA && window._SA.connection && window._SA.connection.isConnected()) {
      window._SA.connection.send(JSON.stringify({
        type: 'avatarUpdate',
        id: av.id,
        username: av.username,
        skin: av.skin,
        state: av.state || 'idle',
        lastActivity: Date.now(),
        createdAt: av.createdAt,
        action: 'spawn'
      }));
    } else if (USE_SERVER) {
      dbg('WebSocket not connected, skipping avatarUpdate for', av.username);
    }
  }
  
  // Spawn wrapper
  function spawnAvatar(username) {
    const av = spawn(username, avatars, spawnTimes, MAX_AVATARS, SPAWN_THROTTLE_MS, createAvatarWithContext, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX);
    sendAvatarUpdateToServer(av);
    return av;
  }
  
  // Sync avatars from server state (server-authoritative)
  function syncAvatarsFromServer(serverAvatarList) {
    const serverIds = new Set(serverAvatarList.map(av => av.id));
    
    // Remove avatars that are no longer on the server
    for (const [id, av] of avatars) {
      if (!serverIds.has(id)) {
        avatars.delete(id);
        dbg('Removed avatar not on server:', id);
      }
    }
    
    // Update existing avatars and add new ones
    for (const serverAv of serverAvatarList) {
      const existingAv = avatars.get(serverAv.id);
      if (existingAv) {
        // Update skin, state, and activity from server (preserve physics state)
        if (existingAv.skin !== serverAv.skin) {
          existingAv.skin = serverAv.skin;
          dbg('Updated skin for', serverAv.username, 'to', serverAv.skin);
        }
        // Sync state from server - always set heightScale based on state
        if (serverAv.state !== undefined && existingAv.state !== serverAv.state) {
          existingAv.state = serverAv.state;
          dbg('Updated state for', serverAv.username, 'to', serverAv.state);
        }
        // Always apply heightScale and velocity based on current state
        if (existingAv.state === 'sit') {
          existingAv.heightScale = 0.75;
          existingAv.vx = 0;
          existingAv.vy = 0;
        } else {
          existingAv.heightScale = 1.0;
        }
        existingAv.lastActivity = serverAv.lastActivity;
        existingAv.createdAt = serverAv.createdAt;
      } else {
        // Create new avatar from server state
        const newAv = createAvatarWithContext(serverAv.username);
        newAv.skin = serverAv.skin;
        newAv.state = serverAv.state || 'idle';
        // Always set heightScale based on state
        if (newAv.state === 'sit') {
          newAv.heightScale = 0.75;
          newAv.vx = 0;
          newAv.vy = 0;
        } else {
          newAv.heightScale = 1.0;
        }
        newAv.lastActivity = serverAv.lastActivity;
        newAv.createdAt = serverAv.createdAt;
        avatars.set(newAv.id, newAv);
        dbg('Created new avatar from server:', serverAv.username, 'with state:', newAv.state);
      }
    }
    
    dbg('Synced with server: ', serverAvatarList.length, 'avatars, local count:', avatars.size);
  }
  
  // Send full current avatar state to server
  function sendFullStateToServer() {
    if (!USE_SERVER || !window._SA || !window._SA.connection || !window._SA.connection.isConnected()) {
      dbg('Cannot send full state: WebSocket not connected');
      return;
    }
    
    const avatarList = Array.from(avatars.values()).map(av => ({
      id: av.id,
      username: av.username,
      skin: av.skin,
      state: av.state || 'idle',
      createdAt: av.createdAt,
      lastActivity: Date.now()
    }));
    
    window._SA.connection.send(JSON.stringify({
      type: 'fullState',
      avatars: avatarList,
      timestamp: Date.now()
    }));
    
    dbg('Sent full state to server:', avatarList.length, 'avatars');
  }
  
  // Command handler wrapper
  async function handleUserCommand(username, text, tags = {}) {
    // In server mode, the server handles all command responses to avoid duplicates
    if (USE_SERVER) {
      return;
    }
    console.log('[DEBUG] handleUserCommand:', { username, text });
    const response = handleCommand(username, text, tags, cfg, avatars, skins, W, GROUND_Y, explosionParticles, createExplosionEffect,
                  spawnTimes, MAX_AVATARS, MAX_SPAWN_QUANTITY, SPAWN_THROTTLE_MS, createAvatarWithContext, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, sendAvatarUpdateToServer, DEBUG);
    
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
    // - avatarState sync for sit/unsit state changes
  }
  
  // Physics update wrapper
  function updatePhysicsWrapper(dt) {
    updatePhysics(dt, avatars, W, H, GROUND_Y, draggedAvatar,
                  GRAVITY, AIR_RESISTANCE, GROUND_FRICTION,
                  BOUNCE_DAMPING, MIN_VELOCITY);
    manageLifetime(avatars, SPRITE_LIFETIME_MS, FADE_WARNING_MS);
  }
  
  // Explosion particles update wrapper
  function updateExplosionParticlesWrapper(dt) {
    updateExplosionParticles(dt, explosionParticles);
  }
  
  // Render wrapper
  function renderWrapper() {
    render(ctx, W, H, GROUND_Y, avatars, skins, explosionParticles);
    animatedMediaRenderer.update(avatars, skins, W, H, GROUND_Y);
    updateAvatarCountDisplay(avatars);
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
              spawnAvatar(username);
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
            if (cmd === 'clearAvatars') {
              dbg('Clearing all avatars');
              avatars.clear();
              animatedMediaRenderer.clear();
            } else if (cmd === 'boom') {
              dbg('Boom command - applying explosion effect');
              // Random epicenter
              const epicenterX = Math.random() * (W - EXPLOSION_RADIUS_BASE) + (EXPLOSION_RADIUS_BASE / 2);
              const epicenterY = GROUND_Y;
              const explosionRadius = EXPLOSION_RADIUS_BASE + Math.random() * EXPLOSION_RADIUS_VAR;
              
              // Create explosion visual effect
              createExplosionEffect(epicenterX, epicenterY, explosionRadius, explosionParticles);
              
              // Apply physics to all avatars
              for (const av of avatars.values()) {
                const dx = av.x - epicenterX;
                const dy = av.y - epicenterY;
                const dist = Math.hypot(dx, dy);
                
                if (dist < explosionRadius && dist > COLLISION_PERSONAL_SPACE_THRESHOLD) {
                  const nx = dx / dist;
                  const ny = dy / dist;
                  const falloff = Math.pow(1 - dist / explosionRadius, 2);
                  const force = EXPLOSION_FORCE_MULTIPLIER * Math.max(0, falloff);
                  
                  av.vx += nx * force;
                  av.vy += ny * force * (1 - EXPLOSION_UPWARD_BIAS) - force * EXPLOSION_UPWARD_BIAS;
                  
                  const spinStrength = force * SPIN_STRENGTH_FACTOR;
                  av.angularVelocity += (Math.random() - 0.5) * spinStrength;
                  av.lastTiltTime = Date.now();
                  
                  av.vx += (Math.random() - 0.5) * force * RANDOM_JITTER_FACTOR;
                  av.vy += (Math.random() - 0.5) * force * RANDOM_JITTER_FACTOR;
                }
              }
            } else if (cmd === 'jump') {
              dbg('Jump command - applying velocity to avatar');
              // Apply jump velocity to the user's avatar
              if (data && data.username) {
                const userId = data.username.toLowerCase();
                const av = avatars.get(userId);
                if (av) {
                  av.vy = -12;
                  av.state = 'idle';
                  dbg('Applied jump velocity to', userId);
                } else {
                  dbg('Avatar not found for jump:', userId);
                }
              }
            }
          },
          (avatarState) => {
            dbg('Received avatar state from server:', avatarState.avatars.length, 'avatars');
            // Sync local avatars with server state
            syncAvatarsFromServer(avatarState.avatars);
          }
        );
      },
      () => {
        dbg('WebSocket connected');
        // Send full avatar state to server to ensure it knows about all current avatars
        sendFullStateToServer();
      }
    );
    
    // Expose connection for sending messages to server
    window._SA.connection = connection;
  } else {
    dbg('USE_SERVER=false - setting up TMI fallback');
    setupTmiFallback(cfg, (username, message, tags, type) => {
      dbg('TMI message from:', username, ':', message);
      spawnAvatar(username);
      if (message && message.trim().startsWith('!')) {
        handleUserCommand(username, message, tags);
      }
    });
  }
  
  // Complete window._SA initialization with remaining properties
  window._SA.spawn = spawnAvatar;
  window._SA.avatars = avatars;
  window._SA.skins = skins;
  window._SA.animatedMediaRenderer = animatedMediaRenderer;
  
  // Debug
  dbg('Overlay initialized successfully');
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    animatedMediaRenderer.destroy();
  });
})();
