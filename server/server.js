// server.js - Simple Stream Sprites with Skin Assignment
//
// SECURITY MODEL:
// This application is designed for LOCAL-ONLY use on the same machine as the OBS Studio
// streaming setup. The admin API endpoints have no authentication because:
// - Server runs on localhost (127.0.0.1) only by default
// - Dashboard and overlay are intended for the streamer's personal computer
// - No external network access is expected or required
//
// If you need to expose this server to a network, YOU MUST ADD AUTHENTICATION
// to the admin endpoints before doing so. See requireAdminAuth() function.
const express = require('express');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const tmi = require('tmi.js');
const Database = require('better-sqlite3');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const { spawn, exec } = require('child_process');

// File logger setup
let logStream = null;
function initFileLogger() {
  try {
    const logsDir = path.join(__dirname, '..', 'logs');
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

// Check if a Twitch error should be logged based on settings
function shouldLogTwitchError(err) {
  // Convert error to string safely
  let errMsg = '';
  if (err && typeof err === 'object') {
    errMsg = err.message || err.toString() || '';
  } else if (err) {
    errMsg = String(err);
  }
  
  const authErrors = ['Login unsuccessful', 'Login authentication failed', 'Improperly formatted auth', 'Invalid NICK'];
  const isAuthError = authErrors.some(pattern => errMsg && errMsg.includes(pattern));
  
  if (isAuthError) {
    return cfg.debug?.twitchAuthErrors !== false; // defaults to false
  } else {
    return cfg.debug?.twitchOtherErrors !== false; // defaults to false
  }
}

// Custom logger that filters errors based on debug settings
class FilteredLogger {
  constructor(originalLogger) {
    this.originalLogger = originalLogger;
  }
  
  setLevel(level) {
    this.originalLogger.setLevel(level);
  }
  
  getLevel() {
    return this.originalLogger.getLevel();
  }
  
  _log(level, message) {
    // Filter authentication errors if disabled
    if (level === 'error' && typeof message === 'string') {
      const authErrors = ['Login unsuccessful', 'Login authentication failed', 'Improperly formatted auth', 'Invalid NICK'];
      const isAuthError = authErrors.some(pattern => message.includes(pattern));
      
      if (isAuthError && cfg.debug?.twitchAuthErrors === false) {
        return; // Skip logging auth errors if disabled
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
function dbg(...args) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] [SERVER DEBUG] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;
  
  // Always log to console if serverDebug is enabled
  if (cfg.debug?.serverDebug) {
    console.log('[SERVER DEBUG]', ...args);
  }
  
  // Log to file if enabled
  if (cfg.debug?.logToFile && logStream) {
    logStream.write(message);
  }
}

const cfgPath = path.join(__dirname, '.env');

// Load config
let cfg;
function loadConfig(){
  let configFromFile = null;
  let fileExists = false;
  try{
    if(fs.existsSync(cfgPath)){
      fileExists = true;
      configFromFile = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      cfg = configFromFile;
    }
  }catch(e){
    console.warn('⚠ .env invalid or missing:', e.message);
  }
  
  // Define complete default configuration
  const defaultCfg = {
    useServer: true,
    serverPort: 8080,
    debug: {
      serverDebug: false,
      twitchDebug: true,
      twitchAuthErrors: true,
      twitchOtherErrors: true,
      verboseMessages: false,
      logToFile: false
    },
    twitch: {
      clientId: "",
      clientSecret: "",
      botOAuthToken: ""
    },
    channel: "",
    botUsername: "",
    persistOAuthToken: false,
    autoOpenBrowser: true
  };
  
  // If no config loaded, start with defaults
  if (!cfg) {
    cfg = { ...defaultCfg };
  } else {
    // Deep merge defaults to fill in any missing properties
    let configChanged = false;
    
    // Helper to recursively ensure all default properties exist
    function ensureDefaults(target, defaults, path = '') {
      let changed = false;
      Object.keys(defaults).forEach(key => {
        const fullPath = path ? `${path}.${key}` : key;
        const defaultValue = defaults[key];
        
        if (typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)) {
          // Ensure the object exists in target
          if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
            target[key] = { ...defaultValue };
            changed = true;
            console.log(`✓ Added missing config section: ${fullPath}`);
          } else {
            // Recursively check nested properties
            const nestedChanged = ensureDefaults(target[key], defaultValue, fullPath);
            changed = changed || nestedChanged;
          }
        } else {
          // Check if property exists and has correct type
          if (!(key in target)) {
            target[key] = defaultValue;
            changed = true;
            console.log(`✓ Added missing config: ${fullPath} (default: ${JSON.stringify(defaultValue)})`);
          } else if (typeof target[key] !== typeof defaultValue && defaultValue !== null) {
            // Type mismatch, replace with default
            target[key] = defaultValue;
            changed = true;
            console.log(`✓ Fixed type mismatch in config: ${fullPath} (set to default: ${JSON.stringify(defaultValue)})`);
          }
        }
      });
      return changed;
    }
    
    configChanged = ensureDefaults(cfg, defaultCfg);
    
    // Clean up: remove skins property if present (skins are auto-detected)
    if (cfg.skins) {
      delete cfg.skins;
      configChanged = true;
    }
    
    // Write back to file if any changes were made
    if (configChanged) {
      try {
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        console.log('✓ Updated .env with missing default values');
      } catch (e) {
        console.warn('⚠ Could not update .env with defaults:', e.message);
      }
    }
  }
  
  // If file didn't exist, create it with defaults
  if (!fileExists && cfg) {
    try {
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
      console.log('✓ Created .env with default values');
    } catch (e) {
      console.error('✗ Failed to create .env:', e.message);
      return false;
    }
  }
  
  console.log('✓ Loaded config from .env');
  return true;
}

loadConfig();
if(!cfg) process.exit(1);

// On startup: if persistOAuthToken is false, clear any existing token from disk
if(cfg.persistOAuthToken === false && cfg.twitch?.botOAuthToken) {
  try {
    cfg.twitch.botOAuthToken = '';
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    console.log('✓ Cleared OAuth token from .env (persistOAuthToken=false)');
  } catch(e) {
    console.error('✗ Failed to clear OAuth token on startup:', e.message);
  }
}

// Initialize file logger if logToFile is enabled
if (cfg.debug?.logToFile) {
  initFileLogger();
}

dbg('Config loaded:', { channel: cfg.channel, botUsername: cfg.botUsername, useServer: cfg.useServer, serverPort: cfg.serverPort });

// Default overlay configuration (shared with dashboard and overlay client)
// These values are used when .env does not specify overlay.* settings
const DEFAULT_OVERLAY = {
  // Canvas
  canvasWidth: 1920,
  canvasHeight: 1080,
  groundY: 920,
  
  // Physics
  gravity: 0.6,
  airResistance: 0.992,
  groundFriction: 0.92,
  bounceDamping: 0.65,
  minVelocity: 0.15,
  
  // Spawning
  maxSprites: 1500,
  maxSpawnQuantity: 100,
  spawnThrottleMs: 700,
  spriteSizeMin: 30,
  spriteSizeMax: 80,
  spawnMaxTries: 8,
  spawnYOffset: 40,
  spawnJitter: 6,
  spawnBoundsPadding: 60,
  spawnSizePadding: 120,
  initialVelocity: 2,
  
  // Lifetime
  spriteLifetimeMs: 30 * 60 * 1000,
  fadeWarningMs: 5 * 60 * 1000,
  
  // Collision
  collisionPersonalSpaceThreshold: 0.1,
  collisionForceMultiplier: 0.02,
  collisionProbabilityScaling: 1,
  collisionProbabilityLow: 0.0,
  collisionProbabilityMedium: 0.5,
  collisionProbabilityHigh: 1.0,
  collisionCountThresholdLow: 5,
  collisionCountThresholdHigh: 15,
  
  // Explosion
  explosionForceMultiplier: 60,
  explosionRadiusBase: 400,
  explosionRadiusVar: 300,
  explosionUpwardBias: 0.7,
  spinStrengthFactor: 0.05,
  randomJitterFactor: 0.2,
  explosionTimingJitter: 0.3,
  
  // Roaming
  roamZoneYOffset: 30,
  roamDurationBase: 3000,
  roamDurationVar: 4000,
  roamDistanceThreshold: 5,
  roamWalkForceMultiplier: 0.2,
  roamWalkVerticalFactor: 0.3,
  roamSteerForceMultiplier: 0.1,
  roamSteerVerticalFactor: 0.2,
  roamArrivalThreshold: 10,
  roamRandomMoveChance: 0.03,
  roamRandomMoveForce: 0.3,
  roamRandomMoveVertical: 0.1,
  
  // Visual
  textWidthPadding: 4,
  wiggleRange: 1000,
  
  // Particles
  particleCountBase: 30,
  particleCountVar: 20,
  particleSpeedBase: 2,
  particleSpeedVar: 4,
  particleGravity: 0.1,
  particleDecayBase: 0.01,
  particleDecayVar: 0.02,
  particleSizeBase: 3,
  particleSizeVar: 5,
  particleHueBase: 10,
  particleHueRange: 60,
  
  // Other
  nameLengthLimit: 32,
  velocityBump: 3,
  draggedGravity: 0.5,
  danceGravityFactor: -0.2,
  danceAngularVelocity: 0.1,
  tiltReturnTime: 1000,
  danceFrequency: 200,
  massDivisor: 1000,
  momentOfInertiaFactor: 0.5,
  heightScaleSit: 0.75,
  heightScaleIdle: 1.0,
  dtCap: 0.05,
  groundYMultiplier: 0.99,
  safetyNudgeDistance: 0.5,
  angularVelocityDecay: 0.98,
  angleDecay: 0.95,
  tiltAngularDecay: 0.9,
  tiltAngleThreshold: 0.01,
  lifetimeCleanupThreshold: 10,
  zoneSelectionBias: 0.7,
  spatialHashCellSize: 64,
  numZones: 5,
  avoidanceRadiusMultiplier: 2.0,
  sizeSimilarityThreshold: 0.85,
  expandedRadiusMultiplier: 4.0,
  sizeDiffThresholdLow: 0.7,
  sizeDiffAttractionMultiplier: 1.5,
  minAttractionDistance: 20,
  sizeDiffFactor: 2.0,
  attractionForceBase: 0.08,
  largerRepulsionFactor: 0.3,
  moderateRepulsionRadius: 1.0,
  moderateRepulsionForce: 0.08,
  centerPushRadius: 150,
  centerPushForce: 0.02,
  groundYCenterOffset: 0.8,
  directionChangeThreshold: 0.3,
  resizeDebounceMs: 100
};

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..')));
app.use('/overlay', express.static(path.join(__dirname, '..', 'overlay')));

// Serve dashboard at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
});

