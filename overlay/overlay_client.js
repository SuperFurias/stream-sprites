// overlay_client.js - Server-mode only overlay
import { loadConfig, getConfigConstants, getServerBaseUrl } from './js/config.js';
import { setupCanvas, resizeCanvas, initializeCanvasDisplay } from './js/canvas.js';
import { setupInputHandlers } from './js/input.js';
import { createSkinsMap, loadSkinsFromConfig, fetchAutoSkins, preloadSkins } from './js/skins.js';
import { createUserSkinCache, fetchUserSkin, createGameLoop } from './js/core.js';
import { createSprite } from './js/sprite.js';
import { createExplosionEffect, updateExplosionParticles } from './js/explosion.js';
import { draw as render, updateSpriteCountDisplay, markSpritesDirty } from './js/renderer.js';
import { setupWebSocket, handleWebSocketMessage } from './js/connection.js';
import { createAnimatedMediaRenderer } from './js/animatedMediaRenderer.js';
import { EXPLOSION_RADIUS_BASE, EXPLOSION_RADIUS_VAR, GROUND_Y_MULTIPLIER, RESIZE_DEBOUNCE_MS } from './js/config.js';

function dbg(...args) {
  console.log('[OVERLAY]', ...args);
}

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
    sprite.heightScale = 0.75;
    sprite.vx = 0;
    sprite.vy = 0;
  } else {
    sprite.heightScale = 1.0;
  }
  if (prevHeightScale !== sprite.heightScale) changed = true;
  sprite.lastActivity = serverSprite.lastActivity;
  sprite.createdAt = serverSprite.createdAt;
  return changed;
}

