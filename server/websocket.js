const WebSocket = require('ws');
const { getUserSkinFromDB } = require('./db');
const physics = require('./physics');
const { DEFAULT_OVERLAY } = require('./config');

// Shared state (set by server.js via initWebSocket)
let _cfg, _db, _dbg, _wss;
let _loginUsernameIndex;

// In-memory authoritative sprite state with FULL physics data
const serverSprites = new Map(); // id -> sprite with physics state
const serverSpawnTimes = new Map();
let serverStartTime = Date.now();
let cleanupIntervalId = null;
let gameLoopIntervalId = null;
let heartbeatIntervalId = null;

// Delta tracking for efficient sprite state broadcasts
let spriteSnapshot = new Map();
let spriteDirty = true;

// Command cooldown tracking (two-level Map)
const commandCooldowns = new Map();

// Hard limit safeguard
const MAX_SERVER_SPRITES_HARD_LIMIT = 2000;

// Cached overlay config
let _overlayConfigCache = null;
let cachedOv = null;

// Drag tracking (declared early so game loop can reference)
const draggedSprites = new Set();
const dragOwners = new Map();

function getOverlayConfig() {
  if (!_overlayConfigCache) {
    const ov = _cfg.overlay || {};
    const d = DEFAULT_OVERLAY;
    _overlayConfigCache = {
      MAX_SPRITES: ov.maxSprites ?? d.maxSprites,
      MAX_SPAWN_QUANTITY: ov.maxSpawnQuantity ?? d.maxSpawnQuantity,
      SPAWN_THROTTLE_MS: ov.spawnThrottleMs ?? d.spawnThrottleMs,
      GROUND_Y: ov.groundY ?? d.groundY,
      W: ov.canvasWidth ?? d.canvasWidth,
      H: ov.canvasHeight ?? d.canvasHeight,
      GRAVITY: ov.gravity ?? d.gravity,
      AIR_RESISTANCE: ov.airResistance ?? d.airResistance,
      GROUND_FRICTION: ov.groundFriction ?? d.groundFriction,
      BOUNCE_DAMPING: ov.bounceDamping ?? d.bounceDamping,
      MIN_VELOCITY: ov.minVelocity ?? d.minVelocity,
      SPRITE_SIZE_MIN: ov.spriteSizeMin ?? d.spriteSizeMin,
      SPRITE_SIZE_MAX: ov.spriteSizeMax ?? d.spriteSizeMax,
      SPRITE_LIFETIME_MS: ov.spriteLifetimeMs ?? d.spriteLifetimeMs,
      FADE_WARNING_MS: ov.fadeWarningMs ?? d.fadeWarningMs,
      COLLISION_PERSONAL_SPACE_THRESHOLD: ov.collisionPersonalSpaceThreshold ?? d.collisionPersonalSpaceThreshold,
      EXPLOSION_FORCE_MULTIPLIER: ov.explosionForceMultiplier ?? d.explosionForceMultiplier,
      EXPLOSION_RADIUS_BASE: ov.explosionRadiusBase ?? d.explosionRadiusBase,
      EXPLOSION_RADIUS_VAR: ov.explosionRadiusVar ?? d.explosionRadiusVar,
      EXPLOSION_UPWARD_BIAS: ov.explosionUpwardBias ?? d.explosionUpwardBias,
      SPIN_STRENGTH_FACTOR: ov.spinStrengthFactor ?? d.spinStrengthFactor,
      RANDOM_JITTER_FACTOR: ov.randomJitterFactor ?? d.randomJitterFactor,
      JUMP_VELOCITY: ov.jumpVelocity ?? d.jumpVelocity,
      FLIP_ANGULAR_VELOCITY: ov.flipAngularVelocity ?? d.flipAngularVelocity,
      HEIGHT_SCALE_SIT: ov.heightScaleSit ?? d.heightScaleSit,
      HEIGHT_SCALE_IDLE: ov.heightScaleIdle ?? d.heightScaleIdle,
      FIGHT_COIN_FLIP_PROBABILITY: ov.fightCoinFlipProbability ?? d.fightCoinFlipProbability,
      NETWORK_FPS: ov.networkFps ?? d.networkFps,
      flipDurationMs: ov.flipDurationMs ?? d.flipDurationMs,
      fightDurationMs: ov.fightDurationMs ?? d.fightDurationMs
    };
    physics.setPhysicsConfig(ov);
  }
  return _overlayConfigCache;
}

