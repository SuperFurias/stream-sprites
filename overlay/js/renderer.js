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

export function draw(ctx, W, H, GROUND_Y, sprites, skins, explosionParticles) {
  ctx.clearRect(0, 0, W, H);

  // Rebuild sorted array when sprite count changes or dirty flag is set
  if (spriteDirtyFlag || spriteCountSnapshot !== sprites.size) {
    sortedSpriteCache.length = 0;
    for (const s of sprites.values()) {
      sortedSpriteCache.push(s);
    }
    // Sort by size descending (larger first = background, smaller later = foreground)
    // Then by Y as secondary factor for consistent ordering among same-sized sprites
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

function drawSprite(ctx, sprite, skins, GROUND_Y) {
  ctx.globalAlpha = sprite.opacity || 1;

  // Only draw shadow for sprites near the ground (saves draw calls for airborne sprites)
  const collisionRadius = sprite.collisionRadius || sprite.size / 2;
  const onGround = sprite.y >= GROUND_Y - collisionRadius - 20;
  if (onGround) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    const shadowWidth = sprite.size * 0.5;
    const shadowHeight = sprite.size * 0.15;
    ctx.ellipse(sprite.x, GROUND_Y + 2, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
    ctx.fill();
  }

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

  // Draw username
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 4;
  ctx.fillText(sprite.username, sprite.x, sprite.y - sprite.size / 2 - 8);
  ctx.shadowBlur = 0;

  // Draw state emojis
  if (sprite.state === 'dance') {
    ctx.fillText('💃', sprite.x, sprite.y - sprite.size / 1.6);
  }

  ctx.globalAlpha = 1;
}

export function updateSpriteCountDisplay(sprites) {
  document.getElementById('avCount').textContent = sprites.size;
}
