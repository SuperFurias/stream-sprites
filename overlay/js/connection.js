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
        // Clear reconnect loop on successful connection
        if (reconnectIntervalId) {
          clearInterval(reconnectIntervalId);
          reconnectIntervalId = null;
        }
        if (onOpen) onOpen();
      });

      ws.addEventListener('message', (ev) => {
        try {
          const data = JSON.parse(ev.data);
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
    if (reconnectIntervalId) return; // Already reconnecting
    dbg('Starting reconnect loop');
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

  const connection = {
    connect,
    stopReconnectLoop,
    getWebSocket: () => ws,
    isConnected: () => isConnected,
    send: (data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      } else {
        dbg('Cannot send: WebSocket not open');
      }
    }
  };

  connect();

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
  script.crossOrigin = 'anonymous';
  script.onload = () => {
    dbg('TMI script loaded, connecting...');
    const opts = {
      options: { debug: false, tags: true },
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

// Command dispatch map (replaces if-else chain)
const COMMAND_HANDLERS = {
  clearSprites: (onCommand, data) => onCommand('clearSprites', data),
  refresh: (onCommand, data) => {
    const delay = Math.random() * 1000;
    dbg(`Overlay refresh scheduled in ${delay.toFixed(0)}ms`);
    setTimeout(() => {
      dbg('Reloading overlay page...');
      window.location.reload();
    }, delay);
  },
  boom: (onCommand, data) => onCommand('boom', data),
  sit: (onCommand, data) => onCommand('sit', data),
  unsit: (onCommand, data) => onCommand('unsit', data),
  jump: (onCommand, data) => onCommand('jump', data),
  flip: (onCommand, data) => onCommand('flip', data),
  fight: (onCommand, data) => onCommand('fight', data),
};

export function handleWebSocketMessage(data, onChat, onCommand, onSpriteState, onSpriteDelta) {
  if (data.type === 'chat') {
    onChat(data.username, data.message, data.tags || {});
  } else if (data.type === 'cmd') {
    const handler = COMMAND_HANDLERS[data.cmd];
    if (handler) {
      handler(onCommand, data);
    }
  } else if (data.type === 'physicsState' && onSpriteState) {
    // Server-authoritative physics state — treat same as spriteState
    onSpriteState(data);
  } else if (data.type === 'spriteState' && onSpriteState) {
    onSpriteState(data);
  } else if (data.type === 'spriteDelta' && onSpriteDelta) {
    onSpriteDelta(data);
  }
}