const port = cfg.serverPort || 8080;

// Database - simple: just store assigned skins
const dbDir = path.join(__dirname, 'db');
if(!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const dbFile = path.join(dbDir, 'sa.db');
const db = new Database(dbFile);
console.log('✓ Database connected');

// Initialize tables
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  assigned_skin TEXT DEFAULT 'default'
)`);
db.exec(`CREATE TABLE IF NOT EXISTS excluded_users (
  id TEXT PRIMARY KEY,
  reason TEXT
)`);

// Admin auth - no password required (development mode)
function requireAdminAuth(req,res,next){
  // All admin endpoints are accessible without authentication
  next();
}

// Deep merge utility
function deepMerge(target, source){
  const output = Object.assign({}, target);
  if(isObject(target) && isObject(source)){
    Object.keys(source).forEach(key => {
      if(isObject(source[key])){
        if(!(key in target) || !isObject(target[key])){
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  return output;
}
function isObject(item){
  return item && typeof item === 'object' && !Array.isArray(item);
}

// Input validation utilities
function isValidUsername(username) {
  if (!username || typeof username !== 'string') return false;
  if (username.length > 25) return false;
  // Allow alphanumeric, underscore, and Unicode letters (for international usernames)
  return /^[\p{L}\p{N}_]+$/u.test(username);
}

function isValidSkinId(skinId) {
  if (!skinId || typeof skinId !== 'string') return false;
  if (skinId.length > 50) return false;
  // Allow alphanumeric, underscore, hyphen
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

// Reusable function to detect skins from assets folder
function detectSkinsFromAssets() {
  const skinsDir = path.join(__dirname, '..', 'assets', 'skins');
  const detected = [];
  try{
    dbg('Scanning skins directory:', skinsDir);
    if(fs.existsSync(skinsDir)){
      const files = fs.readdirSync(skinsDir);
      dbg('Found files:', files);
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if(['.png', '.gif', '.jpg', '.jpeg', '.webp', '.webm'].includes(ext)){
          const id = path.basename(file, ext).toLowerCase().replace(/[^a-z0-9_]/g, '_');
          const isGif = ['.gif'].includes(ext);
          const isWebm = ['.webm'].includes(ext);
          detected.push({
            id: id,
            name: path.basename(file, ext),
            file: `../assets/skins/${file}`,
            price: 0,
            autoDetected: true,
            isGif: isGif,
            isWebm: isWebm
          });
        }
      });
      dbg('Detected skins:', detected.map(s => s.id));
    } else {
      dbg('Skins directory does not exist:', skinsDir);
    }
  }catch(e){
    console.error('Error detecting skins:', e.message);
  }
  return detected;
}

// API Routes
app.get('/api/skins', (req,res) => {
  dbg('GET /api/skins');
  const skins = detectSkinsFromAssets();
  dbg('Returning skins:', skins.map(s => s.id));
  res.json(skins);
});

// Auto-detect skins from assets/skins folder
app.get('/api/skins/auto', (req,res) => {
  dbg('GET /api/skins/auto');
  const skins = detectSkinsFromAssets();
  dbg('Returning auto-detected skins:', skins.map(s => s.id));
  res.json(skins);
});

app.get('/env', (req,res) => {
  dbg('GET /env');
  
  // Reload config from disk to reflect any manual changes
  let fileCfg;
  try {
    if(fs.existsSync(cfgPath)) {
      fileCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      // Update in-memory config to match file (but preserve runtime state like botOAuthToken if not persisting)
      if(fileCfg.persistOAuthToken === false && cfg.twitch?.botOAuthToken) {
        // Keep the in-memory token, don't overwrite with file (which would have empty token)
        fileCfg.twitch = fileCfg.twitch || {};
        fileCfg.twitch.botOAuthToken = cfg.twitch.botOAuthToken;
      }
      cfg = fileCfg;
      dbg('Config reloaded from disk');
    }
  } catch(e) {
    dbg('Failed to reload config from disk, using in-memory:', e.message);
  }
  
  // Return config without skins - skins are fetched separately via /api/skins endpoints
  // Merge overlay config with defaults to provide complete configuration
  const overlayConfig = { ...DEFAULT_OVERLAY, ...(cfg.overlay || {}) };
  const mergedCfg = {
    ...cfg,
    overlay: overlayConfig,
    defaultOverlay: DEFAULT_OVERLAY // Also provide defaults explicitly for reference
  };
  dbg('Returning config (skins excluded, use /api/skins for skin data)');
  res.json(mergedCfg);
});


// Get user's assigned skin
app.get('/api/user/:id', (req,res) => {
  const id = req.params.id.toLowerCase();
  dbg('GET /api/user/:id', { id });
  try {
    const row = db.prepare('SELECT id, display_name, assigned_skin FROM users WHERE id = ?').get(id);
    if(!row) {
      dbg('User not found, returning default');
      return res.json({id, display_name: id, assigned_skin: 'default'});
    }
    dbg('User found:', row);
    res.json(row);
  } catch (err) {
    dbg('Error fetching user:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Viewer: Get current user's profile (for dashboard)
app.get('/api/viewer/profile', (req,res) => {
  // In a real implementation, this would use session/auth
  // For now, we'll return a demo profile or the user from a token
  // Since the dashboard expects this to work without auth in dev mode,
  // we'll return a default profile
  try {
    // Check for Authorization header with token (could be user token)
    const auth = req.headers.authorization;
    let userId = null;
    if (auth && auth.startsWith('Bearer ')) {
      // In a full implementation, validate token and extract user
      // For now, just return demo data
    }
    // Return demo profile for development
    res.json({
      id: 'viewer',
      display_name: 'Viewer',
      skins: ['default'],
      assigned_skin: 'default'
    });
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// Viewer: Update current user's skin assignment
app.post('/api/viewer/updateSkin', (req,res) => {
  const { skinId } = req.body;
  dbg('POST /api/viewer/updateSkin', { skinId });
  if (!skinId) {
    dbg('Missing skinId');
    return res.status(400).json({error: 'missing skinId'});
  }
  try {
    // In a real implementation, this would update based on authenticated user
    // For now, we'll just validate the skin exists and return success
    const allSkins = detectSkinsFromAssets();
    const validSkin = allSkins.find(s => s.id === skinId);
    if (!validSkin) {
      dbg('Invalid skin ID:', skinId);
      return res.status(400).json({error: 'Invalid skin ID'});
    }
    // In production, would update the database for the current user
    dbg('Skin updated successfully');
    res.json({ok: true, message: 'Skin updated'});
  } catch (err) {
    dbg('Error updating skin:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Admin: Assign skin to user
app.post('/api/admin/assignSkin', requireAdminAuth, (req,res)=>{
  const {userId, skinId} = req.body;
  dbg('POST /api/admin/assignSkin', { userId, skinId });
  
  // Validate userId
  if (!isValidUsername(userId)) {
    dbg('Invalid userId:', userId);
    return res.status(400).json({error: 'Invalid username (max 25 chars, alphanumeric/underscore only)'});
  }
  
  // Validate skinId
  if (!isValidSkinId(skinId)) {
    dbg('Invalid skinId:', skinId);
    return res.status(400).json({error: 'Invalid skin ID'});
  }
  
  const userLower = userId.toLowerCase();
  try {
    db.prepare('INSERT OR REPLACE INTO users (id, display_name, assigned_skin) VALUES (?,?,?)')
      .run(userLower, userLower, skinId);
    dbg('Skin assigned to user:', userLower, skinId);
    res.json({ok:true, assigned_skin: skinId});
  } catch (err) {
    dbg('Error assigning skin:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Admin: List all users with their assigned skins
app.get('/api/admin/users', requireAdminAuth, (req,res)=>{
  dbg('GET /api/admin/users');
  try {
    const rows = db.prepare('SELECT id, display_name, assigned_skin FROM users ORDER BY id LIMIT 100').all();
    dbg('Returning', rows.length, 'users');
    res.json(rows);
  } catch (err) {
    dbg('Error listing users:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Admin: Manually connect to Twitch
app.post('/api/admin/connectTwitch', requireAdminAuth, (req,res)=>{
  dbg('POST /api/admin/connectTwitch');
  try{
    if(!cfg.twitch.botOAuthToken || cfg.twitch.botOAuthToken === 'oauth:your_bot_oauth_token_here' || cfg.twitch.botOAuthToken.trim() === ''){
      dbg('Missing OAuth token');
      return res.status(400).json({error: 'OAuth token not found. Please click "Generate OAuth Token" first to create one.'});
    }
    if(!cfg.botUsername || !cfg.channel){
      dbg('Missing botUsername or channel');
      return res.status(400).json({error: 'Bot username and channel must be set in config.'});
    }
    // Trigger bot connection
    dbg('Initiating Twitch connection');
    connectTwitchBot();
    res.json({ok:true, message:'Twitch connection initiated'});
  }catch(e){
    dbg('Error connecting to Twitch:', e.message);
    res.status(500).json({error:e.message});
  }
});

// Admin: Disconnect Twitch bot
app.post('/api/admin/disconnectTwitch', requireAdminAuth, (req,res)=>{
  dbg('POST /api/admin/disconnectTwitch');
  try{
    if(twitchClient){
      twitchClient.disconnect();
      if(reconnectTimeout){
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      dbg('Twitch bot disconnected');
      res.json({ok:true, message:'Twitch bot disconnected'});
    } else {
      dbg('Twitch bot not connected');
      res.json({ok:true, message:'Twitch bot was not connected'});
    }
  }catch(e){
    dbg('Error disconnecting Twitch:', e.message);
    res.status(500).json({error:e.message});
  }
});

// Admin: Save config
app.post('/api/admin/saveConfig', requireAdminAuth, (req,res)=>{
  try{
    const newCfg = req.body;
    if(!newCfg.twitch?.clientId || !newCfg.twitch?.clientSecret || !newCfg.botUsername || !newCfg.channel){
      return res.status(400).json({error: 'Missing required fields'});
    }
    const merged = deepMerge(cfg, newCfg);
    // Skins are auto-detected from assets, never save them to config
    delete merged.skins;
    // Also remove skins from the in-memory config if present
    if (cfg.skins) {
      delete cfg.skins;
    }
    
    // Handle OAuth token based on persistOAuthToken setting
    const tokenForMemory = cfg.twitch?.botOAuthToken || '';
    if(merged.twitch) {
      if(cfg.persistOAuthToken) {
        // Keep token in merged (will be saved to disk)
      } else {
        // Clear token for disk write, preserve in memory
        merged.twitch.botOAuthToken = '';
      }
    }
    
    fs.writeFileSync(cfgPath, JSON.stringify(merged, null, 2));
    // Restore token in memory if not persisting
    if(cfg.twitch && !cfg.persistOAuthToken) {
      cfg.twitch.botOAuthToken = tokenForMemory;
    }
    Object.assign(cfg, merged);
    // Ensure token is preserved in memory if not persisting
    if(cfg.twitch && !cfg.persistOAuthToken) {
      cfg.twitch.botOAuthToken = tokenForMemory;
    }
    
    res.json({ok:true, message:'Config saved'});
  }catch(e){
    res.status(500).json({error:e.message});
  }
});

// Admin: Apply settings dynamically without restart
app.post('/api/admin/applySettings', requireAdminAuth, (req,res)=>{
  try {
    const settings = req.body;
    // Validate settings structure
    if (typeof settings !== 'object' || settings === null) {
      return res.status(400).json({error: 'Invalid settings format'});
    }
    
    // Initialize debug object if it doesn't exist
    if (!cfg.debug) {
      cfg.debug = {};
    }
    
    // Update settings
    if (typeof settings.serverDebug === 'boolean') cfg.debug.serverDebug = settings.serverDebug;
    if (typeof settings.twitchDebug === 'boolean') cfg.debug.twitchDebug = settings.twitchDebug;
    if (typeof settings.twitchAuthErrors === 'boolean') cfg.debug.twitchAuthErrors = settings.twitchAuthErrors;
    if (typeof settings.twitchOtherErrors === 'boolean') cfg.debug.twitchOtherErrors = settings.twitchOtherErrors;
    if (typeof settings.verboseMessages === 'boolean') cfg.debug.verboseMessages = settings.verboseMessages;
    if (typeof settings.logToFile === 'boolean') {
      const newLogToFile = settings.logToFile;
      cfg.debug.logToFile = newLogToFile;
      
      // Initialize or close file logger based on setting
      if (newLogToFile && !logStream) {
        initFileLogger();
        dbg('File logging enabled');
      } else if (!newLogToFile && logStream) {
        closeFileLogger();
        dbg('File logging disabled');
      }
    }
    
    // Save to config file
    const configToSave = { ...cfg };
    // Remove runtime properties that shouldn't be saved
    // (the config object might have other non-serializable properties)
    // Handle OAuth token based on persistOAuthToken setting
    const tokenForMemory = cfg.twitch?.botOAuthToken || '';
    if(configToSave.twitch) {
      if(cfg.persistOAuthToken) {
        // Keep token in configToSave (will be saved to disk)
      } else {
        // Clear token for disk write
        configToSave.twitch.botOAuthToken = '';
      }
    }
    // Skins are auto-detected from assets, never save them to config
    delete configToSave.skins;
    fs.writeFileSync(cfgPath, JSON.stringify(configToSave, null, 2));
    // Restore token in memory if not persisting
    if(cfg.twitch && !cfg.persistOAuthToken) {
      cfg.twitch.botOAuthToken = tokenForMemory;
    }
    
    dbg('Settings applied dynamically:', cfg.debug);
    res.json({ok:true, message:'Settings applied', settings: cfg.debug});
  } catch (err) {
    dbg('Error applying settings:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Admin: Clear all sprites (both client and server)
app.post('/api/admin/clearSprites', requireAdminAuth, (req,res)=>{
  dbg('POST /api/admin/clearSprites');
  // Clear server-side in-memory sprites
  clearServerSprites();
  // Also broadcast clear command to clients (for immediate visual feedback)
  broadcast({type:'cmd', cmd:'clearSprites'});
  dbg('Clear sprites command broadcasted and server memory cleared');
  res.json({ok:true});
});

// Admin: Clear all sprites (server-side authoritative) - alias for backward compatibility
app.post('/api/admin/clearSpritesServer', requireAdminAuth, (req,res)=>{
  dbg('POST /api/admin/clearSpritesServer');
  try{
    clearServerSprites();
    broadcast({type:'cmd', cmd:'clearSprites'});
    dbg('Server sprites cleared and clients notified');
    res.json({ok:true});
  }catch(err){
    dbg('Error clearing server sprites:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Admin: Delete user skin assignment
app.post('/api/admin/resetUser', requireAdminAuth, (req,res)=>{
  const {id} = req.body;
  dbg('POST /api/admin/resetUser', { id });
  
  if (!isValidUsername(id)) {
    dbg('Invalid id:', id);
    return res.status(400).json({error: 'Invalid username'});
  }
  
  try {
    db.prepare('DELETE FROM users WHERE id=?').run(id.toLowerCase());
    dbg('User deleted:', id.toLowerCase());
    res.json({ok:true});
  } catch (err) {
    dbg('Error deleting user:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Admin: Reset all user assignments
app.post('/api/admin/resetAll', requireAdminAuth, (req,res)=>{
  dbg('POST /api/admin/resetAll');
  try {
    const result = db.prepare('DELETE FROM users').run();
    dbg('All users deleted, rows affected:', result.changes);
    res.json({ok:true});
  } catch (err) {
    dbg('Error resetting all users:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Admin: Get excluded users list
app.get('/api/admin/excluded', requireAdminAuth, (req,res)=>{
  dbg('GET /api/admin/excluded');
  try {
    const rows = db.prepare('SELECT id, reason FROM excluded_users ORDER BY id LIMIT 100').all();
    dbg('Returning', rows.length, 'excluded users');
    res.json(rows);
  } catch (err) {
    dbg('Error fetching excluded users:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Admin: Add excluded user
app.post('/api/admin/exclude', requireAdminAuth, (req,res)=>{
  const {userId, reason} = req.body;
  dbg('POST /api/admin/exclude', { userId, reason });
  
  if (!isValidUsername(userId)) {
    dbg('Invalid userId:', userId);
    return res.status(400).json({error: 'Invalid username'});
  }
  
  const userLower = userId.toLowerCase();
  try {
    db.prepare('INSERT OR REPLACE INTO excluded_users (id, reason) VALUES (?,?)')
      .run(userLower, reason || '');
    dbg('User excluded:', userLower);
    res.json({ok:true});
  } catch (err) {
    dbg('Error excluding user:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Admin: Remove excluded user
app.post('/api/admin/unexclude', requireAdminAuth, (req,res)=>{
  const {userId} = req.body;
  dbg('POST /api/admin/unexclude', { userId });
  
  if (!isValidUsername(userId)) {
    dbg('Invalid userId:', userId);
    return res.status(400).json({error: 'Invalid username'});
  }
  
  try {
    db.prepare('DELETE FROM excluded_users WHERE id=?').run(userId.toLowerCase());
    dbg('User unexcluded:', userId.toLowerCase());
    res.json({ok:true});
  } catch (err) {
    dbg('Error unexcluding user:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Admin: Update exclusion reason
app.post('/api/admin/updateExclusionReason', requireAdminAuth, (req,res)=>{
  const {userId, reason} = req.body;
  dbg('POST /api/admin/updateExclusionReason', { userId, reason });
  
  if (!isValidUsername(userId)) {
    dbg('Invalid userId:', userId);
    return res.status(400).json({error: 'Invalid username'});
  }
  
  try {
    db.prepare('UPDATE excluded_users SET reason = ? WHERE id = ?')
      .run(reason || '', userId.toLowerCase());
    dbg('Exclusion reason updated for:', userId.toLowerCase());
    res.json({ok:true});
  } catch (err) {
    dbg('Error updating exclusion reason:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Stats with custom vs default breakdown
app.get('/api/stats', requireAdminAuth, (req,res)=>{
  dbg('GET /api/stats');
  try {
    const row = db.prepare(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN assigned_skin != 'default' AND assigned_skin IS NOT NULL THEN 1 ELSE 0 END) as custom
      FROM users`).get();
    const result = row || {total: 0, custom: 0};
    const stats = {
      total_users: result.total || 0,
      custom_skins: result.custom || 0,
      default_skins: (result.total || 0) - (result.custom || 0)
    };
    dbg('Stats:', stats);
    res.json(stats);
  } catch (err) {
    dbg('Error fetching stats:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Admin: Refresh all overlay clients
app.post('/api/admin/refreshAllOverlays', requireAdminAuth, (req,res)=>{
  dbg('POST /api/admin/refreshAllOverlays');
  try{
    // Broadcast refresh command to all connected WebSocket clients
    broadcast({type:'cmd', cmd:'refresh'});
    const clientCount = wss.clients.size;
    dbg('Refresh command broadcasted to', clientCount, 'clients');
    res.json({ok:true, clients: clientCount});
  }catch(err){
    dbg('Error refreshing overlays:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Admin: Clear all sprites (server-side)
app.post('/api/admin/clearSpritesServer', requireAdminAuth, (req,res)=>{
  dbg('POST /api/admin/clearSpritesServer');
  try{
    clearServerSprites();
    dbg('Server sprites cleared');
    res.json({ok:true});
  }catch(err){
    dbg('Error clearing server sprites:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Admin: Restart server
app.post('/api/admin/restartServer', requireAdminAuth, (req,res)=>{
  try{
    res.json({ok:true, message:'Server restarting...'});
    // Exit immediately - the parent PowerShell script will restart us
    process.exit(0);
  }catch(err){
    res.status(500).json({error: err.message});
  }
});

// Health check
app.get('/healthz', (req,res)=>{
  dbg('GET /healthz');
  res.json({status:'ok'});
});

// Dashboard presence tracking
let dashboardLastSeen = null;
app.get('/api/dashboard/ping', (req,res)=>{
  dashboardLastSeen = Date.now();
  dbg('GET /api/dashboard/ping');
  res.json({status:'ok', timestamp: dashboardLastSeen});
});

app.get('/api/dashboard/isOpen', (req,res)=>{
  dbg('GET /api/dashboard/isOpen');
  // Consider dashboard open if seen in last 10 seconds
  const isOpen = dashboardLastSeen && (Date.now() - dashboardLastSeen) < 10000;
  res.json({isOpen, lastSeen: dashboardLastSeen});
});

// Chat: Bot respond to a user (used by overlay for commands like !skins)
app.post('/api/chat/respond', (req,res) => {
  const { username, message } = req.body;
  console.log('[SERVER DEBUG] /api/chat/respond called:', { username, message, twitchState: twitchClient ? twitchClient.readyState() : 'null' });
  if(!username || !message) {
    console.log('[SERVER DEBUG] Missing username or message');
    return res.status(400).json({error: 'missing username or message'});
  }
  try {
    const state = twitchClient && twitchClient.readyState ? twitchClient.readyState() : null;
    console.log('[SERVER DEBUG] Twitch state:', state);
    if(twitchClient && state && (state === 1 || state === 'OPEN')) {
      const fullMessage = `@${username}, ${message}`;
      console.log('[SERVER DEBUG] Sending to Twitch:', fullMessage);
      twitchClient.say(cfg.channel, fullMessage).then(() => {
        console.log('[SERVER DEBUG] Message sent successfully');
        res.json({ok:true});
      }).catch(err => {
        console.error('[SERVER DEBUG] Failed to send message:', err.message);
        res.status(500).json({error: err.message});
      });
    } else {
      console.log('[SERVER DEBUG] Twitch not connected. State:', state);
      res.status(400).json({error: 'Twitch not connected'});
    }
  } catch(err) {
    console.error('[SERVER DEBUG] Exception:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if(!res.headersSent) res.status(500).json({error: 'Internal error'});
});

// Start server
const server = app.listen(port, () => {
  console.log(`✓ Server running on http://localhost:${port}`);
  console.log(`✓ Dashboard: http://localhost:${port}/`);
  console.log(`✓ Overlay: http://localhost:${port}/overlay/overlay.html`);
  
  // Clear sprites on startup
  clearServerSprites();
  console.log('✓ Cleared all sprites on startup');
  
  // Auto-open browser to admin panel (if enabled, default true)
  if(cfg.autoOpenBrowser !== false){
    setTimeout(async () => {
      try{
        const url = `http://localhost:${port}/`;
        
        // Check if dashboard is already open by querying our presence tracker
        // Retry up to 5 times over 3 seconds to give dashboard time to start
        let isOpen = false;
        for(let i = 0; i < 5; i++){
          try{
            const checkRes = await axios.get(`http://localhost:${port}/api/dashboard/isOpen`, { timeout: 500 });
            if(checkRes.data && checkRes.data.isOpen){
              isOpen = true;
              break;
            }
          }catch(e){
            // Check failed, continue to retry
            dbg('Dashboard presence check attempt ' + (i+1) + ' failed:', e.message);
          }
          // Wait 600ms before next retry
          await new Promise(resolve => setTimeout(resolve, 600));
        }
        
        if(isOpen){
          console.log('✓ Dashboard already open, skipping browser launch');
          return;
        }
        
        // Dashboard not open, launch browser
        console.log('→ Opening dashboard in browser:', url);
        if(process.platform === 'win32'){
          exec(`start "" "${url}"`);
        } else if(process.platform === 'darwin'){
          exec(`open "${url}"`);
        } else {
          exec(`xdg-open "${url}"`);
        }
      }catch(e){
        console.log('✓ Open browser manually:', `http://localhost:${port}/`);
      }
    }, 1000);
  } else {
    console.log('✓ Auto-open browser disabled. Open manually:', `http://localhost:${port}/`);
  }
});

server.on('error', (err) => {
  if(err.code === 'EADDRINUSE'){
    console.error(`✗ Port ${port} in use. Change in .env`);
  }
});

// WebSocket
const wss = new WebSocket.Server({ server });
function broadcast(obj){
  const s = JSON.stringify(obj);
  wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(s); });
}

// Use nameLengthLimit from overlay config (defaults to 32)
const getNameLengthLimit = () => (cfg.overlay && cfg.overlay.nameLengthLimit) || DEFAULT_OVERLAY.nameLengthLimit || 20;

// In-memory authoritative sprite state (not persisted to disk)
const serverSprites = new Map();
const serverSpawnTimes = new Map();
const serverStartTime = Date.now();

// Get user's assigned skin from database
function getUserSkinFromDB(userId) {
  try {
    const row = db.prepare('SELECT assigned_skin FROM users WHERE id = ?').get(userId.toLowerCase());
    return row ? row.assigned_skin : 'default';
  } catch (e) {
    dbg('Error fetching user skin:', e.message);
    return 'default';
  }
}

// Server-side command processing (authoritative spawning)
function processServerCommand(username, text, tags) {
  const cmd = text.trim().split(' ')[0].toLowerCase();
  const args = text.trim().split(' ').slice(1);
  const userId = username.toLowerCase();
  const skin = getUserSkinFromDB(userId);
  const now = Date.now();
  let stateChanged = false;
  let response = null;
  
  // Constants (from overlay config)
  const MAX_SPRITES = (cfg.overlay && cfg.overlay.maxSprites) || 1500;
  const MAX_SPAWN_QUANTITY = (cfg.overlay && cfg.overlay.maxSpawnQuantity) || 100;
  const SPAWN_THROTTLE_MS = (cfg.overlay && cfg.overlay.spawnThrottleMs) || 700;
  const SPRITE_SIZE_MIN = 30;
  const SPRITE_SIZE_MAX = 80;
  const GROUND_Y = (cfg.overlay && cfg.overlay.groundY) || 920;
  const W = (cfg.overlay && cfg.overlay.canvasWidth) || 1920;
  
  // Spawn helper function
  function spawnSprite(name, skinId) {
    const uniqueId = name.toLowerCase();
    
    // Check if already exists
    if (serverSprites.has(uniqueId)) {
      const sprite = serverSprites.get(uniqueId);
      sprite.lastActivity = now;
      if (sprite.skin !== skinId) {
        sprite.skin = skinId;
      }
      return sprite;
    }
    
    // Check sprite limit
    if (serverSprites.size >= MAX_SPRITES) {
      // Remove oldest 5%
      const arr = Array.from(serverSprites.values()).sort((a, b) => a.createdAt - b.createdAt);
      const removeCount = Math.max(1, Math.floor(arr.length * 0.05));
      for (let i = 0; i < removeCount; i++) {
        serverSprites.delete(arr[i].id);
      }
    }
    
    // Create new sprite
    const newSprite = {
      id: uniqueId,
      username: name,
      skin: skinId,
      state: 'idle',
      createdAt: now,
      lastActivity: now
    };
    serverSprites.set(uniqueId, newSprite);
    stateChanged = true;
    return newSprite;
  }
  
  if (cmd === '!jump') {
    // Jump command - apply to user's own sprite if it exists
    if (serverSprites.has(userId)) {
      const sprite = serverSprites.get(userId);
      sprite.lastActivity = now;
      // Note: velocity not stored server-side, will be applied client-side
      stateChanged = true;
      broadcast({ type: 'cmd', cmd: 'jump', username: username });
      // No chat response for !jump
    } else {
      response = 'You need to appear first!';
    }
  } else if (cmd === '!sit') {
    if (serverSprites.has(userId)) {
      const sprite = serverSprites.get(userId);
      sprite.state = 'sit';
      sprite.lastActivity = now;
      stateChanged = true;
      // No chat response for !sit
    } else {
      response = 'You need to appear first!';
    }
  } else if (cmd === '!unsit') {
    if (serverSprites.has(userId)) {
      const sprite = serverSprites.get(userId);
      sprite.state = 'idle';
      sprite.lastActivity = now;
      stateChanged = true;
      // No chat response for !unsit
    } else {
      response = 'You need to appear first!';
    }
  } else if (cmd === '!boom') {
    // Boom - broadcast explosion effect to all clients
    dbg('Boom command - broadcasting explosion effect');
    broadcast({ type: 'cmd', cmd: 'boom' });
    // No chat response for !boom
  } else if (cmd === '!skin') {
    if (args[0]) {
      const allSkins = detectSkinsFromAssets();
      const validSkin = allSkins.find(s => s.id === args[0]);
      if (validSkin) {
        // Update user's assigned skin in database
        try {
          db.prepare('UPDATE users SET assigned_skin = ? WHERE id = ?').run(args[0], userId);
          // Update existing sprite if present
          if (serverSprites.has(userId)) {
            const sprite = serverSprites.get(userId);
            sprite.skin = args[0];
            sprite.lastActivity = now;
            stateChanged = true;
          }
          response = `${username}'s skin changed to ${args[0]}`;
        } catch (e) {
          response = 'Failed to change skin.';
        }
      } else {
        response = `Invalid skin: ${args[0]}`;
      }
    } else {
      response = 'Usage: !skin <skinname>';
    }
  } else if (cmd === '!skins') {
    const skinList = detectSkinsFromAssets().map(s => s.id).sort();
    response = `Available skins: ${skinList.join(', ')}`;
  } else if (cmd === '!spawn') {
    // Only allow broadcaster, mods, or bot to spawn
    const isBroadcaster = tags?.badges?.broadcaster || username.toLowerCase() === (cfg.channel || '').toLowerCase();
    const isBot = username === cfg.botUsername;
    const isMod = tags?.mod === '1' || tags?.badges?.moderator;
    
    if (isBroadcaster || isBot || isMod) {
      let quantity = 1;
      let skinIndex = 0;
      let nameIndex = 1;
      
      if (args[0] && /^\d+$/.test(args[0])) {
        quantity = Math.min(MAX_SPAWN_QUANTITY || 100, Math.max(1, parseInt(args[0], 10)));
        skinIndex = 1;
        nameIndex = 2;
      }
      
      const targetSkin = (args[skinIndex] && detectSkinsFromAssets().some(s => s.id === args[skinIndex])) ? args[skinIndex] : 'default';
      let targetName = args[nameIndex] ? args[nameIndex].trim() : '';
      if (!targetName) {
        targetName = 'Sprite_' + Math.random().toString(36).substring(2, 8);
      } else {
        targetName = targetName.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, getNameLengthLimit());
      }
      
      for (let i = 0; i < quantity; i++) {
        const uniqueName = quantity > 1 ? targetName + '_' + (i + 1) : targetName;
        spawnSprite(uniqueName, targetSkin);
      }
      
      response = `Spawned ${quantity} ${targetSkin === 'default' ? 'sprite' : targetSkin + ' sprite'}`;
    } else {
      response = 'Only broadcaster/mods can use !spawn';
    }
  }
  
  return { result: response, stateChanged: stateChanged };
}

// Update server-side sprite state (called when user sends chat message)
function updateServerSprite(username, tags) {
  const userId = username.toLowerCase();
  const skin = getUserSkinFromDB(userId);
  
  // For backward compatibility, also check for any existing sprites with this username
  // to maintain the single-sprite-per-user model for regular chat messages
  // But for spawned sprites, the client sends the full ID which should be preserved
  // This function is only called from chat messages, not from spriteUpdate
  // So we keep the original behavior here.
  if (serverSprites.has(userId)) {
    const sprite = serverSprites.get(userId);
    sprite.lastActivity = Date.now();
    if (sprite.skin !== skin) {
      sprite.skin = skin;
    }
  } else {
    serverSprites.set(userId, {
      id: userId,
      username: username,
      skin: skin,
      createdAt: Date.now(),
      lastActivity: Date.now()
    });
  }
  
  broadcastSpriteState();
}

// Broadcast full sprite state to all connected clients
function broadcastSpriteState() {
  const spriteArray = Array.from(serverSprites.values()).map(sprite => ({
    id: sprite.id,
    username: sprite.username,
    skin: sprite.skin,
    state: sprite.state || 'idle',
    createdAt: sprite.createdAt,
    lastActivity: sprite.lastActivity
  }));
  
  broadcast({
    type: 'spriteState',
    sprites: spriteArray,
    timestamp: Date.now()
  });
}

// Send sprite state to a specific client (for initial sync)
function sendSpriteStateToClient(ws) {
  const spriteArray = Array.from(serverSprites.values()).map(sprite => ({
    id: sprite.id,
    username: sprite.username,
    skin: sprite.skin,
    state: sprite.state || 'idle',
    createdAt: sprite.createdAt,
    lastActivity: sprite.lastActivity
  }));
  
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'spriteState',
      sprites: spriteArray,
      timestamp: Date.now()
    }));
  }
}

// Clear all server-side sprites (for admin command)
function clearServerSprites() {
  serverSprites.clear();
  serverSpawnTimes.clear();
  broadcastSpriteState();
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  dbg('WebSocket client connected');
  
  // Send current sprite state to newly connected client
  sendSpriteStateToClient(ws);
  
  // Send initial config/environment data
  ws.send(JSON.stringify({
    type: 'config',
    data: cfg
  }));
  
  // Handle messages from clients
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'cmd' && msg.cmd === 'clearSprites') {
        dbg('clearSprites command received from client');
        clearServerSprites();
      } else if (msg.type === 'spriteUpdate') {
        // Client notifies server about sprite spawn/update
        dbg('spriteUpdate received from client:', msg);
        const spriteId = msg.id; // Full unique ID (e.g., 'cat_1', 'bunbun_2')
        const username = msg.username;
        const skin = msg.skin || 'default';
        const state = msg.state || 'idle';
        const now = Date.now();
        const clientCreatedAt = msg.createdAt || now;
        
        // Ignore sprites created before server startup (stale from previous server instance)
        if (clientCreatedAt < serverStartTime) {
          dbg('Ignoring stale spriteUpdate from client:', spriteId, 'created:', new Date(clientCreatedAt).toISOString());
          // Still broadcast current state to ensure client syncs with server
          broadcastSpriteState();
          return;
        }
        
        if (serverSprites.has(spriteId)) {
          // Update existing
          const sprite = serverSprites.get(spriteId);
          sprite.lastActivity = now;
          if (sprite.skin !== skin) {
            sprite.skin = skin;
          }
          if (sprite.state !== state) {
            sprite.state = state;
          }
        } else {
          // Create new - use the full ID as the key to preserve multiple sprites
          serverSprites.set(spriteId, {
            id: spriteId,
            username: username,
            skin: skin,
            state: state,
            createdAt: clientCreatedAt,
            lastActivity: now
          });
        }
        
        // Broadcast updated state to all clients
        broadcastSpriteState();
      } else if (msg.type === 'fullState') {
        // Client sends full current state to server (for initial sync after reconnect)
        const spritesArray = msg.sprites || [];
        dbg('fullState received from client:', spritesArray.length, 'sprites');
        const now = Date.now();
        let changed = false;
        
        for (const clientSprite of spritesArray) {
          const spriteId = clientSprite.id; // Use full ID as key
          const skin = clientSprite.skin || 'default';
          const state = clientSprite.state || 'idle';
          const clientCreatedAt = clientSprite.createdAt || now;
          
          // Ignore sprites created before server startup (stale from previous server instance)
          if (clientCreatedAt < serverStartTime) {
            dbg('Ignoring stale sprite from client:', spriteId, 'created:', new Date(clientCreatedAt).toISOString());
            continue;
          }
          
          if (serverSprites.has(spriteId)) {
            // Update existing
            const sprite = serverSprites.get(spriteId);
            sprite.lastActivity = now;
            if (sprite.skin !== skin) {
              sprite.skin = skin;
              changed = true;
            }
            if (sprite.state !== state) {
              sprite.state = state;
              changed = true;
            }
          } else {
            // Create new - preserve the full ID from client
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
          broadcastSpriteState();
        }
      }
    } catch (e) {
      dbg('WebSocket message parse error:', e);
    }
  });
});

// Periodic cleanup of stale sprites (every minute)
setInterval(() => {
  const now = Date.now();
  const lifetime = (cfg.overlay && cfg.overlay.spriteLifetimeMs) || 30 * 60 * 1000;
  let changed = false;
  for (const [id, sprite] of serverSprites) {
    if (now - sprite.lastActivity > lifetime) {
      serverSprites.delete(id);
      changed = true;
    }
  }
  if (changed) {
    dbg('Cleaned up old sprites');
    broadcastSpriteState();
  }
}, 60 * 1000);

// Twitch bot
let twitchClient = null;
let botTokenInfo = null;
let reconnectTimeout = null;

async function connectTwitchBot(){
  if(!cfg.twitch.botOAuthToken || cfg.twitch.botOAuthToken === 'oauth:your_bot_oauth_token_here'){
    console.log('⚠ No bot token. Get it via the admin panel UI');
    return;
  }
  if(twitchClient && twitchClient.readyState && (twitchClient.readyState() === 1 || twitchClient.readyState() === 'OPEN')) {
    dbg('Twitch bot already connected');
    return;
  }
  
  // Ensure any existing client is disconnected to prevent duplicates
  if (twitchClient) {
    try {
      const state = twitchClient.readyState ? twitchClient.readyState() : null;
      if (state === 1 || state === 'OPEN') {
        await twitchClient.disconnect();
      }
    } catch (e) {
      dbg('Error disconnecting old Twitch client:', e.message);
    }
  }
  
  const twitchDebug = cfg.debug?.twitchDebug || false;
  const messagesLogLevel = cfg.debug?.verboseMessages ? 'debug' : 'warn';
  
  const opts = {
    options:{debug: twitchDebug, messagesLogLevel: messagesLogLevel},
    connection:{secure:true, reconnect:false},
    channels: [cfg.channel],
    identity: { username: cfg.botUsername, password: cfg.twitch.botOAuthToken }
  };
  
  twitchClient = new tmi.Client(opts);
  
  // Apply filtered logger if auth errors should be filtered
  if (cfg.debug?.twitchAuthErrors === false && twitchClient.log) {
    twitchClient.log = new FilteredLogger(twitchClient.log);
  }

  twitchClient.on('message', async (channel, tags, message, self) => {
    if(self) return;
    const rawUsername = tags['display-name'] || tags['username'] || 'anon';
    const username = rawUsername.replace(/[^\p{L}\p{N}_]/gu, '_'); // Support Unicode letters (Chinese, etc.)
    const displayName = rawUsername;
    dbg('Twitch message from:', username, ':', message);
    
    // Check if user is excluded
    try {
      const excluded = db.prepare('SELECT id FROM excluded_users WHERE id = ?').get(username.toLowerCase());
      if(excluded) {
        // User is excluded, do not broadcast or track
        dbg(`Excluded user ${username} ignored`);
        return;
      }
      
      // Track user in database (create if doesn't exist)
      // Use INSERT OR REPLACE with COALESCE to preserve existing skin
      db.prepare("INSERT OR REPLACE INTO users (id, display_name, assigned_skin) VALUES (?,?,COALESCE((SELECT assigned_skin FROM users WHERE id=?), 'default'))")
        .run(username.toLowerCase(), displayName, username.toLowerCase());
      
      // Update server-side sprite state for the chatting user
      updateServerSprite(username, tags);
      
      // Check if message is a command and process it server-side
      const text = message.trim();
      const isCommand = text.startsWith('!');
      let commandResult = null;
      let stateChanged = false;
      
      if (isCommand) {
        dbg('Processing command on server:', text);
        commandResult = processServerCommand(username, text, tags);
        if (commandResult) {
          stateChanged = commandResult.stateChanged;
          // Send response to Twitch chat if command returned a message
          if (commandResult.result) {
            const responseMsg = `@${username}, ${commandResult.result}`;
            twitchClient.say(cfg.channel, responseMsg).catch(err => {
              dbg('Failed to send command response:', err.message);
            });
          }
        }
      }
      
      // Broadcast chat to clients with metadata
      // Merge skipSpawn, isCommand, commandResult into tags so they're passed to onChat
      const chatTags = {
        ...tags,
        skipSpawn: isCommand, // only skip spawn for commands (server-authoritative)
        isCommand: isCommand,
        commandResult: commandResult
      };
      const chatMsg = {
        type: 'chat',
        username,
        message: text,
        tags: chatTags
      };
      broadcast(chatMsg);
      dbg('Message broadcasted to overlay clients');
      
      // If state changed (from command or normal chat), broadcast updated state
      if (stateChanged) {
        broadcastSpriteState();
        dbg('Sprite state broadcasted');
      }
    } catch (err) {
      dbg('DB error:', err.message);
    }
  });

  twitchClient.on('connected', (addr) => {
    dbg(`Twitch connected to ${addr}`);
    if(reconnectTimeout) clearTimeout(reconnectTimeout);
  });

  twitchClient.on('disconnected', () => {
    dbg('Twitch disconnected');
    // Not automatically reconnecting - manual reconnect required via admin panel
  });

  twitchClient.on('error', (err) => {
    dbg('Twitch error:', err.message);
  });

  twitchClient.connect().catch((err) => {
    dbg('Twitch connection failed:', err.message);
    // Not automatically reconnecting - manual reconnect required via admin panel
  });

  // Token refresh every 30 min
  setInterval(async ()=>{
    if(botTokenInfo && Date.now() > (botTokenInfo.expires_at - 3600000)){
      dbg('Refreshing token...');
      try{
        const params = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: botTokenInfo.refresh_token,
          client_id: cfg.twitch.clientId,
          client_secret: cfg.twitch.clientSecret
        });
        const resp = await axios.post('https://id.twitch.tv/oauth2/token', params.toString());
        const {access_token, refresh_token, expires_in} = resp.data;
        botTokenInfo = {access_token, refresh_token, expires_at: Date.now() + (expires_in * 1000)};
        cfg.twitch.botOAuthToken = access_token;
        
        // Save to disk if persistOAuthToken is enabled
        if(cfg.persistOAuthToken) {
          try {
            fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
            dbg('Token refreshed and saved to .env');
          } catch(e) {
            dbg('Token refreshed but failed to save to config:', e.message);
          }
        } else {
          dbg('Token refreshed in memory only (persistOAuthToken=false)');
        }
        
        if(twitchClient){
          try {
            const state = twitchClient.readyState ? twitchClient.readyState() : null;
            if (state === 1 || state === 'OPEN') {
              twitchClient.disconnect().catch(e => {
                dbg('Error disconnecting Twitch client during token refresh:', e.message);
              });
            }
          } catch (e) {
            dbg('Error during token refresh disconnect check:', e.message);
          }
          twitchClient.opts.identity.password = access_token;
          setTimeout(() => twitchClient.connect(), 2000);
        }
      }catch(e){
        dbg('Token refresh failed:', e.message);
      }
    }
  }, 30 * 60 * 1000);
}

