const { DEFAULT_OVERLAY } = require('../config');
const { deepClone, isObject, isSafeObjectKey, stripRuntimeConfigKeys } = require('./util');

const TOP_LEVEL_KEYS = [
  'useServer',
  'serverPort',
  'debug',
  'twitch',
  'botUsername',
  'channel',
  'autoGenerateOAuth',
  'autoConnect',
  'autoOpenBrowser',
  'dashboardPassword',
  'overlay'
];

const DEBUG_KEYS = [
  'serverDebug',
  'twitchDebug',
  'twitchAuthErrors',
  'twitchOtherErrors',
  'verboseMessages',
  'logToFile'
];

function safeString(value, maxLength) {
  if (typeof value !== 'string') return null;
  return value.replace(/[\x00-\x1F\x7F]/g, '').slice(0, maxLength);
}

function safeBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function safePort(value) {
  const port = typeof value === 'string' ? Number(value) : value;
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function sanitizeOverlay(input) {
  if (!isObject(input)) return null;
  const output = {};
  for (const [key, defaultValue] of Object.entries(DEFAULT_OVERLAY)) {
    if (!isSafeObjectKey(key) || !Object.prototype.hasOwnProperty.call(input, key)) continue;
    if (typeof defaultValue !== 'number') continue;
    const raw = input[key];
    const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (typeof value === 'number' && Number.isFinite(value)) {
      output[key] = value;
    }
  }
  return output;
}

function sanitizeDebug(input) {
  if (!isObject(input)) return null;
  const output = {};
  for (const key of DEBUG_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = safeBoolean(input[key]);
    if (value !== null) output[key] = value;
  }
  return output;
}

function sanitizeTwitch(input) {
  if (!isObject(input)) return null;
  const output = {};
  for (const key of ['clientId', 'clientSecret']) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = safeString(input[key], 500);
    if (value !== null) output[key] = value;
  }
  return output;
}

// Builds a config object containing only known keys with known value types.
// Runtime fields and tokens supplied by a client are intentionally dropped.
function sanitizeConfigInput(input) {
  if (!isObject(input)) return null;
  const output = {};

  for (const key of TOP_LEVEL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    switch (key) {
      case 'useServer':
      case 'autoGenerateOAuth':
      case 'autoConnect':
      case 'autoOpenBrowser': {
        const value = safeBoolean(input[key]);
        if (value !== null) output[key] = value;
        break;
      }
      case 'serverPort': {
        const value = safePort(input[key]);
        if (value !== null) output[key] = value;
        break;
      }
      case 'dashboardPassword': {
        const value = safeString(input[key], 200);
        if (value !== null) output[key] = value;
        break;
      }
      case 'botUsername':
      case 'channel': {
        const value = safeString(input[key], 100);
        if (value !== null) output[key] = value.trim();
        break;
      }
      case 'debug': {
        const value = sanitizeDebug(input[key]);
        if (value) output[key] = value;
        break;
      }
      case 'twitch': {
        const value = sanitizeTwitch(input[key]);
        if (value) output[key] = value;
        break;
      }
      case 'overlay': {
        const value = sanitizeOverlay(input[key]);
        if (value) output[key] = value;
        break;
      }
      default:
        break;
    }
  }

  return output;
}

// Produces the exact object that is safe to write to .env or the config table.
// Access tokens stay in memory only; the refresh token may be persisted.
function sanitizeConfigForDisk(cfg) {
  const output = sanitizeConfigInput(cfg) || {};

  const twitchInput = isObject(cfg && cfg.twitch) ? cfg.twitch : {};
  output.twitch = output.twitch || {};
  output.twitch.botOAuthToken = '';
  const refreshToken = safeString(twitchInput.refreshToken, 500);
  if (refreshToken !== null) output.twitch.refreshToken = refreshToken;
  if (!Object.prototype.hasOwnProperty.call(output.twitch, 'clientId')) {
    output.twitch.clientId = safeString(twitchInput.clientId, 500) || '';
  }
  if (!Object.prototype.hasOwnProperty.call(output.twitch, 'clientSecret')) {
    output.twitch.clientSecret = safeString(twitchInput.clientSecret, 500) || '';
  }

  // Keep the field order stable for readable .env files.
  const ordered = {};
  for (const key of TOP_LEVEL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(output, key)) ordered[key] = output[key];
  }
  return ordered;
}

function cloneSafeConfig(cfg) {
  const clone = deepClone(cfg);
  stripRuntimeConfigKeys(clone);
  return clone;
}

module.exports = {
  TOP_LEVEL_KEYS,
  DEBUG_KEYS,
  sanitizeConfigInput,
  sanitizeConfigForDisk,
  cloneSafeConfig
};
