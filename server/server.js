// server.js - Simple Stream Sprites with Skin Assignment
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

const cfgPath = path.join(__dirname, 'config.json');

// Load config
let cfg;
function loadConfig(){
  try{
    if(fs.existsSync(cfgPath)){
      cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      console.log('✓ Loaded config from config.json');
      return true;
    }
  }catch(e){
    console.warn('⚠ config.json invalid:', e.message);
  }
  
  // If config.json doesn't exist, create it with default values
  const defaultCfg = {
    useServer: true,
    serverPort: 3000,
    debug: {
      serverDebug: false,
      twitchDebug: false,
      twitchAuthErrors: false,
      twitchOtherErrors: false,
      verboseMessages: false,
      logToFile: false
    },
    twitch: {
      clientId: "",
      clientSecret: "",
      botOAuthToken: "",
      redirectUri: "http://localhost:3000/auth/callback"
    },
    channel: "",
    botUsername: "",
    persistOAuthToken: false
  };
  
  try{
    fs.writeFileSync(cfgPath, JSON.stringify(defaultCfg, null, 2));
    cfg = defaultCfg;
    console.log('✓ Created default config.json');
    return true;
  }catch(e){
    console.error('✗ Failed to create config.json:', e.message);
  }
  
  return false;
}

loadConfig();
if(!cfg) process.exit(1);

// On startup: if persistOAuthToken is false, clear any existing token from disk
if(cfg.persistOAuthToken === false && cfg.twitch?.botOAuthToken) {
  try {
    cfg.twitch.botOAuthToken = '';
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    console.log('✓ Cleared OAuth token from config.json (persistOAuthToken=false)');
  } catch(e) {
    console.error('✗ Failed to clear OAuth token on startup:', e.message);
  }
}

// Initialize file logger if logToFile is enabled
if (cfg.debug?.logToFile) {
  initFileLogger();
}

dbg('Config loaded:', { channel: cfg.channel, botUsername: cfg.botUsername, useServer: cfg.useServer, serverPort: cfg.serverPort });

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..')));
app.use('/overlay', express.static(path.join(__dirname, '..', 'overlay')));

// Serve dashboard at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
});

const port = cfg.serverPort || 3000;

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
        if(['.png', '.gif', '.jpg', '.jpeg', '.webp'].includes(ext)){
          const id = path.basename(file, ext).toLowerCase().replace(/[^a-z0-9_]/g, '_');
          detected.push({
            id: id,
            name: path.basename(file, ext),
            file: `../assets/skins/${file}`,
            price: 0,
            autoDetected: true
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

app.get('/config.json', (req,res) => {
  dbg('GET /config.json');
  // Auto-detect skins - ONLY return auto-detected, ignore config.json hardcoded skins
  const autoDetected = detectSkinsFromAssets();
  
  // Provide default overlay settings (not stored in config.json)
  const defaultOverlay = {
    canvasWidth: 1280,
    canvasHeight: 720,
    groundY: 620,
    gravity: 0.6,
    maxAvatars: 1500,
    spawnThrottleMs: 700,
    currencyPerMessage: 1
  };
  
  // Return config with auto-detected skins and default overlay (no hardcoded ones)
  const mergedCfg = { ...cfg, skins: autoDetected, overlay: defaultOverlay };
  dbg('Returning config with skins:', mergedCfg.skins.map(s => s.id));
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
  if(!userId || !skinId) {
    dbg('Missing userId or skinId');
    return res.status(400).json({error:'missing userId or skinId'});
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
    merged.twitch.redirectUri = merged.twitch.redirectUri || 'http://localhost:3000/auth/callback';
    // Don't save overlay or skins to config - they are auto-managed
    delete merged.overlay;
    delete merged.skins;
    
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

// Admin: Clear all avatars
app.post('/api/admin/clearAvatars', requireAdminAuth, (req,res)=>{
  dbg('POST /api/admin/clearAvatars');
  broadcast({type:'cmd', cmd:'clearAvatars'});
  dbg('Clear avatars command broadcasted');
  res.json({ok:true});
});

// Admin: Delete user skin assignment
app.post('/api/admin/resetUser', requireAdminAuth, (req,res)=>{
  const {id} = req.body;
  dbg('POST /api/admin/resetUser', { id });
  if(!id) {
    dbg('Missing id');
    return res.status(400).json({error:'missing id'});
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
  if(!userId) {
    dbg('Missing userId');
    return res.status(400).json({error:'missing userId'});
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
  if(!userId) {
    dbg('Missing userId');
    return res.status(400).json({error:'missing userId'});
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
  if(!userId) {
    dbg('Missing userId');
    return res.status(400).json({error:'missing userId'});
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
    console.error(`✗ Port ${port} in use. Change in config.json`);
  }
});

// WebSocket
const wss = new WebSocket.Server({ server });
function broadcast(obj){
  const s = JSON.stringify(obj);
  wss.clients.forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(s); });
}

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
      
      broadcast({type:'chat', username, message, tags});
      dbg('Message broadcasted to overlay clients');
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
    scheduleReconnect();
  });

  twitchClient.on('error', (err) => {
    dbg('Twitch error:', err.message);
  });

  twitchClient.connect().catch((err) => {
    dbg('Twitch connection failed:', err.message);
    scheduleReconnect();
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
            dbg('Token refreshed and saved to config.json');
          } catch(e) {
            dbg('Token refreshed but failed to save to config:', e.message);
          }
        } else {
          dbg('Token refreshed in memory only (persistOAuthToken=false)');
        }
        
        if(twitchClient){
          twitchClient.disconnect();
          twitchClient.opts.identity.password = access_token;
          setTimeout(() => twitchClient.connect(), 2000);
        }
      }catch(e){
        dbg('Token refresh failed:', e.message);
      }
    }
  }, 30 * 60 * 1000);
}

