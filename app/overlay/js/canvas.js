// Canvas setup and management module
import { GROUND_Y_MULTIPLIER } from './config.js';

export function setupCanvas() {
  const canvas = document.getElementById('overlayCanvas');
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 12px system-ui, Arial';
  const DPR = window.devicePixelRatio || 1;
  
  return { canvas, ctx, DPR };
}

export function resizeCanvas(canvas, ctx, DPR, W, H, GROUND_Y, sprites, serverW, serverH, serverGroundY) {
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  
  canvas.width = winW * DPR;
  canvas.height = winH * DPR;
  canvas.style.width = winW + 'px';
  canvas.style.height = winH + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  
  return { W: serverW, H: serverH, GROUND_Y: serverGroundY };
}

export function initializeCanvasDisplay(cfg) {
  document.getElementById('channelName').textContent = cfg.channel || '--';
  document.getElementById('mode').textContent = 'server';
}
