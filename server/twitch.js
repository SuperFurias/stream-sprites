const tmi = require('tmi.js');
const axios = require('axios');
const fs = require('fs');
const { FilteredLogger } = require('./lib/logger');
const { hasModPermission } = require('./lib/util');
const { getUserSkinFromDB } = require('./db');
const ws = require('./websocket');
const physics = require('./physics');

// Shared state
let _cfg, _cfgPath, _dbg, _db;
let twitchClient = null;
let botTokenInfo = null;
let reconnectTimeout = null;
let tokenRefreshIntervalId = null;

// Skin detection
let skinsCache = null;
let skinsCacheTime = 0;
const SKINS_CACHE_TTL_MS = 60000;

function invalidateSkinsCache() {
  skinsCache = null;
  skinsCacheTime = 0;
}

function detectSkinsFromAssets() {
  const now = Date.now();
  if (skinsCache && (now - skinsCacheTime) < SKINS_CACHE_TTL_MS) {
    return skinsCache;
  }

  const path = require('path');
  const skinsDir = path.join(__dirname, '..', 'assets', 'skins');
  const detected = [];
  try {
    _dbg('Scanning skins directory:', skinsDir);
    if (fs.existsSync(skinsDir)) {
      const files = fs.readdirSync(skinsDir);
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (['.png', '.gif', '.jpg', '.jpeg', '.webp', '.webm'].includes(ext)) {
          const id = path.basename(file, ext).toLowerCase().replace(/[^a-z0-9_]/g, '_');
          const isGif = ['.gif'].includes(ext);
          const isWebm = ['.webm'].includes(ext);
          detected.push({
            id,
            name: path.basename(file, ext),
            file: `../assets/skins/${file}`,
            price: 0,
            autoDetected: true,
            isGif,
            isWebm
          });
        }
      });
    }
  } catch (e) {
    console.error('Error detecting skins:', e.message);
  }

  skinsCache = detected;
  skinsCacheTime = now;
  return detected;
}

// Watch skins directory for changes
function watchSkinsDir() {
  try {
    const path = require('path');
    const skinsDir = path.join(__dirname, '..', 'assets', 'skins');
    if (fs.existsSync(skinsDir)) {
      fs.watch(skinsDir, { persistent: false }, (eventType) => {
        if (eventType === 'rename' || eventType === 'change') {
          invalidateSkinsCache();
        }
      });
    }
  } catch (e) {
    // File watching not critical
  }
}

// Use nameLengthLimit from overlay config
const getNameLengthLimit = () => (_cfg.overlay && _cfg.overlay.nameLengthLimit) || 32;

// Command handlers
function handleJump(username, userId, args, tags, now, ctx) {
  // Mods/broadcasters can target another sprite: !jump spritename
  let targetId = userId;
  if (args[0] && hasModPermission(tags, username, _cfg)) {
    const targetArg = args[0].toLowerCase().replace(/^@/, '').replace(/[^\p{L}\p{N}_]/gu, '_');
    const resolved = ws.resolveSpriteId(targetArg);
    targetId = resolved || targetArg;
  }
  if (ws.serverSprites.has(targetId)) {
    const sprite = ws.serverSprites.get(targetId);
    sprite.lastActivity = now;
    sprite.vy = physics.JUMP_VELOCITY;
    sprite.state = 'idle';
    ctx.stateChanged = true;
    return null;
  }
  return targetId === userId ? 'You need to appear first!' : `Sprite '${targetId}' not found.`;
}

function handleSit(username, userId, args, tags, now, ctx) {
  let targetId = userId;
  if (args[0] && hasModPermission(tags, username, _cfg)) {
    const targetArg = args[0].toLowerCase().replace(/^@/, '').replace(/[^\p{L}\p{N}_]/gu, '_');
    const resolved = ws.resolveSpriteId(targetArg);
    targetId = resolved || targetArg;
  }
  if (ws.serverSprites.has(targetId)) {
    const sprite = ws.serverSprites.get(targetId);
    sprite.state = 'sit';
    sprite.heightScale = 0.75;
    sprite.lastActivity = now;
    ctx.stateChanged = true;
    return null;
  }
  return targetId === userId ? 'You need to appear first!' : `Sprite '${targetId}' not found.`;
}