// Automatic reconnection disabled - use admin panel to reconnect manually
// function scheduleReconnect(){
//   if(reconnectTimeout) clearTimeout(reconnectTimeout);
//   reconnectTimeout = setTimeout(connectTwitchBot, 5000);
// }

// Get user's assigned skin from database
function getUserSkinFromDB(userId) {
  try {
    const row = db.prepare('SELECT assigned_skin FROM users WHERE id = ?').get(userId.toLowerCase());
    return row ? row.assigned_skin : 'default';
  } catch (e) {
    dbg('Error fetching user skin:', e.message);
    return 'default';
  }
}

// Update server-side sprite state (called when user sends chat message)
function updateServerSprite(username, tags) {
  const userId = username.toLowerCase();
  const skin = getUserSkinFromDB(userId);
  
  // Check if sprite already exists
  if (serverSprites.has(userId)) {
    const sprite = serverSprites.get(userId);
    // Update last activity
    sprite.lastActivity = Date.now();
    // Update skin if changed
    if (sprite.skin !== skin) {
      sprite.skin = skin;
    }
    // State is preserved from previous interactions (e.g., sit command)
  } else {
    // Create new sprite entry with minimal state
    // Position will be randomized on client side
    serverSprites.set(userId, {
      id: userId,
      username: username,
      skin: skin,
      state: 'idle',
      createdAt: Date.now(),
      lastActivity: Date.now()
      // Note: x, y, vx, vy, etc. are managed by client physics
      // Server only tracks existence and skin assignment
    });
  }
  
  // Broadcast updated sprite state to all clients
  broadcastSpriteState();
}

