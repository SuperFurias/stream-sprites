// Renderer module
export function draw(ctx, W, H, GROUND_Y, sprites, skins, explosionParticles) {
  ctx.clearRect(0, 0, W, H);
  const arr = Array.from(sprites.values()).sort((a, b) => a.y - b.y);
  
  for (const sprite of arr) {
    drawSprite(ctx, sprite, skins, GROUND_Y);
  }
  
  // Draw explosion particles
  for (const p of explosionParticles) {
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
  
  // Draw username
  ctx.font = 'bold 12px system-ui, Arial';
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