function handleUnsit(username, userId, args, tags, now, ctx) {
  let targetId = userId;
  if (args[0] && hasModPermission(tags, username, _cfg)) {
    const targetArg = args[0].toLowerCase().replace(/^@/, '').replace(/[^\p{L}\p{N}_]/gu, '_');
    const resolved = ws.resolveSpriteId(targetArg);
    targetId = resolved || targetArg;
  }
  if (ws.serverSprites.has(targetId)) {
    const sprite = ws.serverSprites.get(targetId);
    sprite.state = 'idle';
    sprite.heightScale = 1.0;
    sprite.lastActivity = now;
    ctx.stateChanged = true;
    return null;
  }
  return targetId === userId ? 'You need to appear first!' : `Sprite '${targetId}' not found.`;
}

function handleBoom() {
  _dbg('Boom command - applying explosion on server sprites');
  const ov = ws.getOverlayConfig();
  const epicenterX = Math.random() * (ov.W - (ov.EXPLOSION_RADIUS_BASE || 400)) + ((ov.EXPLOSION_RADIUS_BASE || 400) / 2);
  const explosionRadius = (ov.EXPLOSION_RADIUS_BASE || 400) + Math.random() * (ov.EXPLOSION_RADIUS_VAR || 300);
  const spriteArray = Array.from(ws.serverSprites.values());
  const { applyExplosionPhysics } = require('./physics');
  applyExplosionPhysics(spriteArray, epicenterX, ov.GROUND_Y, explosionRadius,
    ov.EXPLOSION_FORCE_MULTIPLIER || 60, ov.EXPLOSION_UPWARD_BIAS || 0.7,
    ov.SPIN_STRENGTH_FACTOR || 0.05, ov.RANDOM_JITTER_FACTOR || 0.2,
    ov.COLLISION_PERSONAL_SPACE_THRESHOLD || 0.1);
  // Also broadcast for explosion visual effect on clients
  ws.broadcast({ type: 'cmd', cmd: 'boom', x: epicenterX, y: ov.GROUND_Y, radius: explosionRadius });
  return null;
}

function handleSkin(username, userId, args, tags, now, ctx) {
  if (!args[0]) return 'Usage: !skin <skinname>';
  const allSkins = detectSkinsFromAssets();
  const validSkin = allSkins.find(s => s.id === args[0]);
  if (!validSkin) return `Invalid skin: ${args[0]}`;
  try {
    _db.prepare('UPDATE users SET assigned_skin = ? WHERE id = ?').run(args[0], userId);
    if (ws.serverSprites.has(userId)) {
      const sprite = ws.serverSprites.get(userId);
      sprite.skin = args[0];
      sprite.lastActivity = now;
      ctx.stateChanged = true;
    }
    return `${username}'s skin changed to ${args[0]}`;
  } catch (e) {
    return 'Failed to change skin.';
  }
}

function handleSkins() {
  const skinList = detectSkinsFromAssets().map(s => s.id).sort();
  return `Available skins: ${skinList.join(', ')}`;
}

function handleSpawn(username, userId, args, tags, now, ctx) {
  if (!hasModPermission(tags, username, _cfg)) return 'Only broadcaster/mods can use !spawn';
  const ov = ws.getOverlayConfig();
  let quantity = 1;
  let targetSkin = 'default';
  let targetName = '';
  const allSkinIds = detectSkinsFromAssets().map(s => s.id);

  for (const arg of args) {
    if (/^\d+$/.test(arg)) {
      quantity = Math.min(ov.MAX_SPAWN_QUANTITY || 100, Math.max(1, parseInt(arg, 10)));
    } else if (allSkinIds.includes(arg)) {
      targetSkin = arg;
    } else if (!targetName) {
      targetName = arg.trim().replace(/^@/, '');
    }
  }

  if (!targetName) {
    targetName = 'Sprite_' + Math.random().toString(36).substring(2, 8);
  } else {
    targetName = targetName.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, getNameLengthLimit());
  }

  for (let i = 0; i < quantity; i++) {
    const uniqueName = quantity > 1 ? targetName + '_' + (i + 1) : targetName;
    ws.spawnServerSprite(uniqueName, targetSkin, now, ctx);
  }

  ctx.stateChanged = true;
  return `Spawned ${quantity} ${targetSkin === 'default' ? 'sprite' : targetSkin + ' sprite'}`;
}