function invalidateOverlayConfigCache() {
  _overlayConfigCache = null;
  cachedOv = null;
}

function broadcast(obj) {
  if (!_wss) return;
  const s = JSON.stringify(obj);
  _wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      try { c.send(s); } catch (e) { /* client disconnected mid-send */ }
    }
  });
}

// Broadcast full physics state to all clients
function broadcastPhysicsState() {
  if (!_wss || _wss.clients.size === 0) return;
  let hasOverlayClient = false;
  for (const client of _wss.clients) {
    if (client.clientType !== 'dashboard') { hasOverlayClient = true; break; }
  }
  if (!hasOverlayClient) return;

  const sprites = [];
  for (const sprite of serverSprites.values()) {
    sprites.push(physics.serializeSpritePhysics(sprite));
  }

  const msg = JSON.stringify({
    type: 'physicsState',
    sprites,
    timestamp: Date.now()
  });

  _wss.clients.forEach(c => {
    if (c.clientType === 'dashboard') return;
    if (c.readyState === WebSocket.OPEN) {
      try { c.send(msg); } catch (e) { /* client disconnected mid-send */ }
    }
  });
}

// Send full state to a specific client (for initial sync)
function sendFullStateToClient(ws) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const sprites = [];
  for (const sprite of serverSprites.values()) {
    sprites.push(physics.serializeSpritePhysics(sprite));
  }
  try {
    ws.send(JSON.stringify({
      type: 'physicsState',
      sprites,
      timestamp: Date.now()
    }));
  } catch (e) {
    // Client closed during initial state delivery.
  }
}

// Remove the oldest sprite so a new one can be created within the configured limit.
function evictOldestSprite() {
  let oldestId = null;
  let oldestTime = Infinity;
  for (const [id, s] of serverSprites) {
    if (s.createdAt < oldestTime) {
      oldestTime = s.createdAt;
      oldestId = id;
    }
  }
  if (!oldestId) return false;

  const evicted = serverSprites.get(oldestId);
  if (evicted?.loginUsername && _loginUsernameIndex) {
    _loginUsernameIndex.delete(evicted.loginUsername);
  }
  draggedSprites.delete(oldestId);
  dragOwners.delete(oldestId);
  serverSprites.delete(oldestId);
  return true;
}

// Clear all server-side sprites
function clearServerSprites() {
  serverSprites.clear();
  serverSpawnTimes.clear();
  spriteSnapshot.clear();
  draggedSprites.clear();
  dragOwners.clear();
  if (_loginUsernameIndex) _loginUsernameIndex.clear();
  spriteDirty = true;
  markServerSpriteArrayDirty();
  broadcastPhysicsState();
}

// Spawn a sprite on the server with full physics state
function spawnServerSprite(name, skinId, now, stateChangedRef) {
  const uniqueId = name.toLowerCase();
  const ov = getOverlayConfig();

  if (serverSprites.has(uniqueId)) {
    const sprite = serverSprites.get(uniqueId);
    sprite.lastActivity = now;
    if (sprite.skin !== skinId) sprite.skin = skinId;
    return sprite;
  }

  // Evict oldest if at limit
  if (serverSprites.size >= ov.MAX_SPRITES) {
    evictOldestSprite();
  }

  if (serverSprites.size >= MAX_SERVER_SPRITES_HARD_LIMIT) {
    _dbg('Hard limit reached, cannot spawn more sprites');
    return null;
  }

  // Create sprite with deterministic physics properties
  const newSprite = physics.createServerSprite(name, ov.W, ov.GROUND_Y, ov.SPRITE_SIZE_MIN, ov.SPRITE_SIZE_MAX);
  newSprite.skin = skinId;
  newSprite.lastActivity = now;
  serverSprites.set(uniqueId, newSprite);
  if (stateChangedRef) stateChangedRef.value = true;
  spriteDirty = true;
  markServerSpriteArrayDirty();
  return newSprite;
}

