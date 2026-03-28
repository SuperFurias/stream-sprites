// Canvas setup and management module
import { GROUND_Y_MULTIPLIER } from './config.js';

export function setupCanvas() {
  const canvas = document.getElementById('overlayCanvas');
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 12px system-ui, Arial';
  const DPR = window.devicePixelRatio || 1;
  
  return { canvas, ctx, DPR };
}

export function resizeCanvas(canvas, ctx, DPR, W, H, GROUND_Y, sprites, USE_SERVER, serverW, serverH, serverGroundY) {
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  
  // Canvas always matches window size for correct input handling
  canvas.width = winW * DPR;
  canvas.height = winH * DPR;
  canvas.style.width = winW + 'px';
  canvas.style.height = winH + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  
  if (USE_SERVER) {
    // Server mode: return server dimensions (physics coords stay in server space)
    // The render function will scale server coords to screen coords
    return { W: serverW, H: serverH, GROUND_Y: serverGroundY };
  }
  
  // Local mode: canvas matches window (original behavior)
  const oldGroundY = GROUND_Y;
  const newGROUND_Y = winH * GROUND_Y_MULTIPLIER;
  
  for (const sprite of sprites.values()) {
    const offsetFromGround = sprite.y - oldGroundY;
    sprite.y = newGROUND_Y + offsetFromGround;
  }
  
  return { W: winW, H: winH, GROUND_Y: newGROUND_Y };
}

export function initializeCanvasDisplay(cfg, USE_SERVER) {
  document.getElementById('channelName').textContent = cfg.channel || '--';
  document.getElementById('mode').textContent = USE_SERVER ? 'server' : 'client';
}