function handleFlip(username, userId, args, tags, now, ctx) {
  let targetUser = args[0] ? args[0].toLowerCase().replace(/^@/, '').replace(/[^\p{L}\p{N}_]/gu, '_') : userId;
  if (targetUser !== userId) {
    const resolvedId = ws.resolveSpriteId(targetUser);
    if (resolvedId) targetUser = resolvedId;
  }
  const ov = ws.getOverlayConfig();
  const sprite = ws.serverSprites.get(targetUser);
  if (sprite) {
    sprite.flipUntil = now + (ov.flipDurationMs || 5000);
    sprite.angularVelocity = (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2);
    sprite.lastTiltTime = null;
  }
  ctx.stateChanged = true;
  return null;
}

function handleFight(username, userId, args, tags, now, ctx) {
  if (!args[0]) return 'Usage: !fight <username>';
  const targetUserArg = args[0].toLowerCase().replace(/^@/, '').replace(/[^\p{L}\p{N}_]/gu, '_');
  const targetId = ws.resolveSpriteId(targetUserArg);
  if (!targetId) return `User '${targetUserArg}' does not have a sprite.`;
  if (targetId === userId) return 'You cannot fight yourself.';
  if (!ws.serverSprites.has(userId)) return 'You need a sprite to fight. Use !spawn to create one.';

  const commandUserWins = Math.random() < 0.5;
  const winner = commandUserWins ? userId : targetId;
  const loser = commandUserWins ? targetId : userId;
  const ov = ws.getOverlayConfig();

  const winnerSprite = ws.serverSprites.get(winner);
  const loserSprite = ws.serverSprites.get(loser);
  if (winnerSprite) winnerSprite.state = 'idle';
  if (loserSprite) loserSprite.state = 'idle';

  // Apply fight on server sprites
  if (winnerSprite && loserSprite) {
    winnerSprite.roamTargetX = loserSprite.x;
    winnerSprite.roamTargetY = ov.GROUND_Y - 50;
    winnerSprite.roamSpeed = 1.0 + Math.random() * 0.5;
    winnerSprite.roamTimer = ov.fightDurationMs || 10000;
    winnerSprite.isFighting = true;
    winnerSprite._fightTarget = loser;

    loserSprite.roamTargetX = winnerSprite.x;
    loserSprite.roamTargetY = ov.GROUND_Y - 50;
    loserSprite.roamSpeed = 1.0 + Math.random() * 0.5;
    loserSprite.roamTimer = ov.fightDurationMs || 10000;
    loserSprite.isFighting = true;
    loserSprite._fightTarget = winner;
  }

  ctx.stateChanged = true;
  return null;
}

// Command registry
const commandRegistry = {
  '!jump': handleJump,
  '!sit': handleSit,
  '!unsit': handleUnsit,
  '!boom': handleBoom,
  '!skin': handleSkin,
  '!skins': handleSkins,
  '!spawn': handleSpawn,
  '!flip': handleFlip,
  '!fight': handleFight
};