// Update server-side sprite state (called when user sends chat message)
async function updateServerSprite(username, tags) {
  const userId = username.toLowerCase();
  const skin = await getUserSkinFromDB(userId);
  const loginUsername = tags && tags['username'] ? tags['username'].toLowerCase() : null;
  const now = Date.now();
  const ov = getOverlayConfig();

  if (serverSprites.has(userId)) {
    const sprite = serverSprites.get(userId);
    sprite.lastActivity = now;
    if (sprite.skin !== skin) sprite.skin = skin;
    if (loginUsername !== null) {
      if (sprite.loginUsername && sprite.loginUsername !== loginUsername && _loginUsernameIndex) {
        _loginUsernameIndex.delete(sprite.loginUsername);
      }
      sprite.loginUsername = loginUsername;
      _loginUsernameIndex.set(loginUsername, userId);
    }
  } else {
    // Apply the same configured limit to sprites created by chat activity.
    if (serverSprites.size >= ov.MAX_SPRITES) {
      evictOldestSprite();
    }
    if (serverSprites.size >= MAX_SERVER_SPRITES_HARD_LIMIT) {
      _dbg('Hard limit reached, cannot spawn more sprites');
      return null;
    }

    // Create new sprite with full physics
    const newSprite = physics.createServerSprite(username, ov.W, ov.GROUND_Y, ov.SPRITE_SIZE_MIN, ov.SPRITE_SIZE_MAX);
    newSprite.skin = skin;
    newSprite.lastActivity = now;
    newSprite.loginUsername = loginUsername;
    serverSprites.set(userId, newSprite);
    if (loginUsername !== null) {
      _loginUsernameIndex.set(loginUsername, userId);
    }
    markServerSpriteArrayDirty();
  }

  spriteDirty = true;
  return serverSprites.get(userId);
}

// Resolve a username to the actual sprite ID (O(1) lookup)
function resolveSpriteId(targetUser) {
  if (serverSprites.has(targetUser)) return targetUser;
  return _loginUsernameIndex.get(targetUser) || null;
}

// Stats broadcasting
let _broadcastStatsFn = null;

function setBroadcastStatsFn(fn) {
  _broadcastStatsFn = fn;
}

// ── Server Game Loop ──────────────────────────────────────────────────────

// Pre-allocated sprite array (rebuilt only when sprites change)
let cachedSpriteArray = [];
let spriteArrayDirty = true;

function markServerSpriteArrayDirty() {
  spriteArrayDirty = true;
}

function getServerSpriteArray() {
  if (spriteArrayDirty || cachedSpriteArray.length !== serverSprites.size) {
    cachedSpriteArray.length = 0;
    for (const s of serverSprites.values()) {
      cachedSpriteArray.push(s);
    }
    spriteArrayDirty = false;
  }
  return cachedSpriteArray;
}

function getGameLoopConfig() {
  if (!cachedOv) cachedOv = getOverlayConfig();
  return cachedOv;
}

