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
let broadcastIntervalId = null;

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
      flipDurationMs: ov.flipDurationMs ?? d.flipDurationMs,
      fightDurationMs: ov.fightDurationMs ?? d.fightDurationMs
    };
  }
  return _overlayConfigCache;
}

function invalidateOverlayConfigCache() {
  _overlayConfigCache = null;
  cachedOv = null;
}

function broadcast(obj) {
  const s = JSON.stringify(obj);
  _wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(s); });
}

// Broadcast full physics state to all clients (~20Hz)
function broadcastPhysicsState() {
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
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

// Send full state to a specific client (for initial sync)
function sendFullStateToClient(ws) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const sprites = [];
  for (const sprite of serverSprites.values()) {
    sprites.push(physics.serializeSpritePhysics(sprite));
  }
  ws.send(JSON.stringify({
    type: 'physicsState',
    sprites,
    timestamp: Date.now()
  }));
}

// Clear all server-side sprites
function clearServerSprites() {
  serverSprites.clear();
  serverSpawnTimes.clear();
  spriteSnapshot.clear();
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
    let oldestId = null;
    let oldestTime = Infinity;
    for (const [id, s] of serverSprites) {
      if (s.createdAt < oldestTime) {
        oldestTime = s.createdAt;
        oldestId = id;
      }
    }
    if (oldestId) {
      const evicted = serverSprites.get(oldestId);
      if (evicted?.loginUsername) _loginUsernameIndex.delete(evicted.loginUsername);
      serverSprites.delete(oldestId);
    }
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
function updateServerSprite(username, tags) {
  const userId = username.toLowerCase();
  const skin = getUserSkinFromDB(userId);
  const loginUsername = tags && tags['username'] ? tags['username'].toLowerCase() : null;
  const now = Date.now();
  const ov = getOverlayConfig();

  if (serverSprites.has(userId)) {
    const sprite = serverSprites.get(userId);
    sprite.lastActivity = now;
    if (sprite.skin !== skin) sprite.skin = skin;
    if (loginUsername !== null) {
      sprite.loginUsername = loginUsername;
      _loginUsernameIndex.set(loginUsername, userId);
    }
  } else {
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
  let accumulator = 0;

  function tick() {
    const now = Date.now();
    const elapsed = now - lastTime;
    lastTime = now;
    accumulator += elapsed;

    // Cap accumulator to prevent spiral of death
    if (accumulator > 200) accumulator = 200;

    while (accumulator >= FRAME_MS) {
      const dt = FRAME_MS / 1000;
      const ov = getGameLoopConfig();
      const spriteArray = getServerSpriteArray();

      if (spriteArray.length > 0) {
        // Filter out dragged sprites — they're positioned by the client, not physics
        const physicsSprites = spriteArray.filter(s => !draggedSprites.has(s.id));
        if (physicsSprites.length > 0) {
          physics.updatePhysics(dt, physicsSprites, ov.W, ov.H, ov.GROUND_Y,
            ov.GRAVITY, ov.AIR_RESISTANCE, ov.GROUND_FRICTION,
            ov.BOUNCE_DAMPING, ov.MIN_VELOCITY);
        }

        physics.manageLifetime(serverSprites, spriteArray, ov.SPRITE_LIFETIME_MS, ov.FADE_WARNING_MS, now);

        // Check fight collisions
        for (const sprite of spriteArray) {
          if (sprite._fightTarget) {
            const target = serverSprites.get(sprite._fightTarget);
            if (target) {
              const dx = sprite.x - target.x;
              const dy = sprite.y - target.y;
              const distSq = dx * dx + dy * dy;
              const collisionDist = (sprite.collisionRadius || sprite.size / 2) + (target.collisionRadius || target.size / 2);
              if (distSq < collisionDist * collisionDist) {
                const loser = sprite.id < target._fightTarget ? target : sprite;
                const winner = sprite.id < target._fightTarget ? sprite : target;
                loser.flipUntil = now + (ov.fightDurationMs || 10000);
                loser.angularVelocity = (Math.random() > 0.5 ? 1 : -1) * physics.FLIP_ANGULAR_VELOCITY;
                loser.lastTiltTime = null;
                loser.vx = 0;
                loser.vy = 0;
                loser.isExhausted = true;
                loser.isFighting = false;
                delete loser._fightTarget;

                winner.vx += (Math.random() - 0.5) * 8;
                winner.vy -= 4;
                winner.isFighting = false;
                delete winner._fightTarget;

                const midX = (sprite.x + target.x) / 2;
                broadcast({ type: 'cmd', cmd: 'boom', x: midX, y: ov.GROUND_Y, radius: 200 + Math.random() * 100 });
              }
            } else {
              sprite.isFighting = false;
              delete sprite._fightTarget;
            }
          }
        }
      }

      accumulator -= FRAME_MS;
    }

    gameLoopIntervalId = setTimeout(tick, 1);
  }

  gameLoopIntervalId = setTimeout(tick, FRAME_MS);

  // Broadcast physics state at 60Hz (every ~16ms)
  broadcastIntervalId = setInterval(() => {
    broadcastPhysicsState();
  }, 16);
}

// ── Initialize WebSocket ──────────────────────────────────────────────────

function initWebSocket(server, cfg, db, dbg, loginUsernameIndex) {
  _cfg = cfg;
  _db = db;
  _dbg = dbg;
  _loginUsernameIndex = loginUsernameIndex;
  serverStartTime = Date.now();

  _wss = new WebSocket.Server({ server });

  _wss.on('connection', (ws) => {
    dbg('WebSocket client connected');
    sendFullStateToClient(ws);
    ws.send(JSON.stringify({ type: 'config', data: cfg }));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);

        if (msg.type === 'cmd' && msg.cmd === 'clearSprites') {
          dbg('clearSprites command received from client');
          clearServerSprites();
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

// Handle drag messages from clients
function handleDragMessage(msg, ws) {
  const sprite = serverSprites.get(msg.spriteId);
  if (!sprite) return;

  if (msg.type === 'dragStart') {
    draggedSprites.add(msg.spriteId);
    dragOwners.set(msg.spriteId, ws);
  } else if (msg.type === 'dragMove') {
    sprite.x = msg.x;
    sprite.y = msg.y;
    sprite.vx = 0;
    sprite.vy = 0;
    draggedSprites.add(msg.spriteId);
    dragOwners.set(msg.spriteId, ws);
  } else if (msg.type === 'dragEnd') {
    draggedSprites.delete(msg.spriteId);
    dragOwners.delete(msg.spriteId);
    sprite.x = msg.x;
    sprite.y = msg.y;
    sprite.vx = msg.vx || 0;
    sprite.vy = msg.vy || 0;
  }
}

// Handle command effects on server sprites (jump, boom, flip, fight)
function handleServerCommand(cmd, data) {
  const ov = getOverlayConfig();

  if (cmd === 'jump' && data?.username) {
    const sprite = serverSprites.get(data.username.toLowerCase());
    if (sprite) {
      sprite.vy = physics.JUMP_VELOCITY;
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
      sprite.angularVelocity = (Math.random() > 0.5 ? 1 : -1) * physics.FLIP_ANGULAR_VELOCITY;
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

      winnerSprite._fightTarget = loserId;
      loserSprite._fightTarget = winnerId;
    }
  }
}

function getWss() {
  return _wss;
}

function cleanup() {
  if (cleanupIntervalId) { clearInterval(cleanupIntervalId); cleanupIntervalId = null; }
  if (gameLoopIntervalId) { clearInterval(gameLoopIntervalId); gameLoopIntervalId = null; }
  if (broadcastIntervalId) { clearInterval(broadcastIntervalId); broadcastIntervalId = null; }
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
