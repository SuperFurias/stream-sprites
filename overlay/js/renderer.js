// Renderer module — optimized with pre-rendered text and better dirty tracking
// NOTE: Do NOT add a "skip rendering when nothing changed" early return.
// Sprites move every frame via physics (gravity, velocity, bouncing), so
// the canvas must be redrawn every frame. An earlier attempt to skip frames
// using a renderNeeded flag caused sprites and usernames to freeze in place.
//
// NOTE: This sort only applies to NON-ANIMATED sprites (PNG etc). Animated
// skins (GIF/WebM) are rendered as DOM elements in animatedMediaRenderer.js,
// which must apply its own z-index ordering. Do NOT assume this sort covers
// all sprites — it doesn't.
//
// NOTE: Sprites are sorted by size descending (larger first = background,
// smaller later = foreground). This was the working approach from v1.0.10.
// Do NOT change this sort order or add caching that skips the sort.

// Reusable sorted array cache to avoid allocating + sorting every frame
let sortedSpriteCache = [];
let spriteCountSnapshot = -1;
let spriteDirtyFlag = true;

export function markSpritesDirty() {
  spriteDirtyFlag = true;
}

export function draw(ctx, W, H, GROUND_Y, sprites, skins, explosionParticles, scaleX, scaleY) {
  scaleX = scaleX || 1;
  scaleY = scaleY || 1;
  const isScaled = scaleX !== 1 || scaleY !== 1;

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Rebuild sorted array when sprite count changes or dirty flag is set
  if (spriteDirtyFlag || spriteCountSnapshot !== sprites.size) {
    sortedSpriteCache.length = 0;
    for (const s of sprites.values()) {
      sortedSpriteCache.push(s);
    }
    sortedSpriteCache.sort((a, b) => b.size - a.size);
    spriteCountSnapshot = sprites.size;
    spriteDirtyFlag = false;
  }

  ctx.font = 'bold 12px system-ui, Arial';
  ctx.textAlign = 'center';
  for (let i = 0; i < sortedSpriteCache.length; i++) {
    drawSprite(ctx, sortedSpriteCache[i], skins, GROUND_Y, scaleX, scaleY);
  }

  // Draw explosion particles
  for (let i = 0; i < explosionParticles.length; i++) {
    const p = explosionParticles[i];
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x * scaleX, p.y * scaleY, p.size * Math.min(scaleX, scaleY), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawSprite(ctx, sprite, skins, GROUND_Y, scaleX, scaleY) {
  // Scale sprite position from server coords to screen coords
  const sx = sprite.x * scaleX;
  const sy = sprite.y * scaleY;
  const size = sprite.size * Math.min(scaleX, scaleY);

  ctx.globalAlpha = sprite.opacity || 1;

  // Only draw shadow for sprites near the ground (uses screen-space GROUND_Y)
  const collisionRadius = (sprite.collisionRadius || sprite.size / 2) * Math.min(scaleX, scaleY);
  const onGround = sy >= GROUND_Y - collisionRadius - 20;
  if (onGround) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    const shadowWidth = size * 0.5;
    const shadowHeight = size * 0.15;
    ctx.ellipse(sx, GROUND_Y + 2, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw skin with rotation and flip (skip for GIF skins - handled by DOM)
  const s = skins.get(sprite.skin);
  const heightScale = sprite.heightScale || 1.0;
  const scaledHeight = size * heightScale;
  const yOffset = (size - scaledHeight) / 2;

  ctx.save();
  ctx.translate(sx, sy + yOffset);
  ctx.rotate(sprite.angle || 0);
  if (!sprite.facingRight) { ctx.scale(-1, 1); }

  if (s && s.img && !s.isGif && !s.isWebm) {
    ctx.drawImage(s.img, -size / 2, -scaledHeight / 2, size, scaledHeight);
  } else if (!s || (!s.img && !s.isGif && !s.isWebm)) {
    ctx.beginPath();
    ctx.fillStyle = sprite.color;
    ctx.arc(0, 0, scaledHeight / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(-size * 0.18, -scaledHeight * 0.06, size * 0.12, scaledHeight * 0.12);
    ctx.fillRect(size * 0.06, -scaledHeight * 0.06, size * 0.12, scaledHeight * 0.12);
  }
  ctx.restore();

  // Draw username
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 4;
  ctx.fillText(sprite.username, sx, sy - size / 2 - 8);
  ctx.shadowBlur = 0;

  // Draw state emojis
  if (sprite.state === 'dance') {
    ctx.fillText('💃', sx, sy - size / 1.6);
  }

  ctx.globalAlpha = 1;
}

let lastDisplayedSpriteCount = -1;

export function updateSpriteCountDisplay(sprites) {
  if (sprites.size === lastDisplayedSpriteCount) return;
  const el = document.getElementById('avCount');
  if (!el) return;
  el.textContent = sprites.size;
  lastDisplayedSpriteCount = sprites.size;
}