function startGameLoop() {
  const TARGET_FPS = 60;
  const FRAME_MS = 1000 / TARGET_FPS;
  let lastTime = Date.now();
  let lastBroadcastTime = 0;
  let accumulator = 0;

  function tick() {
    const tickStart = Date.now();
    const elapsed = Math.max(0, tickStart - lastTime);
    lastTime = tickStart;
    accumulator += elapsed;

    // Cap accumulator to prevent spiral of death
    if (accumulator > 200) accumulator = 200;

    while (accumulator >= FRAME_MS) {
      const now = tickStart;
      const dt = FRAME_MS / 1000;
      const ov = getGameLoopConfig();
      const spriteArray = getServerSpriteArray();

      if (spriteArray.length > 0) {
        // Filter out dragged sprites — they're positioned by the client, not physics
        const physicsSprites = draggedSprites.size > 0
          ? spriteArray.filter(s => !draggedSprites.has(s.id))
          : spriteArray;
        if (physicsSprites.length > 0) {
          physics.updatePhysics(dt, physicsSprites, ov.W, ov.H, ov.GROUND_Y,
            ov.GRAVITY, ov.AIR_RESISTANCE, ov.GROUND_FRICTION,
            ov.BOUNCE_DAMPING, ov.MIN_VELOCITY);
        }

        physics.manageLifetime(serverSprites, spriteArray, ov.SPRITE_LIFETIME_MS, ov.FADE_WARNING_MS, now, (removed) => {
          if (removed.loginUsername && _loginUsernameIndex) {
            _loginUsernameIndex.delete(removed.loginUsername);
          }
          draggedSprites.delete(removed.id);
          dragOwners.delete(removed.id);
          spriteDirty = true;
          markServerSpriteArrayDirty();
        });

        // Check fight collisions
        for (const sprite of spriteArray) {
          if (!sprite._fightTarget) continue;
          if (!serverSprites.has(sprite.id)) continue;

          // Abandon fights that never connected before their deadline.
          if (sprite._fightUntil && now > sprite._fightUntil) {
            sprite.isFighting = false;
            delete sprite._fightTarget;
            delete sprite._fightLoser;
            delete sprite._fightUntil;
            continue;
          }

          const target = serverSprites.get(sprite._fightTarget);
          if (!target || target._fightTarget !== sprite.id) {
            sprite.isFighting = false;
            delete sprite._fightTarget;
            delete sprite._fightLoser;
            delete sprite._fightUntil;
            continue;
          }

          // Handle each pair exactly once, regardless of which sprite is visited first.
          if (sprite.id > target.id) continue;

          const dx = sprite.x - target.x;
          const dy = sprite.y - target.y;
          const distSq = dx * dx + dy * dy;
          const collisionDist = (sprite.collisionRadius || sprite.size / 2) + (target.collisionRadius || target.size / 2);
          if (distSq >= collisionDist * collisionDist) continue;

          // The command that started the fight already chose the loser. Fall back
          // to a fair coin flip only if that information is unavailable.
          let loser = sprite._fightLoser ? sprite : (target._fightLoser ? target : null);
          if (!loser) loser = Math.random() < 0.5 ? sprite : target;
          const winner = loser === sprite ? target : sprite;

          loser.flipUntil = now + (ov.fightDurationMs || 10000);
          loser.angularVelocity = (Math.random() > 0.5 ? 1 : -1) * (ov.FLIP_ANGULAR_VELOCITY || physics.FLIP_ANGULAR_VELOCITY);
          loser.lastTiltTime = null;
          loser.vx = 0;
          loser.vy = 0;
          loser.isExhausted = true;
          loser.isFighting = false;
          delete loser._fightTarget;
          delete loser._fightLoser;
          delete loser._fightUntil;

          winner.vx += (Math.random() - 0.5) * 8;
          winner.vy -= 4;
          winner.isFighting = false;
          delete winner._fightTarget;
          delete winner._fightLoser;
          delete winner._fightUntil;

          const midX = (sprite.x + target.x) / 2;
          broadcast({ type: 'cmd', cmd: 'boom', x: midX, y: ov.GROUND_Y, radius: 200 + Math.random() * 100 });
        }
      }

      accumulator -= FRAME_MS;
    }

    // Network snapshots are sent on their own cadence (default 30 Hz).
    // Clients interpolate between snapshots, so this halves bandwidth
    // without reducing simulation or rendering smoothness.
    const ov = getGameLoopConfig();
    const configuredFps = Number.isFinite(ov.NETWORK_FPS) ? ov.NETWORK_FPS : 30;
    const networkFps = Math.min(60, Math.max(1, configuredFps));
    if (tickStart - lastBroadcastTime >= (1000 / networkFps)) {
      lastBroadcastTime = tickStart;
      broadcastPhysicsState();
    }

    // Sleep only until the next simulation frame instead of polling every 1 ms.
    const processingTime = Date.now() - tickStart;
    gameLoopIntervalId = setTimeout(tick, Math.max(1, Math.ceil(FRAME_MS - processingTime)));
  }

  gameLoopIntervalId = setTimeout(tick, FRAME_MS);
}

// ── Initialize WebSocket ──────────────────────────────────────────────────

