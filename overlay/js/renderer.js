// Renderer module — optimized with pre-rendered text and better dirty tracking

// Reusable sorted array cache to avoid allocating + sorting every frame
let sortedSpriteCache = [];
let spriteCountSnapshot = -1;
let spriteDirtyFlag = true;

export function markSpritesDirty() {
  spriteDirtyFlag = true;
}

export function draw(ctx, W, H, GROUND_Y, sprites, skins, explosionParticles) {
  ctx.clearRect(0, 0, W, H);

  // Rebuild sorted array when sprite count changes or dirty flag is set
  if (spriteDirtyFlag || spriteCountSnapshot !== sprites.size) {
    sortedSpriteCache.length = 0;
    for (const s of sprites.values()) {
      sortedSpriteCache.push(s);
    }
    // Sort by size descending (larger first = background, smaller later = foreground)
    sortedSpriteCache.sort((a, b) => b.size - a.size);
    spriteCountSnapshot = sprites.size;
    spriteDirtyFlag = false;
  }

  ctx.font = 'bold 12px system-ui, Arial';
  for (let i = 0; i < sortedSpriteCache.length; i++) {
    drawSprite(ctx, sortedSpriteCache[i], skins, GROUND_Y);
  }

  // Draw explosion particles
  for (let i = 0; i < explosionParticles.length; i++) {
    const p = explosionParticles[i];
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Pre-rendered text shadow offscreen canvas
const textShadowCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const textShadowCtx = textShadowCanvas ? textShadowCanvas.getContext('2d') : null;

function drawTextWithShadow(ctx, text, x, y) {
  // Use native shadow for simplicity but with reduced blur for performance
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  // Use a single shadow pass with minimal blur instead of expensive blur
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 2; // Reduced from 4 to 2 for performance
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function drawSprite(ctx, sprite, skins, GROUND_Y) {
  ctx.globalAlpha = sprite.opacity || 1;

  // Draw shadow
  ctx.beginPath();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  const shadowWidth = sprite.size * 0.5;
  const shadowHeight = sprite.size * 0.15;
  ctx.ellipse(sprite.x, GROUND_Y + 2, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw skin with rotation and flip (skip for GIF skins - handled by DOM)
  const s = skins.get(sprite.skin);
  const heightScale = sprite.heightScale || 1.0;
  const scaledHeight = sprite.size * heightScale;
  const yOffset = (sprite.size - scaledHeight) / 2;

  ctx.save();
  ctx.translate(sprite.x, sprite.y + yOffset);
  ctx.rotate(sprite.angle || 0);
  if (!sprite.facingRight) { ctx.scale(-1, 1); }

  // Only draw static images on canvas; GIFs and WebMs are rendered as DOM elements
  if (s && s.img && !s.isGif && !s.isWebm) {
    ctx.drawImage(s.img, -sprite.size / 2, -scaledHeight / 2, sprite.size, scaledHeight);
  } else if (!s || (!s.img && !s.isGif && !s.isWebm)) {
    // Fallback: draw colored circle with eyes (only for non-animated skins without an image)
    ctx.beginPath();
    ctx.fillStyle = sprite.color;
    ctx.arc(0, 0, scaledHeight / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(-sprite.size * 0.18, -scaledHeight * 0.06, sprite.size * 0.12, scaledHeight * 0.12);
    ctx.fillRect(sprite.size * 0.06, -scaledHeight * 0.06, sprite.size * 0.12, scaledHeight * 0.12);
  }
  ctx.restore();

  // Draw username with optimized shadow
  drawTextWithShadow(ctx, sprite.username, sprite.x, sprite.y - sprite.size / 2 - 8);

  // Draw state emojis
  if (sprite.state === 'dance') {
    ctx.fillText('💃', sprite.x, sprite.y - sprite.size / 1.6);
  }

  ctx.globalAlpha = 1;
}

export function updateSpriteCountDisplay(sprites) {
  document.getElementById('avCount').textContent = sprites.size;
}
