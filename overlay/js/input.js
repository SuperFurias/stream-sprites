// Input handling module for mouse drag functionality
export function setupInputHandlers(canvas, sprites, onDragStart, onDragMove, onDragEnd) {
  let isDragging = false;
  let draggedSprite = null;
  let dragOffset = { x: 0, y: 0 };
  
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    // Find sprite under mouse (check from top to bottom)
    const arr = Array.from(sprites.values()).sort((a, b) => b.y - a.y);
    for (const sprite of arr) {
      const dx = mouseX - sprite.x;
      const dy = mouseY - sprite.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= sprite.collisionRadius) {
        isDragging = true;
        draggedSprite = sprite;
        dragOffset.x = dx;
        dragOffset.y = dy;
        // Reset velocity when grabbed
        sprite.vx = 0;
        sprite.vy = 0;
        // Bring to front (re-add to map to render last)
        sprites.delete(sprite.id);
        sprites.set(sprite.id, sprite);
        if (onDragStart) onDragStart(sprite);
        break;
      }
    }
  });
  
  window.addEventListener('mousemove', (e) => {
    if (!isDragging || !draggedSprite) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
    // Update sprite position to follow mouse with offset
    draggedSprite.x = mouseX - dragOffset.x;
    draggedSprite.y = mouseY - dragOffset.y;
    if (onDragMove) onDragMove(draggedSprite, mouseX, mouseY);
  });
  
  window.addEventListener('mouseup', () => {
    isDragging = false;
    if (onDragEnd) onDragEnd(draggedSprite);
    draggedSprite = null;
  });
  
  // Prevent context menu on canvas for better UX
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  
  return { isDragging, draggedSprite };
}
