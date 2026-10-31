// Keys that can alter an object's prototype chain when copied from untrusted JSON
const BLOCKED_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isSafeObjectKey(key) {
  return typeof key === 'string' && !BLOCKED_OBJECT_KEYS.has(key);
}

// Deep merge utility — creates independent copies of nested objects/arrays
function deepMerge(target, source) {
  if (!isObject(target)) return isObject(source) ? deepClone(source) : source;
  if (!isObject(source)) return source;
  const output = deepClone(target);
  for (const key of Object.keys(source)) {
    if (!isSafeObjectKey(key)) continue;
    if (isObject(source[key])) {
      output[key] = isObject(output[key]) ? deepMerge(output[key], source[key]) : deepClone(source[key]);
    } else if (Array.isArray(source[key])) {
      output[key] = source[key].map(item => isObject(item) ? deepClone(item) : item);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone);
  const clone = {};
  for (const key of Object.keys(obj)) {
    if (!isSafeObjectKey(key)) continue;
    clone[key] = deepClone(obj[key]);
  }
  return clone;
}

// Remove fields that are generated at runtime and must never be persisted
function stripRuntimeConfigKeys(cfg) {
  if (!isObject(cfg)) return cfg;
  let changed = false;
  for (const key of ['defaultOverlay', 'hasOAuthToken', 'isLocalhost', 'skins']) {
    if (Object.prototype.hasOwnProperty.call(cfg, key)) {
      delete cfg[key];
      changed = true;
    }
  }
  return changed;
}

// Input validation utilities
function isValidUsername(username) {
  if (!username || typeof username !== 'string') return false;
  if (username.length > 25) return false;
  return /^[\p{L}\p{N}_]+$/u.test(username);
}

function isValidSkinId(skinId) {
  if (!skinId || typeof skinId !== 'string') return false;
  if (skinId.length > 50) return false;
  return /^[a-zA-Z0-9_-]+$/.test(skinId);
}

function validateRequired(body, ...fields) {
  for (const field of fields) {
    if (!body[field] || typeof body[field] !== 'string' || body[field].trim() === '') {
      return { error: `Missing or invalid field: ${field}` };
    }
  }
  return null;
}

// Shared permission check for Twitch chat commands
function hasModPermission(tags, username, cfg) {
  const normalizedUser = String(username || '').toLowerCase();
  const isBroadcaster = tags?.badges?.broadcaster || normalizedUser === (cfg.channel || '').toLowerCase();
  const isBot = normalizedUser === String(cfg.botUsername || '').toLowerCase();
  const isMod = tags?.mod === '1' || tags?.mod === 1 || tags?.badges?.moderator || tags?.badges?.global_mod || tags?.badges?.admin;
  return !!(isBroadcaster || isBot || isMod);
}

// Lightweight rate limiter for API protection (no external dependency)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_REQUESTS = 100;
const RATE_LIMIT_MAX_ENTRIES = 1000;

function rateLimiter(req, res, next) {
  const socketAddress = req.socket?.remoteAddress;
  let ip = req.ip || socketAddress;
  const loopback = socketAddress === '127.0.0.1' || socketAddress === '::1' || socketAddress === '::ffff:127.0.0.1';
  if (loopback) {
    const forwarded = req.headers['cf-connecting-ip'] ||
      String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) ip = String(forwarded).trim();
  }
  ip = ip || 'unknown';
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    if (rateLimitMap.size >= RATE_LIMIT_MAX_ENTRIES) {
      const oldestKey = rateLimitMap.keys().next().value;
      rateLimitMap.delete(oldestKey);
    }
    entry = { windowStart: now, count: 1 };
    rateLimitMap.set(ip, entry);
  } else {
    entry.count++;
    if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
  }
  next();
}

module.exports = {
  deepMerge,
  isObject,
  deepClone,
  isSafeObjectKey,
  stripRuntimeConfigKeys,
  isValidUsername,
  isValidSkinId,
  validateRequired,
  hasModPermission,
  rateLimiter,
  rateLimitMap,
  RATE_LIMIT_WINDOW_MS
};
