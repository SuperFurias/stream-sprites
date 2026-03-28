const fs = require('fs');
const path = require('path');

// Known Twitch authentication error patterns
const AUTH_ERROR_PATTERNS = ['Login unsuccessful', 'Login authentication failed', 'Improperly formatted auth', 'Invalid NICK'];

// Log sanitization utility to prevent sensitive data exposure
function sanitizeLogMessage(message) {
  if (typeof message !== 'string') return message;
  let sanitized = message.replace(/oauth:[a-zA-Z0-9_]+/g, 'oauth:***REDACTED***');
  sanitized = sanitized.replace(/\b[a-f0-9]{64,}\b/gi, '***TOKEN***');
  sanitized = sanitized.replace(/(client_secret|clientSecret|password|token)=([^&\s]+)/gi, '$1=***REDACTED***');
  return sanitized;
}

function sanitizeLogArgs(args) {
  return args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      const sanitized = { ...arg };
      if (sanitized.botOAuthToken) sanitized.botOAuthToken = '***REDACTED***';
      if (sanitized.refreshToken) sanitized.refreshToken = '***REDACTED***';
      if (sanitized.access_token) sanitized.access_token = '***REDACTED***';
      if (sanitized.refresh_token) sanitized.refresh_token = '***REDACTED***';
      if (sanitized.clientSecret) sanitized.clientSecret = '***REDACTED***';
      if (sanitized.password) sanitized.password = '***REDACTED***';
      return sanitized;
    }
    return sanitizeLogMessage(String(arg));
  });
}

// File logger setup
let logStream = null;
function initFileLogger() {
  try {
    const logsDir = path.join(__dirname, '..', '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logFile = path.join(logsDir, 'debug.log');
    logStream = fs.createWriteStream(logFile, { flags: 'a' });
    logStream.on('error', (err) => {
      console.error('Failed to write to log file:', err.message);
      logStream = null;
    });
  } catch (err) {
    console.error('Failed to initialize file logger:', err.message);
  }
}

function closeFileLogger() {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

function getLogStream() {
  return logStream;
}

// Check if a Twitch error should be logged based on settings
function shouldLogTwitchError(err, cfg) {
  let errMsg = '';
  if (err && typeof err === 'object') {
    errMsg = err.message || err.toString() || '';
  } else if (err) {
    errMsg = String(err);
  }
  const isAuthError = AUTH_ERROR_PATTERNS.some(pattern => errMsg && errMsg.includes(pattern));
  if (isAuthError) {
    return cfg.debug?.twitchAuthErrors !== false;
  } else {
    return cfg.debug?.twitchOtherErrors !== false;
  }
}

// Custom logger that filters errors based on debug settings
class FilteredLogger {
  constructor(originalLogger, cfg) {
    this.originalLogger = originalLogger;
    this._cfg = cfg;
  }

  setLevel(level) { this.originalLogger.setLevel(level); }
  getLevel() { return this.originalLogger.getLevel(); }

  _log(level, message) {
    if (level === 'error' && typeof message === 'string') {
      const isAuthError = AUTH_ERROR_PATTERNS.some(pattern => message.includes(pattern));
      if (isAuthError && this._cfg?.debug?.twitchAuthErrors === false) {
        return;
      }
    }
    this.originalLogger._log(level, message);
  }

  trace(message) { this._log('trace', message); }
  debug(message) { this._log('debug', message); }
  info(message) { this._log('info', message); }
  warn(message) { this._log('warn', message); }
  error(message) { this._log('error', message); }
  fatal(message) { this._log('fatal', message); }
}

// Debug utility - respects serverDebug setting and file logging
function createDbg(cfg) {
  return function dbg(...args) {
    const timestamp = new Date().toISOString();
    const sanitizedArgs = sanitizeLogArgs(args);
    const message = `[${timestamp}] [SERVER DEBUG] ${sanitizedArgs.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;

    if (cfg.debug?.serverDebug) {
      console.log('[SERVER DEBUG]', ...sanitizedArgs);
    }
    if (cfg.debug?.logToFile && logStream) {
      logStream.write(message);
    }
  };
}

module.exports = {
  AUTH_ERROR_PATTERNS,
  sanitizeLogMessage,
  sanitizeLogArgs,
  initFileLogger,
  closeFileLogger,
  getLogStream,
  shouldLogTwitchError,
  FilteredLogger,
  createDbg
};
