// Input handling module for mouse drag — tracks velocity for throw-on-release
// Mouse coords are mapped to server coordinate space
export function setupInputHandlers(canvas, sprites, onDragStart, onDragMove, onDragEnd, serverW, serverH) {
  let isDragging = false;
  let draggedSprite = null;
  let dragOffset = { x: 0, y: 0 };
  let cachedRect = null;

  // Velocity tracking
  let prevMouseX = 0;
  let prevMouseY = 0;
  let lastMouseX = 0;
  let lastMouseY = 0;

  // Cached sorted sprite array (rebuilt only when sprite count changes)
  let sortedCache = [];
  let sortedCacheSize = -1;

  function rebuildSortedCache() {
    sortedCache.length = 0;
    for (const s of sprites.values()) {
      sortedCache.push(s);
    }
    sortedCache.sort((a, b) => b.y - a.y);
    sortedCacheSize = sprites.size;
  }

  function updateCachedRect() {
    cachedRect = canvas.getBoundingClientRect();
  }
  updateCachedRect();
  window.addEventListener('resize', updateCachedRect);

  function toCanvasCoords(e) {
    const rect = cachedRect;
    if (serverW && serverH) {
      // Server mode: map viewport coords to server coordinate space
      return {
        x: (e.clientX - rect.left) / rect.width * serverW,
        y: (e.clientY - rect.top) / rect.height * serverH
      };
    }
    // Local mode: map to canvas pixel coords
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    if (!cachedRect) updateCachedRect();
    const { x: mouseX, y: mouseY } = toCanvasCoords(e);

    // Rebuild sorted cache only when sprite count changes
    if (sortedCacheSize !== sprites.size) {
      rebuildSortedCache();
    }

    for (const sprite of sortedCache) {
      const dx = mouseX - sprite.x;
      const dy = mouseY - sprite.y;
      if (dx * dx + dy * dy <= sprite.collisionRadius * sprite.collisionRadius) {
        isDragging = true;
        draggedSprite = sprite;
        dragOffset.x = dx;
        dragOffset.y = dy;
        sprite.vx = 0;
        sprite.vy = 0;
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

    prevMouseX = lastMouseX;
    prevMouseY = lastMouseY;
    lastMouseX = mouseX;
    lastMouseY = mouseY;

    if (onDragMove) onDragMove(draggedSprite, mouseX, mouseY);
  });

  window.addEventListener('mouseup', (e) => {
    if (isDragging && draggedSprite) {
      let throwVx = lastMouseX - prevMouseX;
      let throwVy = lastMouseY - prevMouseY;

      const maxThrow = 25;
      const speedSq = throwVx * throwVx + throwVy * throwVy;
      if (speedSq > maxThrow * maxThrow) {
        const scale = maxThrow / Math.sqrt(speedSq);
        throwVx *= scale;
        throwVy *= scale;
      }

      draggedSprite.vx = throwVx;
      draggedSprite.vy = throwVy;

      const W = serverW || (canvas.width / (window.devicePixelRatio || 1));
      const H = serverH || (canvas.height / (window.devicePixelRatio || 1));
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
