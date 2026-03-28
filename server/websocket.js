const WebSocket = require('ws');
const { getUserSkinFromDB } = require('./db');

// Shared state (set by server.js via initWebSocket)
let _cfg, _db, _dbg, _wss;
let _loginUsernameIndex;

// In-memory authoritative sprite state
const serverSprites = new Map();
const serverSpawnTimes = new Map();
let serverStartTime = Date.now();
let cleanupIntervalId = null;

// Delta tracking for efficient sprite state broadcasts
let spriteSnapshot = new Map();
let spriteDirty = true;

// Command cooldown tracking (two-level Map)
const commandCooldowns = new Map();

// Hard limit safeguard
const MAX_SERVER_SPRITES_HARD_LIMIT = 2000;

// Cached overlay config
let _overlayConfigCache = null;

function getOverlayConfig() {
  if (!_overlayConfigCache) {
    const ov = _cfg.overlay || {};
    _overlayConfigCache = {
      MAX_SPRITES: ov.maxSprites || 1500,
      MAX_SPAWN_QUANTITY: ov.maxSpawnQuantity || 100,
      SPAWN_THROTTLE_MS: ov.spawnThrottleMs || 700,
      GROUND_Y: ov.groundY || 920,
      W: ov.canvasWidth || 1920,
      flipDurationMs: ov.flipDurationMs || 5000,
      fightDurationMs: ov.fightDurationMs || 10000
    };
  }
  return _overlayConfigCache;
}

function invalidateOverlayConfigCache() {
  _overlayConfigCache = null;
}

// Serialize a sprite for comparison/transmission
function serializeSprite(sprite) {
  return {
    id: sprite.id,
    username: sprite.username,
    skin: sprite.skin,
    state: sprite.state || 'idle',
    createdAt: sprite.createdAt,
    lastActivity: sprite.lastActivity
  };
}

function broadcast(obj) {
  const s = JSON.stringify(obj);
  _wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(s); });
}

// Broadcast delta sprite state (only changes) to all connected clients
function broadcastSpriteState() {
  if (!spriteDirty) return;
  spriteDirty = false;

  const currentIds = new Set();
  const added = [];
  const updated = [];
  const toRemoveFromSnapshot = [];

  for (const [id, sprite] of serverSprites) {
    currentIds.add(id);
    const serialized = serializeSprite(sprite);
    const prev = spriteSnapshot.get(id);
    if (!prev) {
      added.push(serialized);
      spriteSnapshot.set(id, serialized);
    } else if (prev.skin !== serialized.skin || prev.state !== serialized.state || prev.lastActivity !== serialized.lastActivity) {
      updated.push(serialized);
      prev.skin = serialized.skin;
      prev.state = serialized.state;
      prev.lastActivity = serialized.lastActivity;
    }
  }

  const removed = [];
  for (const id of spriteSnapshot.keys()) {
    if (!currentIds.has(id)) {
      removed.push(id);
      toRemoveFromSnapshot.push(id);
    }
  }

  for (const id of toRemoveFromSnapshot) {
    spriteSnapshot.delete(id);
  }

  if (added.length === 0 && updated.length === 0 && removed.length === 0) return;

  const msg = JSON.stringify({
    type: 'spriteDelta',
    added,
    updated,
    removed,
    timestamp: Date.now()
  });

  _wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

// Send full sprite state to a specific client (for initial sync)
function sendSpriteStateToClient(ws) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const spriteArray = Array.from(serverSprites.values()).map(serializeSprite);
  ws.send(JSON.stringify({
    type: 'spriteState',
    sprites: spriteArray,
    timestamp: Date.now()
  }));
}

// Clear all server-side sprites
function clearServerSprites() {
  serverSprites.clear();
  serverSpawnTimes.clear();
  spriteSnapshot.clear();
  _loginUsernameIndex.clear();
  spriteDirty = true;
  broadcastSpriteState();
}

// Spawn helper for server commands
function spawnServerSprite(name, skinId, now, stateChangedRef) {
  const uniqueId = name.toLowerCase();
  const ov = getOverlayConfig();

  if (serverSprites.has(uniqueId)) {
    const sprite = serverSprites.get(uniqueId);
    sprite.lastActivity = now;
    if (sprite.skin !== skinId) sprite.skin = skinId;
    return sprite;
  }

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

  const newSprite = {
    id: uniqueId,
    username: name,
    skin: skinId,
    state: 'idle',
    createdAt: now,
    lastActivity: now
  };
  serverSprites.set(uniqueId, newSprite);
  stateChangedRef.value = true;
  return newSprite;
}