if(cfg.useServer){
  dbg('useServer=true - connecting Twitch bot');
  connectTwitchBot();
} else {
  dbg('useServer=false - no Twitch connection');
  console.log('⚠ useServer=false - no Twitch connection');
}

// Graceful shutdown
async function shutdown(signal) {
  dbg(`Shutting down (${signal})...`);
  
  // Handle OAuth token based on persistOAuthToken setting
  if(cfg && cfg.twitch) {
    if(!cfg.persistOAuthToken) {
      // Clear token from memory and disk if not persisting
      cfg.twitch.botOAuthToken = '';
      try {
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        dbg('OAuth token cleared from .env (persistOAuthToken=false)');
      } catch(e) {
        dbg('Failed to clear OAuth token:', e.message);
      }
    } else {
      // Token is persisted, keep it in config
      dbg('OAuth token preserved in .env (persistOAuthToken=true)');
    }
  }
  
  if(twitchClient) {
    try {
      const state = twitchClient.readyState ? twitchClient.readyState() : null;
      if (state === 1 || state === 'OPEN') {
        await twitchClient.disconnect();
      }
    } catch (e) {
      dbg('Error disconnecting Twitch client during shutdown:', e.message);
    }
  }
  db.close(() => {
    dbg('Database closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// OAuth for bot token generation
app.get('/auth/twitch', (req,res)=>{
  dbg('GET /auth/twitch - redirecting to Twitch OAuth');
  const state = req.query.state || 'random';
  // Build OAuth Redirect URL (must match the one configured in Twitch Dev Console)
  const oauthRedirectUrl = `http://localhost:${cfg.serverPort || 8080}/auth/callback`;
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${cfg.twitch.clientId}&redirect_uri=${encodeURIComponent(oauthRedirectUrl)}&response_type=code&scope=${encodeURIComponent('chat:read chat:edit')}&state=${state}`;
  res.redirect(url);
});

app.get('/auth/callback', async (req,res)=>{
  dbg('GET /auth/callback - OAuth callback received');
  const {code, state} = req.query;
  if(!code) {
    dbg('Missing code in callback');
    return res.status(400).send('Missing code');
  }
  try{
    dbg('Exchanging code for token');
    // Build OAuth Redirect URL (must match what Twitch expects)
    const oauthRedirectUrl = `http://localhost:${cfg.serverPort || 8080}/auth/callback`;
    const params = new URLSearchParams({
      client_id: cfg.twitch.clientId,
      client_secret: cfg.twitch.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: oauthRedirectUrl
    });
    const tokenResp = await axios.post('https://id.twitch.tv/oauth2/token', params.toString(), {
      headers: {'Content-Type': 'application/x-www-form-urlencoded'}
    });
    const {access_token, refresh_token, expires_in} = tokenResp.data;
    cfg.twitch.botOAuthToken = access_token;
    botTokenInfo = {access_token, refresh_token, expires_at: Date.now() + (expires_in * 1000)};
    
    // Save to disk if persistOAuthToken is enabled
    if(cfg.persistOAuthToken) {
      try {
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        dbg('OAuth token saved to .env (persistOAuthToken=true)');
      } catch(e) {
        dbg('Failed to save token to config:', e.message);
      }
    } else {
      dbg('OAuth token stored in memory only (persistOAuthToken=false)');
    }
    
    // After successful OAuth, redirect to the dashboard on the correct port (serverPort)
    const dashboardUrl = `http://localhost:${cfg.serverPort || 8080}/`;
    res.send(`
      <html><body style="font-family:sans-serif;padding:20px;background:#111;color:#fff">
        <h2>✓ OAuth Token Generated</h2>
        <p>Token ${cfg.persistOAuthToken ? 'saved to .env' : 'stored in memory only'}</p>
        <p><a href="${dashboardUrl}" style="color:#0af">Go to Admin Dashboard</a></p>
        <p>Redirecting in 3 seconds...</p>
        <script>
          setTimeout(() => {
            window.location.href = "${dashboardUrl}";
          }, 3000);
        </script>
      </body></html>
    `);
  }catch(e){
    dbg('OAuth callback error:', e.message);
    res.status(500).send('OAuth failed: ' + (e.response?.data?.message || e.message));
  }
});