// Server-side command processing
function processServerCommand(username, text, tags) {
  const cmd = text.trim().split(' ')[0].toLowerCase();
  const args = text.trim().split(' ').slice(1);
  const userId = username.toLowerCase();
  const now = Date.now();

  const cooldownMs = (_cfg.overlay && _cfg.overlay.commandCooldownMs) || 5000;
  if (cooldownMs > 0) {
    const isVip = tags?.badges?.vip;
    const isSub = tags?.badges?.subscriber;
    const exempt = hasModPermission(tags, username, _cfg) || isVip || isSub;

    if (!exempt) {
      let userCooldowns = ws.commandCooldowns.get(userId);
      if (!userCooldowns) {
        userCooldowns = new Map();
        ws.commandCooldowns.set(userId, userCooldowns);
      }
      const lastUsed = userCooldowns.get(cmd) || 0;
      if (now - lastUsed < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
        return { result: `Please wait ${remaining} seconds before using ${cmd} again.`, stateChanged: false };
      }
      userCooldowns.set(cmd, now);
    }
  }

  const handler = commandRegistry[cmd];
  if (!handler) return { result: null, stateChanged: false };

  const ctx = { stateChanged: false };
  const response = handler(username, userId, args, tags, now, ctx);
  return { result: response, stateChanged: ctx.stateChanged };
}

// Check if all required Twitch credentials are filled
function hasRequiredTwitchCredentials() {
  return !!(_cfg.twitch?.clientId && _cfg.twitch.clientId.trim() !== '' &&
            _cfg.twitch?.clientSecret && _cfg.twitch.clientSecret.trim() !== '' &&
            _cfg.botUsername && _cfg.botUsername.trim() !== '' &&
            _cfg.channel && _cfg.channel.trim() !== '');
}

// Attempt to silently refresh the OAuth token
async function tryAutoRefreshToken() {
  const refreshToken = _cfg.twitch?.refreshToken;
  if (!refreshToken || refreshToken.trim() === '') {
    _dbg('No refresh token available for auto-refresh');
    return false;
  }

  try {
    console.log('→ Attempting to refresh OAuth token...');
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: _cfg.twitch.clientId,
      client_secret: _cfg.twitch.clientSecret
    });
    const resp = await axios.post('https://id.twitch.tv/oauth2/token', params.toString(), { timeout: 10000 });
    const { access_token, refresh_token, expires_in } = resp.data;

    _cfg.twitch.botOAuthToken = access_token;
    botTokenInfo = { access_token, refresh_token, expires_at: Date.now() + (expires_in * 1000) };

    _cfg.twitch.refreshToken = refresh_token;
    try {
      fs.writeFileSync(_cfgPath, JSON.stringify(_cfg, null, 2));
      _dbg('Refresh token updated in .env');
    } catch (e) {
      _dbg('Failed to save refreshed token to config:', e.message);
    }

    console.log('✓ OAuth token refreshed automatically');
    return true;
  } catch (e) {
    _dbg('Auto-refresh failed:', e.message);
    _cfg.twitch.refreshToken = '';
    try {
      fs.writeFileSync(_cfgPath, JSON.stringify(_cfg, null, 2));
    } catch (writeErr) {
      _dbg('Failed to clear invalid refresh token:', writeErr.message);
    }
    return false;
  }
}

