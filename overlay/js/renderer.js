// Renderer module
export function draw(ctx, W, H, GROUND_Y, avatars, skins, explosionParticles) {
  ctx.clearRect(0, 0, W, H);
  const arr = Array.from(avatars.values()).sort((a, b) => a.y - b.y);
  
  for (const a of arr) {
    drawAvatar(ctx, a, skins, GROUND_Y);
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

function drawAvatar(ctx, a, skins, GROUND_Y) {
  ctx.globalAlpha = a.opacity || 1;
  
  // Draw shadow
  ctx.beginPath();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  const shadowWidth = a.size * 0.5;
  const shadowHeight = a.size * 0.15;
  ctx.ellipse(a.x, GROUND_Y + 2, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw skin with rotation and flip (skip for GIF skins - handled by DOM)
  const s = skins.get(a.skin);
  const heightScale = a.heightScale || 1.0;
  const scaledHeight = a.size * heightScale;
  const yOffset = (a.size - scaledHeight) / 2;
  
  ctx.save();
  ctx.translate(a.x, a.y + yOffset);
  ctx.rotate(a.angle || 0);
  if (!a.facingRight) { ctx.scale(-1, 1); }
  
  // Only draw static images on canvas; GIFs and WebMs are rendered as DOM elements
  if (s && s.img && !s.isGif && !s.isWebm) {
    ctx.drawImage(s.img, -a.size / 2, -scaledHeight / 2, a.size, scaledHeight);
  } else if (!s || !s.img || s.isWebm) {
    // Fallback: draw colored circle with eyes
    ctx.beginPath();
    ctx.fillStyle = a.color;
    ctx.arc(0, 0, scaledHeight / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(-a.size * 0.18, -scaledHeight * 0.06, a.size * 0.12, scaledHeight * 0.12);
    ctx.fillRect(a.size * 0.06, -scaledHeight * 0.06, a.size * 0.12, scaledHeight * 0.12);
  }
  ctx.restore();
  
  // Draw username
  ctx.font = 'bold 12px system-ui, Arial';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 4;
  ctx.fillText(a.username, a.x, a.y - a.size / 2 - 8);
  ctx.shadowBlur = 0;
  
  // Draw state emojis
  if (a.state === 'dance') {
    ctx.fillText('💃', a.x, a.y - a.size / 1.6);
  }
  
  ctx.globalAlpha = 1;
}

export function updateAvatarCountDisplay(avatars) {
  document.getElementById('avCount').textContent = avatars.size;
}
