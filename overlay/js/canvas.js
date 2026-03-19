// Canvas setup and management module
export function setupCanvas() {
  const canvas = document.getElementById('overlayCanvas');
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 12px system-ui, Arial';
  const DPR = window.devicePixelRatio || 1;
  
  return { canvas, ctx, DPR };
}

export function resizeCanvas(canvas, ctx, DPR, W, H, GROUND_Y, sprites) {
  // Make canvas exactly match window size (no aspect ratio preservation)
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  
  // Set canvas to full window size in device pixels
  canvas.width = winW * DPR;
  canvas.height = winH * DPR;
  canvas.style.width = winW + 'px';
  canvas.style.height = winH + 'px';
  
  // Update logical coordinate system to match
  const oldGroundY = GROUND_Y;
  const newW = winW;
  const newH = winH;
  const newGROUND_Y = newH * 0.99;
  
  // Adjust existing sprites to stay on the new ground
  for (const sprite of sprites.values()) {
    const offsetFromGround = sprite.y - oldGroundY;
    sprite.y = newGROUND_Y + offsetFromGround;
  }
  
  // Reset transform for new size
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  
  return { W: newW, H: newH, GROUND_Y: newGROUND_Y };
}

export function initializeCanvasDisplay(cfg, USE_SERVER) {
  document.getElementById('channelName').textContent = cfg.channel || '--';
  document.getElementById('mode').textContent = USE_SERVER ? 'server' : 'client';
}