function initWebSocket(server, cfg, db, dbg, loginUsernameIndex) {
  _cfg = cfg;
  _db = db;
  _dbg = dbg;
  _loginUsernameIndex = loginUsernameIndex;
  serverStartTime = Date.now();

  _wss = new WebSocket.Server({ server, maxPayload: 64 * 1024 });

  _wss.on('connection', (ws) => {
    dbg('WebSocket client connected');
    ws.isAlive = true;
    ws.clientType = 'overlay';
    ws.on('pong', () => { ws.isAlive = true; });
    sendFullStateToClient(ws);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);

        // Clients may only manipulate drag state. Administrative commands
        // (clearing sprites, reloading overlays) are REST/authenticated only.
        if (msg.type === 'identify') {
          ws.clientType = msg.clientType === 'dashboard' ? 'dashboard' : 'overlay';
        } else if (msg.type === 'dragStart' || msg.type === 'dragMove' || msg.type === 'dragEnd') {
          handleDragMessage(msg, ws);
        } else if (msg.type === 'fullState') {
          dbg('fullState received from client (server is authoritative, ignoring physics data)');
        }
      } catch (e) {
        dbg('WebSocket message parse error:', e);
      }
    });

    ws.on('close', () => {
      const toRelease = [];
      for (const [spriteId, owner] of dragOwners) {
        if (owner === ws) toRelease.push(spriteId);
      }
      for (const id of toRelease) {
        draggedSprites.delete(id);
        dragOwners.delete(id);
      }
    });
  });

  // Drop dead sockets so broadcasts do not accumulate stale clients.
  heartbeatIntervalId = setInterval(() => {
    if (!_wss) return;
    _wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch (e) { /* socket already closing */ }
    });
  }, 30000);

  // Periodic cleanup of stale sprites (every minute)
  cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    const lifetime = (_cfg.overlay && _cfg.overlay.spriteLifetimeMs) || 30 * 60 * 1000;
    let changed = false;
    for (const [id, sprite] of serverSprites) {
      if (now - sprite.lastActivity > lifetime) {
        if (sprite.loginUsername) _loginUsernameIndex.delete(sprite.loginUsername);
        serverSprites.delete(id);
        changed = true;
      }
    }
    if (changed) {
      spriteDirty = true;
      markServerSpriteArrayDirty();
    }

    // Prune expired command cooldowns
    const cooldownMs = (_cfg.overlay && _cfg.overlay.commandCooldownMs) || 5000;
    const cooldownExpiry = cooldownMs * 2;
    for (const [userId, userCooldowns] of commandCooldowns) {
      for (const [cmd, timestamp] of userCooldowns) {
        if (now - timestamp > cooldownExpiry) {
          userCooldowns.delete(cmd);
        }
      }
      if (userCooldowns.size === 0) {
        commandCooldowns.delete(userId);
      }
    }

    // Prune stale spawn times
    for (const [key, timestamp] of serverSpawnTimes) {
      if (now - timestamp > lifetime) {
        serverSpawnTimes.delete(key);
      }
    }

    // Broadcast stats
    if (_broadcastStatsFn) _broadcastStatsFn();
  }, 60 * 1000);

  // Start the server game loop
  startGameLoop();

  return _wss;
}

const MAX_DRAG_SPEED = 60;

function finiteOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Handle drag messages from clients
function handleDragMessage(msg, ws) {
  if (!msg || typeof msg.spriteId !== 'string') return;
  const sprite = serverSprites.get(msg.spriteId);
  if (!sprite) return;

  const ov = getOverlayConfig();
  const currentOwner = dragOwners.get(msg.spriteId);

  if (msg.type === 'dragStart') {
    if (currentOwner && currentOwner !== ws) return;
    draggedSprites.add(msg.spriteId);
    dragOwners.set(msg.spriteId, ws);
    sprite.lastActivity = Date.now();
    return;
  }

  // Only the client that started the drag may move or release it.
  if (currentOwner !== ws) return;

  const x = clamp(finiteOr(msg.x, sprite.x), 0, ov.W);
  const y = clamp(finiteOr(msg.y, sprite.y), 0, ov.H);

  sprite.lastActivity = Date.now();

  if (msg.type === 'dragMove') {
    sprite.x = x;
    sprite.y = y;
    sprite.vx = 0;
    sprite.vy = 0;
  } else if (msg.type === 'dragEnd') {
    draggedSprites.delete(msg.spriteId);
    dragOwners.delete(msg.spriteId);
    sprite.x = x;
    sprite.y = y;
    sprite.vx = clamp(finiteOr(msg.vx, 0), -MAX_DRAG_SPEED, MAX_DRAG_SPEED);
    sprite.vy = clamp(finiteOr(msg.vy, 0), -MAX_DRAG_SPEED, MAX_DRAG_SPEED);
  }
}