(async function () {
  dbg('Overlay starting...');
  const userAgent = navigator.userAgent || '';
  const isOBS = userAgent.toLowerCase().includes('obs') || userAgent.toLowerCase().includes('cef');

  if (!isOBS) {
    document.body.classList.add('browser-mode');
  }

  dbg('Loading config...');
  const cfg = await loadConfig();
  if (!cfg) {
    dbg('Failed to load config');
    return;
  }
  dbg('Config loaded:', { channel: cfg.channel, botUsername: cfg.botUsername });

  const overlay = cfg.overlay || {};
  const constants = getConfigConstants(cfg, overlay);

  const {
    WS_URL,
    DEBUG,
    RESIZE_DEBOUNCE_MS: RESIZE_DEBOUNCE,
    GROUND_Y_MULTIPLIER: GROUND_Y_MULT
  } = constants;

  const { canvas, ctx, DPR } = setupCanvas();
  const SERVER_W = overlay.canvasWidth || 1920;
  const SERVER_H = overlay.canvasHeight || 1080;
  let W = SERVER_W;
  let H = SERVER_H;
  let GROUND_Y = overlay.groundY ?? SERVER_H * GROUND_Y_MULT;
  let renderScaleX = 1;
  let renderScaleY = 1;

  initializeCanvasDisplay(cfg);

  const sprites = new Map();
  const skins = createSkinsMap();
  const explosionParticles = [];
  const userSkinCache = createUserSkinCache();
  const animatedMediaRenderer = createAnimatedMediaRenderer();

  window._SA = {};

  dbg('Loading skins...');
  loadSkinsFromConfig(skins, cfg);
  dbg('Skins after config:', Array.from(skins.keys()));
  await fetchAutoSkins(skins);
  dbg('Skins after auto-fetch:', Array.from(skins.keys()));
  await preloadSkins(skins);
  dbg('Skins preloaded. Total skins:', Array.from(skins.keys()));

  let resizeTimeout;
  const resize = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const result = resizeCanvas(canvas, ctx, DPR, W, H, GROUND_Y, sprites, SERVER_W, SERVER_H, SERVER_H * GROUND_Y_MULT);
      W = result.W;
      H = result.H;
      GROUND_Y = result.GROUND_Y;
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      renderScaleX = screenW / SERVER_W;
      renderScaleY = screenH / SERVER_H;
      GROUND_Y = screenH * GROUND_Y_MULT;
    }, RESIZE_DEBOUNCE);
  };
  resize();
  window.addEventListener('resize', resize);

  let draggedSprite = null;
  setupInputHandlers(canvas, sprites,
    (sprite) => {
      draggedSprite = sprite;
      if (window._SA?.connection) {
        window._SA.connection.send(JSON.stringify({
          type: 'dragStart',
          spriteId: sprite.id,
          x: sprite.x,
          y: sprite.y
        }));
      }
    },
    (sprite, mx, my) => {
      if (window._SA?.connection) {
        window._SA.connection.send(JSON.stringify({
          type: 'dragMove',
          spriteId: sprite.id,
          x: sprite.x,
          y: sprite.y
        }));
      }
    },
    (sprite) => {
      if (window._SA?.connection) {
        window._SA.connection.send(JSON.stringify({
          type: 'dragEnd',
          spriteId: sprite.id,
          x: sprite.x,
          y: sprite.y,
          vx: sprite.vx,
          vy: sprite.vy
        }));
      }
      draggedSprite = null;
    },
    SERVER_W,
    SERVER_H
  );

  function createSpriteWithContext(username) {
    return createSprite(username, W, GROUND_Y, ctx, userSkinCache, constants.SPRITE_SIZE_MIN, constants.SPRITE_SIZE_MAX);
  }

  function syncSpritesDelta(delta) {
    let changed = false;

    if (delta.removed && delta.removed.length > 0) {
      for (const id of delta.removed) {
        if (sprites.has(id)) {
          sprites.delete(id);
          changed = true;
        }
      }
    }

    if (delta.added && delta.added.length > 0) {
      for (const serverSprite of delta.added) {
        if (!sprites.has(serverSprite.id)) {
          const newSprite = createSpriteWithContext(serverSprite.username);
          newSprite.skin = serverSprite.skin;
          newSprite.state = serverSprite.state || 'idle';
          newSprite.heightScale = newSprite.state === 'sit' ? 0.75 : 1.0;
          if (newSprite.state === 'sit') {
            newSprite.vx = 0;
            newSprite.vy = 0;
          }
          newSprite.lastActivity = serverSprite.lastActivity;
          newSprite.createdAt = serverSprite.createdAt;
          sprites.set(newSprite.id, newSprite);
          changed = true;
        }
      }
    }

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
    }
  }

  let prevServerState = new Map();
  let nextServerState = new Map();
  const serverIds = new Set();
  let lastServerUpdateTime = 0;
  let serverUpdateInterval = 16;

  function syncPhysicsFromServer(serverState) {
    serverIds.clear();
    for (let i = 0; i < serverState.length; i++) serverIds.add(serverState[i].id);
    let changed = false;

    for (const [id, sprite] of sprites) {
      if (!serverIds.has(id)) {
        sprites.delete(id);
        prevServerState.delete(id);
        nextServerState.delete(id);
        changed = true;
      }
    }

    prevServerState = new Map(nextServerState);
    nextServerState.clear();
    const now = performance.now();
    const actualInterval = now - lastServerUpdateTime;
    if (actualInterval > 5 && actualInterval < 200) {
      serverUpdateInterval = serverUpdateInterval * 0.9 + actualInterval * 0.1;
    }
    lastServerUpdateTime = now;

    for (const ss of serverState) {
      nextServerState.set(ss.id, ss);

      let sprite = sprites.get(ss.id);
      if (!sprite) {
        sprite = {
          id: ss.id,
          username: ss.username,
          x: ss.x, y: ss.y,
          vx: ss.vx, vy: ss.vy,
          size: ss.size,
          collisionRadius: ss.collisionRadius,
          boundaryRadius: ss.boundaryRadius,
          angle: ss.angle,
          angularVelocity: ss.angularVelocity || 0,
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
          roamTargetX: null, roamTargetY: null,
          roamSpeed: 1, roamTimer: 0, roamDuration: 0,
          textWidth: 0
        };
        prevServerState.set(ss.id, ss);
        sprites.set(ss.id, sprite);
        changed = true;
      }
    }

    if (changed) {
      markSpritesDirty();
    }
  }

  function interpolateSprites() {
    if (prevServerState.size === 0) return;

    const now = performance.now();
    const elapsed = now - lastServerUpdateTime;
    const t = Math.min(1, elapsed / serverUpdateInterval);

    for (const [id, sprite] of sprites) {
      const prev = prevServerState.get(id);
      const next = nextServerState.get(id);
      if (!prev || !next) continue;

      sprite.x = prev.x + (next.x - prev.x) * t;
      sprite.y = prev.y + (next.y - prev.y) * t;
      // Interpolate rotation along the shortest arc to avoid visible back-spins.
      let angleDelta = next.angle - prev.angle;
      angleDelta = Math.atan2(Math.sin(angleDelta), Math.cos(angleDelta));
      sprite.angle = prev.angle + angleDelta * t;
      sprite.opacity = next.opacity;
      sprite.facingRight = next.facingRight;
      sprite.size = next.size;
      sprite.skin = next.skin;
      sprite.state = next.state;
      sprite.heightScale = next.heightScale;
      sprite.collisionRadius = next.collisionRadius;
      sprite.boundaryRadius = next.boundaryRadius;
    }
  }

  function updatePhysicsWrapper(dt) {
    // Server is authoritative — physics runs on server, client only renders
  }

  function updateExplosionParticlesWrapper(dt) {
    updateExplosionParticles(dt, explosionParticles);
  }

  function renderWrapper() {
    interpolateSprites();
    render(ctx, W, H, GROUND_Y, sprites, skins, explosionParticles, renderScaleX, renderScaleY);
    animatedMediaRenderer.update(sprites, skins, W, H, GROUND_Y);
    updateSpriteCountDisplay(sprites);
  }

  const loop = createGameLoop(renderWrapper, updatePhysicsWrapper, updateExplosionParticlesWrapper);
  requestAnimationFrame(loop);

  dbg('Setting up WebSocket connection to:', WS_URL);
  const connection = setupWebSocket(WS_URL,
    (data) => {
      if (data.type !== 'physicsState') dbg('WebSocket message received:', data.type || data);
      handleWebSocketMessage(data,
        (username, message, tags) => {
          dbg('Chat message from:', username, ':', message);
          if (!userSkinCache.has(username.toLowerCase())) {
            fetchUserSkin(username, userSkinCache).then(() => {});
          }
        },
        (cmd, data) => {
          dbg('Command received:', cmd);
          if (cmd === 'clearSprites') {
            sprites.clear();
            markSpritesDirty();
            animatedMediaRenderer.clear();
          } else if (cmd === 'boom') {
            const epicenterX = data?.x || Math.random() * (W - EXPLOSION_RADIUS_BASE) + (EXPLOSION_RADIUS_BASE / 2);
            const epicenterY = data?.y ?? GROUND_Y;
            const explosionRadius = data?.radius || EXPLOSION_RADIUS_BASE + Math.random() * EXPLOSION_RADIUS_VAR;
            createExplosionEffect(epicenterX, epicenterY, explosionRadius, explosionParticles);
          }
        },
        (spriteState) => {
          syncPhysicsFromServer(spriteState.sprites);
        },
        (spriteDelta) => {
          syncSpritesDelta(spriteDelta);
        }
      );
    },
    () => {
      dbg('WebSocket connected');
    }
  );

  window._SA.connection = connection;
  window._SA.sprites = sprites;
  window._SA.skins = skins;
  window._SA.animatedMediaRenderer = animatedMediaRenderer;

  dbg('Overlay initialized successfully');

  window.addEventListener('beforeunload', () => {
    animatedMediaRenderer.destroy();
  });
})();
