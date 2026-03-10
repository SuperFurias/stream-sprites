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
import { createGifRenderer } from './js/gifRenderer.js';

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
  const gifRenderer = createGifRenderer();
  
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
  
  // Spawn wrapper
  function spawnAvatar(username) {
    return spawn(username, avatars, spawnTimes, MAX_AVATARS, SPAWN_THROTTLE_MS, createAvatarWithContext, W, GROUND_Y, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX);
  }
  
  // Command handler wrapper
  async function handleUserCommand(username, text, tags = {}) {
    console.log('[DEBUG] handleUserCommand:', { username, text });
    const response = handleCommand(username, text, tags, cfg, avatars, skins, W, GROUND_Y, explosionParticles, createExplosionEffect,
                  spawnTimes, MAX_AVATARS, SPAWN_THROTTLE_MS, createAvatarWithContext, ctx, userSkinCache, SPRITE_SIZE_MIN, SPRITE_SIZE_MAX, DEBUG);
    
    console.log('[DEBUG] Command response:', response);
    
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
    gifRenderer.update(avatars, skins, W, H, GROUND_Y);
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
            spawnAvatar(username);
            if (message && message.trim().startsWith('!')) {
              handleUserCommand(username, message, tags);
            }
          },
          (cmd) => {
            dbg('Command received:', cmd);
            if (cmd === 'clearAvatars') {
              dbg('Clearing all avatars');
              avatars.clear();
              gifRenderer.clear();
            }
          }
        );
      },
      () => dbg('WebSocket connected')
    );
    
    // Expose connection for debugging
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
  
  // Debug
  dbg('Overlay initialized successfully');
  window._SA = { spawn: spawnAvatar, avatars, skins, gifRenderer };
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    gifRenderer.destroy();
  });
})();