// Handle command effects on server sprites (jump, boom, flip, fight)
function handleServerCommand(cmd, data) {
  const ov = getOverlayConfig();

  if (cmd === 'jump' && data?.username) {
    const sprite = serverSprites.get(data.username.toLowerCase());
    if (sprite) {
      sprite.vy = ov.JUMP_VELOCITY;
      sprite.state = 'idle';
    }
  } else if (cmd === 'boom') {
    const epicenterX = Math.random() * (ov.W - ov.EXPLOSION_RADIUS_BASE) + (ov.EXPLOSION_RADIUS_BASE / 2);
    const explosionRadius = ov.EXPLOSION_RADIUS_BASE + Math.random() * ov.EXPLOSION_RADIUS_VAR;
    const spriteArray = Array.from(serverSprites.values());
    physics.applyExplosionPhysics(spriteArray, epicenterX, ov.GROUND_Y, explosionRadius,
      ov.EXPLOSION_FORCE_MULTIPLIER, ov.EXPLOSION_UPWARD_BIAS, ov.SPIN_STRENGTH_FACTOR,
      ov.RANDOM_JITTER_FACTOR, ov.COLLISION_PERSONAL_SPACE_THRESHOLD);
  } else if (cmd === 'flip' && data?.username) {
    const sprite = serverSprites.get(data.username.toLowerCase());
    if (sprite) {
      sprite.flipUntil = Date.now() + (data.duration || ov.flipDurationMs);
      sprite.angularVelocity = (Math.random() > 0.5 ? 1 : -1) * ov.FLIP_ANGULAR_VELOCITY;
      sprite.lastTiltTime = null;
    }
  } else if (cmd === 'fight' && data?.loser && data?.winner) {
    const winnerId = data.winner.toLowerCase();
    const loserId = data.loser.toLowerCase();
    const winnerSprite = serverSprites.get(winnerId);
    const loserSprite = serverSprites.get(loserId);

    if (winnerSprite && loserSprite) {
      winnerSprite.roamTargetX = loserSprite.x;
      winnerSprite.roamTargetY = ov.GROUND_Y - 50;
      winnerSprite.roamSpeed = 1.0 + Math.random() * 0.5;
      winnerSprite.roamTimer = ov.fightDurationMs;
      winnerSprite.state = 'idle';
      winnerSprite.isFighting = true;

      loserSprite.roamTargetX = winnerSprite.x;
      loserSprite.roamTargetY = ov.GROUND_Y - 50;
      loserSprite.roamSpeed = 1.0 + Math.random() * 0.5;
      loserSprite.roamTimer = ov.fightDurationMs;
      loserSprite.state = 'idle';
      loserSprite.isFighting = true;

      const fightUntil = Date.now() + (ov.fightDurationMs || 10000);
      winnerSprite._fightTarget = loserId;
      winnerSprite._fightLoser = false;
      winnerSprite._fightUntil = fightUntil;
      loserSprite._fightTarget = winnerId;
      loserSprite._fightLoser = true;
      loserSprite._fightUntil = fightUntil;
    }
  }
}

function getWss() {
  return _wss;
}

function cleanup() {
  if (cleanupIntervalId) { clearInterval(cleanupIntervalId); cleanupIntervalId = null; }
  if (gameLoopIntervalId) { clearTimeout(gameLoopIntervalId); gameLoopIntervalId = null; }
  if (heartbeatIntervalId) { clearInterval(heartbeatIntervalId); heartbeatIntervalId = null; }
}

module.exports = {
  initWebSocket,
  getWss,
  broadcast,
  broadcastPhysicsState,
  sendFullStateToClient,
  clearServerSprites,
  spawnServerSprite,
  updateServerSprite,
  resolveSpriteId,
  handleServerCommand,
  getOverlayConfig,
  invalidateOverlayConfigCache,
  setBroadcastStatsFn,
  cleanup,
  serverSprites,
  serverSpawnTimes,
  commandCooldowns,
  spriteDirty: () => spriteDirty,
  setSpriteDirty: (v) => { spriteDirty = v; }
};
