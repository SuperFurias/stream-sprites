// Connection handling module (WebSocket and tmi.js fallback)
function dbg(...args) {
  console.log('[CONNECTION]', ...args);
}

export function setupWebSocket(WS_URL, onMessage, onOpen) {
  dbg('Setting up WebSocket to:', WS_URL);
  let ws = null;
  let reconnectIntervalId = null;
  let isConnected = false;
  
  function connect() {
    dbg('Connecting WebSocket...');
    try {
      ws = new WebSocket(WS_URL);
      
      ws.addEventListener('open', () => {
        dbg('WebSocket opened');
        isConnected = true;
        if (onOpen) onOpen();
      });
      
      ws.addEventListener('message', (ev) => {
        try {
          const data = JSON.parse(ev.data);
          dbg('WebSocket message received:', data);
          onMessage(data);
        } catch (e) {
          dbg('WebSocket parse error:', e);
        }
      });
      
      ws.addEventListener('close', () => {
        dbg('WebSocket closed');
        isConnected = false;
        startReconnectLoop();
      });
      
      ws.addEventListener('error', (err) => {
        dbg('WebSocket error:', err);
        isConnected = false;
      });
      
    } catch (e) {
      dbg('WebSocket connection failed:', e);
      isConnected = false;
      startReconnectLoop();
    }
  }
  
  function startReconnectLoop() {
    dbg('Starting reconnect loop');
    if (reconnectIntervalId) {
      clearInterval(reconnectIntervalId);
    }
    
    reconnectIntervalId = setInterval(() => {
      if (!isConnected) {
        dbg('Attempting to reconnect to server...');
        connect();
      }
    }, 5000);
  }
  
  function stopReconnectLoop() {
    dbg('Stopping reconnect loop');
    if (reconnectIntervalId) {
      clearInterval(reconnectIntervalId);
      reconnectIntervalId = null;
    }
  }
  
  // Expose control functions
  const connection = {
    connect: connect,
    stopReconnectLoop: stopReconnectLoop,
    getWebSocket: () => ws,
    isConnected: () => isConnected,
    send: (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      } else {
        dbg('Cannot send: WebSocket not open');
      }
    }
  };
  
  // Start initial connection
  connect();
  
  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    stopReconnectLoop();
    if (ws) {
      ws.close();
    }
  });
  
  return connection;
}

export function setupTmiFallback(cfg, onMessage) {
  dbg('Setting up TMI fallback');
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/tmi.js@1.8.5/dist/tmi.min.js';
  script.onload = () => {
    dbg('TMI script loaded, connecting...');
    const opts = {
      options: { debug: false },
      connection: { reconnect: true, secure: true },
      channels: [cfg.channel]
    };
    if (cfg.oauth && cfg.botUsername) {
      opts.identity = { username: cfg.botUsername, password: cfg.oauth };
    }
    const client = new tmi.Client(opts);
    client.on('message', (channel, tags, message, self) => {
      if (self) return;
      const name = tags['display-name'] || tags['username'];
      onMessage(name, message, tags, 'chat');
    });
    client.on('connected', (addr) => {
      dbg('TMI connected to:', addr);
    });
    client.on('disconnected', () => {
      dbg('TMI disconnected');
    });
    client.on('error', (err) => {
      dbg('TMI error:', err);
    });
    client.connect().catch(e => dbg('TMI connection error:', e));
  };
  document.head.appendChild(script);
}

export function handleWebSocketMessage(data, onChat, onCommand, onSpriteState) {
  dbg('handleWebSocketMessage:', data);
  if (data.type === 'chat') {
    onChat(data.username, data.message, data.tags || {});
  } else if (data.type === 'cmd') {
    if (data.cmd === 'clearSprites') {
      dbg('clearSprites command');
      onCommand('clearSprites', data);
    } else if (data.cmd === 'refresh') {
      const delay = Math.random() * 1000;
      dbg(`Overlay refresh scheduled in ${delay.toFixed(0)}ms`);
      setTimeout(() => {
        dbg('Reloading overlay page...');
        window.location.reload();
      }, delay);
    } else if (data.cmd === 'boom') {
      dbg('boom command received from server');
      onCommand('boom', data);
    } else if (data.cmd === 'sit') {
      dbg('sit command received from server');
      onCommand('sit', data);
    } else if (data.cmd === 'unsit') {
      dbg('unsit command received from server');
      onCommand('unsit', data);
    } else if (data.cmd === 'jump') {
      dbg('jump command received from server');
      onCommand('jump', data);
    }
  } else if (data.type === 'spriteState' && onSpriteState) {
    dbg('spriteState update received');
    onSpriteState(data);
  }
}