async function connectTwitchBot() {
  if (!_cfg.twitch.botOAuthToken || _cfg.twitch.botOAuthToken === 'oauth:your_bot_oauth_token_here') {
    console.log('⚠ No bot token. Get it via the local control panel UI');
    return;
  }
  if (twitchClient && twitchClient.readyState && (twitchClient.readyState() === 1 || twitchClient.readyState() === 'OPEN')) {
    _dbg('Twitch bot already connected');
    return;
  }

  if (twitchClient) {
    try {
      const state = twitchClient.readyState ? twitchClient.readyState() : null;
      if (state === 1 || state === 'OPEN') {
        await twitchClient.disconnect();
      }
    } catch (e) {
      _dbg('Error disconnecting old Twitch client:', e.message);
    }
  }

  const twitchDebug = _cfg.debug?.twitchDebug || false;
  const messagesLogLevel = _cfg.debug?.verboseMessages ? 'debug' : 'warn';

  const opts = {
    options: { debug: twitchDebug, messagesLogLevel: messagesLogLevel, tags: true },
    connection: { secure: true, reconnect: false },
    channels: [_cfg.channel],
    identity: { username: _cfg.botUsername, password: _cfg.twitch.botOAuthToken }
  };

  twitchClient = new tmi.Client(opts);

  if (_cfg.debug?.twitchAuthErrors === false && twitchClient.log) {
    twitchClient.log = new FilteredLogger(twitchClient.log, _cfg);
  }

  twitchClient.on('message', async (channel, tags, message, self) => {
    if (self) return;
    const rawUsername = tags['display-name'] || tags['username'] || 'anon';
    const username = rawUsername.replace(/[^\p{L}\p{N}_]/gu, '_');
    const displayName = rawUsername;
    _dbg('Twitch message from:', username, ':', message);

    try {
      const excluded = _db.prepare('SELECT id FROM excluded_users WHERE id = ?').get(username.toLowerCase());
      if (excluded) {
        _dbg(`Excluded user ${username} ignored`);
        return;
      }

      const stmt = _db.prepare(`
        INSERT OR REPLACE INTO users (id, display_name, assigned_skin)
        VALUES (?, ?, COALESCE((SELECT assigned_skin FROM users WHERE id = ?), 'default'))
      `);
      stmt.run(username.toLowerCase(), displayName, username.toLowerCase());

      ws.updateServerSprite(username, tags);

      const text = message.trim();
      const isCommand = text.startsWith('!');
      let commandResult = null;
      let stateChanged = false;

      if (isCommand) {
        _dbg('Processing command on server:', text);
        commandResult = processServerCommand(username, text, tags);
        if (commandResult) {
          stateChanged = commandResult.stateChanged;
          if (commandResult.result) {
            const responseMsg = `@${username}, ${commandResult.result}`;
            twitchClient.say(_cfg.channel, responseMsg).catch(err => {
              _dbg('Failed to send command response:', err.message);
            });
          }
        }
      }

      const chatTags = {
        ...tags,
        skipSpawn: isCommand,
        isCommand: isCommand,
        commandResult: commandResult
      };
      ws.broadcast({
        type: 'chat',
        username,
        message: text,
        tags: chatTags
      });
      _dbg('Message broadcasted to overlay clients');

      if (stateChanged) {
        ws.setSpriteDirty(true);
        ws.broadcastPhysicsState();
        _dbg('Sprite state broadcasted');
      }
    } catch (err) {
      _dbg('DB error:', err.message);
    }
  });

  twitchClient.on('connected', (addr) => {
    _dbg(`Twitch connected to ${addr}`);
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
  });

  twitchClient.on('disconnected', () => {
    _dbg('Twitch disconnected');
  });

  twitchClient.on('error', (err) => {
    _dbg('Twitch error:', err.message);
  });

  twitchClient.connect().catch((err) => {
    _dbg('Twitch connection failed:', err.message);
  });

  // Token refresh every 30 min
  let refreshFailures = 0;
  const MAX_REFRESH_FAILURES = 3;

  if (tokenRefreshIntervalId) {
    clearInterval(tokenRefreshIntervalId);
    tokenRefreshIntervalId = null;
  }

  tokenRefreshIntervalId = setInterval(async () => {
    if (botTokenInfo && Date.now() > (botTokenInfo.expires_at - 3600000)) {
      _dbg('Refreshing token...');
      try {
        const params = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: botTokenInfo.refresh_token,
          client_id: _cfg.twitch.clientId,
          client_secret: _cfg.twitch.clientSecret
        });
        const resp = await axios.post('https://id.twitch.tv/oauth2/token', params.toString(), { timeout: 10000 });
        const { access_token, refresh_token, expires_in } = resp.data;
        botTokenInfo = { access_token, refresh_token, expires_at: Date.now() + (expires_in * 1000) };
        _cfg.twitch.botOAuthToken = access_token;

        refreshFailures = 0;

        _cfg.twitch.refreshToken = refresh_token;
        try {
          fs.writeFileSync(_cfgPath, JSON.stringify(_cfg, null, 2));
          _dbg('Refresh token updated in .env');
        } catch (e) {
          _dbg('Failed to save refresh token:', e.message);
        }

        _dbg('Token refreshed');

        if (twitchClient) {
          try {
            const state = twitchClient.readyState ? twitchClient.readyState() : null;
            if (state === 1 || state === 'OPEN') {
              twitchClient.disconnect().catch(e => {
                _dbg('Error disconnecting Twitch client during token refresh:', e.message);
              });
            }
          } catch (e) {
            _dbg('Error during token refresh disconnect check:', e.message);
          }
          twitchClient.opts.identity.password = access_token;
          setTimeout(() => twitchClient.connect(), 2000);
        }
      } catch (e) {
        refreshFailures++;
        _dbg('Token refresh failed:', e.message, 'Failures:', refreshFailures);
        if (refreshFailures >= MAX_REFRESH_FAILURES) {
          console.error('Token refresh failed multiple times. Manual reconnection required via local control panel.');
        }
      }
    }
  }, 30 * 60 * 1000);
}