function scheduleReconnect(){
  if(reconnectTimeout) clearTimeout(reconnectTimeout);
  reconnectTimeout = setTimeout(connectTwitchBot, 5000);
}

if(cfg.useServer){
  dbg('useServer=true - connecting Twitch bot');
  connectTwitchBot();
} else {
  dbg('useServer=false - no Twitch connection');
  console.log('⚠ useServer=false - no Twitch connection');
}

// Graceful shutdown
function shutdown(signal) {
  dbg(`Shutting down (${signal})...`);
  
  // Handle OAuth token based on persistOAuthToken setting
  if(cfg && cfg.twitch) {
    if(!cfg.persistOAuthToken) {
      // Clear token from memory and disk if not persisting
      cfg.twitch.botOAuthToken = '';
      try {
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        dbg('OAuth token cleared from config.json (persistOAuthToken=false)');
      } catch(e) {
        dbg('Failed to clear OAuth token:', e.message);
      }
    } else {
      // Token is persisted, keep it in config
      dbg('OAuth token preserved in config.json (persistOAuthToken=true)');
    }
  }
  
  if(twitchClient) twitchClient.disconnect();
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
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${cfg.twitch.clientId}&redirect_uri=${encodeURIComponent(cfg.twitch.redirectUri)}&response_type=code&scope=${encodeURIComponent('chat:read chat:edit')}&state=${state}`;
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
    const params = new URLSearchParams({
      client_id: cfg.twitch.clientId,
      client_secret: cfg.twitch.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: cfg.twitch.redirectUri
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
        dbg('OAuth token saved to config.json (persistOAuthToken=true)');
      } catch(e) {
        dbg('Failed to save token to config:', e.message);
      }
    } else {
      dbg('OAuth token stored in memory only (persistOAuthToken=false)');
    }
    
    res.send(`
      <html><body style="font-family:sans-serif;padding:20px;background:#111;color:#fff">
        <h2>✓ OAuth Token Generated</h2>
        <p>Token ${cfg.persistOAuthToken ? 'saved to config.json' : 'stored in memory only'}</p>
        <p><a href="/" style="color:#0af">Go to Admin</a></p>
      </body></html>
    `);
  }catch(e){
    dbg('OAuth callback error:', e.message);
    res.status(500).send('OAuth failed: ' + (e.response?.data?.message || e.message));
  }
});