// Update server-side sprite state (called when user sends chat message)
function updateServerSprite(username, tags) {
  const userId = username.toLowerCase();
  const skin = getUserSkinFromDB(userId);
  const loginUsername = tags && tags['username'] ? tags['username'].toLowerCase() : null;

  if (serverSprites.has(userId)) {
    const sprite = serverSprites.get(userId);
    sprite.lastActivity = Date.now();
    if (sprite.skin !== skin) sprite.skin = skin;
    if (loginUsername !== null) {
      sprite.loginUsername = loginUsername;
      _loginUsernameIndex.set(loginUsername, userId);
      _dbg('Set loginUsername for', userId, ':', loginUsername);
    }
  } else {
    serverSprites.set(userId, {
      id: userId,
      username: username,
      skin: skin,
      state: 'idle',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      loginUsername: loginUsername
    });
    if (loginUsername !== null) {
      _loginUsernameIndex.set(loginUsername, userId);
      _dbg('Created sprite with loginUsername:', userId, ':', loginUsername);
    }
  }

  spriteDirty = true;
  broadcastSpriteState();
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

// Initialize WebSocket server and handlers
function initWebSocket(server, cfg, db, dbg, loginUsernameIndex) {
  _cfg = cfg;
  _db = db;
  _dbg = dbg;
  _loginUsernameIndex = loginUsernameIndex;
  serverStartTime = Date.now();

  _wss = new WebSocket.Server({ server });

  _wss.on('connection', (ws) => {
    dbg('WebSocket client connected');
    sendSpriteStateToClient(ws);
    ws.send(JSON.stringify({ type: 'config', data: cfg }));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'cmd' && msg.cmd === 'clearSprites') {
          dbg('clearSprites command received from client');
          clearServerSprites();
        } else if (msg.type === 'spriteUpdate') {
          dbg('spriteUpdate received from client:', msg);
          const spriteId = msg.id;
          const username = msg.username;
          const skin = msg.skin || 'default';
          const state = msg.state || 'idle';
          const now = Date.now();
          const clientCreatedAt = msg.createdAt || now;

          if (clientCreatedAt < serverStartTime) {
            dbg('Ignoring stale spriteUpdate from client:', spriteId);
            broadcastSpriteState();
            return;
          }

          if (serverSprites.has(spriteId)) {
            const sprite = serverSprites.get(spriteId);
            sprite.lastActivity = now;
            if (sprite.skin !== skin) sprite.skin = skin;
            if (sprite.state !== state) sprite.state = state;
          } else {
            serverSprites.set(spriteId, {
              id: spriteId,
              username: username,
              skin: skin,
              state: state,
              createdAt: clientCreatedAt,
              lastActivity: now
            });
          }

          spriteDirty = true;
          broadcastSpriteState();
        } else if (msg.type === 'fullState') {
          const spritesArray = msg.sprites || [];
          dbg('fullState received from client:', spritesArray.length, 'sprites');
          const now = Date.now();
          let changed = false;

          for (const clientSprite of spritesArray) {
            const spriteId = clientSprite.id;
            const skin = clientSprite.skin || 'default';
            const state = clientSprite.state || 'idle';
            const clientCreatedAt = clientSprite.createdAt || now;

            if (clientCreatedAt < serverStartTime) {
              dbg('Ignoring stale sprite from client:', spriteId);
              continue;
            }

            if (serverSprites.has(spriteId)) {
              const sprite = serverSprites.get(spriteId);
              sprite.lastActivity = now;
              if (sprite.skin !== skin) { sprite.skin = skin; changed = true; }
              if (sprite.state !== state) { sprite.state = state; changed = true; }
            } else {
              serverSprites.set(spriteId, {
                id: spriteId,
                username: clientSprite.username,
                skin: skin,
                state: state,
                createdAt: clientCreatedAt,
                lastActivity: now
              });
              changed = true;
            }
          }

          if (changed) {
            spriteDirty = true;
            broadcastSpriteState();
          }
        }
      } catch (e) {
        dbg('WebSocket message parse error:', e);
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
      dbg('Cleaned up old sprites');
      spriteDirty = true;
      broadcastSpriteState();
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

  return _wss;
}

function getWss() {
  return _wss;
}

function cleanup() {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

module.exports = {
  initWebSocket,
  getWss,
  broadcast,
  broadcastSpriteState,
  sendSpriteStateToClient,
  clearServerSprites,
  spawnServerSprite,
  updateServerSprite,
  resolveSpriteId,
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