// Auto-connect logic
let needsOAuthRedirect = false;

async function handleStartupTwitchConnection() {
  if (!_cfg.useServer) {
    _dbg('useServer=false - no Twitch connection');
    console.log('⚠ useServer=false - no Twitch connection');
    return;
  }

  if (!_cfg.autoGenerateOAuth) {
    _dbg('autoGenerateOAuth=false - skipping automatic token generation');
    console.log('⚠ Auto-generate OAuth disabled. Use the dashboard to generate a token manually.');
    return;
  }

  _dbg('useServer=true, autoGenerateOAuth=true - checking Twitch connection');

  if (!hasRequiredTwitchCredentials()) {
    console.log('⚠ Twitch credentials incomplete. Fill in clientId, clientSecret, botUsername, and channel in .env.');
    return;
  }

  const hasRefreshToken = _cfg.twitch?.refreshToken && _cfg.twitch.refreshToken.trim() !== '';
  const hasAccessToken = _cfg.twitch.botOAuthToken && _cfg.twitch.botOAuthToken !== 'oauth:your_bot_oauth_token_here';

  if (hasRefreshToken) {
    console.log('→ Refreshing OAuth token on startup...');
    const refreshed = await tryAutoRefreshToken();

    if (refreshed) {
      if (_cfg.autoConnect) {
        console.log('✓ Token refreshed, autoConnect=true — connecting to Twitch...');
        connectTwitchBot();
      } else {
        console.log('✓ Token refreshed. Auto-connect disabled — use the dashboard to connect.');
      }
      return;
    }

    console.log('→ Refresh token expired or invalid. Will open browser for Twitch authorization...');
    needsOAuthRedirect = true;
    return;
  }

  if (hasAccessToken) {
    if (_cfg.autoConnect) {
      _dbg('No refresh token, but access token found — connecting to Twitch');
      connectTwitchBot();
    } else {
      _dbg('No refresh token, but access token found — not connecting');
      console.log('✓ Token available. Auto-connect disabled — use the dashboard to connect.');
    }
    return;
  }

  console.log('→ No OAuth token found. Will open browser for Twitch authorization...');
  needsOAuthRedirect = true;
}

function getTwitchClient() {
  return twitchClient;
}

function getNeedsOAuthRedirect() {
  return needsOAuthRedirect;
}

function cleanup() {
  if (tokenRefreshIntervalId) {
    clearInterval(tokenRefreshIntervalId);
    tokenRefreshIntervalId = null;
  }
}

function initTwitch(cfg, cfgPath, dbg, db) {
  _cfg = cfg;
  _cfgPath = cfgPath;
  _dbg = dbg;
  _db = db;
  watchSkinsDir();
}

module.exports = {
  initTwitch,
  connectTwitchBot,
  handleStartupTwitchConnection,
  getTwitchClient,
  getNeedsOAuthRedirect,
  getBotTokenInfo: () => botTokenInfo,
  setBotTokenInfo: (v) => { botTokenInfo = v; },
  detectSkinsFromAssets,
  invalidateSkinsCache,
  processServerCommand,
  cleanup
};
