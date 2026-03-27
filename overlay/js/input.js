// Input handling module for mouse drag — tracks velocity for throw-on-release
export function setupInputHandlers(canvas, sprites, onDragStart, onDragMove, onDragEnd) {
  let isDragging = false;
  let draggedSprite = null;
  let dragOffset = { x: 0, y: 0 };
  let cachedRect = null;

  // Velocity tracking — stores previous frame's mouse position so mouseup
  // can compute the last displacement even if no mousemove fires between
  // the last move and the release
  let prevMouseX = 0;
  let prevMouseY = 0;
  let lastMouseX = 0;
  let lastMouseY = 0;

  // Cache rect on resize and initially
  function updateCachedRect() {
    cachedRect = canvas.getBoundingClientRect();
  }
  updateCachedRect();
  window.addEventListener('resize', updateCachedRect);

  function toCanvasCoords(e) {
    const rect = cachedRect;
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    if (!cachedRect) updateCachedRect();
    const { x: mouseX, y: mouseY } = toCanvasCoords(e);

    // Find sprite under mouse (check from top to bottom)
    const arr = Array.from(sprites.values()).sort((a, b) => b.y - a.y);
    for (const sprite of arr) {
      const dx = mouseX - sprite.x;
      const dy = mouseY - sprite.y;
      const distSq = dx * dx + dy * dy;
      const radiusSq = sprite.collisionRadius * sprite.collisionRadius;
      if (distSq <= radiusSq) {
        isDragging = true;
        draggedSprite = sprite;
        dragOffset.x = dx;
        dragOffset.y = dy;
        sprite.vx = 0;
        sprite.vy = 0;
        // Initialize velocity tracking
        prevMouseX = mouseX;
        prevMouseY = mouseY;
        lastMouseX = mouseX;
        lastMouseY = mouseY;
        sprites.delete(sprite.id);
        sprites.set(sprite.id, sprite);
        if (onDragStart) onDragStart(sprite);
        break;
      }
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging || !draggedSprite) return;
    if (!cachedRect) updateCachedRect();
    const { x: mouseX, y: mouseY } = toCanvasCoords(e);

    draggedSprite.x = mouseX - dragOffset.x;
    draggedSprite.y = mouseY - dragOffset.y;

    // Shift: current becomes previous, then update current
    prevMouseX = lastMouseX;
    prevMouseY = lastMouseY;
    lastMouseX = mouseX;
    lastMouseY = mouseY;

    if (onDragMove) onDragMove(draggedSprite, mouseX, mouseY);
  });

  window.addEventListener('mouseup', (e) => {
    if (isDragging && draggedSprite) {
      // Release velocity from last displacement between two consecutive frames.
      // prevMouseX/Y holds the position BEFORE the most recent mousemove update,
      // so (lastMouseX - prevMouseX) is the actual per-frame mouse movement.
      // Physics uses px/frame convention (gravity=0.6, jump=-16), so this matches.
      let throwVx = lastMouseX - prevMouseX;
      let throwVy = lastMouseY - prevMouseY;

      // Clamp to prevent absurd launches
      const maxThrow = 25;
      const speed = Math.hypot(throwVx, throwVy);
      if (speed > maxThrow) {
        const scale = maxThrow / speed;
        throwVx *= scale;
        throwVy *= scale;
      }

      draggedSprite.vx = throwVx;
      draggedSprite.vy = throwVy;

      // Clamp position to canvas bounds on release
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      const r = draggedSprite.collisionRadius || draggedSprite.size / 2;
      if (draggedSprite.x < r) draggedSprite.x = r;
      if (draggedSprite.x > W - r) draggedSprite.x = W - r;
      if (draggedSprite.y < r) draggedSprite.y = r;
      if (draggedSprite.y > H - r) draggedSprite.y = H - r;

      if (onDragEnd) onDragEnd(draggedSprite);
    }
    isDragging = false;
    draggedSprite = null;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return { isDragging, draggedSprite };
}
