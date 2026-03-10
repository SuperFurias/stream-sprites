// Input handling module for mouse drag functionality
export function setupInputHandlers(canvas, avatars, onDragStart, onDragMove, onDragEnd) {
  let isDragging = false;
  let draggedAvatar = null;
  let dragOffset = { x: 0, y: 0 };
  
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    // Find avatar under mouse (check from top to bottom)
    const arr = Array.from(avatars.values()).sort((a, b) => b.y - a.y);
    for (const av of arr) {
      const dx = mouseX - av.x;
      const dy = mouseY - av.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= av.collisionRadius) {
        isDragging = true;
        draggedAvatar = av;
        dragOffset.x = dx;
        dragOffset.y = dy;
        // Reset velocity when grabbed
        av.vx = 0;
        av.vy = 0;
        // Bring to front (re-add to map to render last)
        avatars.delete(av.id);
        avatars.set(av.id, av);
        if (onDragStart) onDragStart(av);
        break;
      }
    }
  });
  
  window.addEventListener('mousemove', (e) => {
    if (!isDragging || !draggedAvatar) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
    // Update avatar position to follow mouse with offset
    draggedAvatar.x = mouseX - dragOffset.x;
    draggedAvatar.y = mouseY - dragOffset.y;
    if (onDragMove) onDragMove(draggedAvatar, mouseX, mouseY);
  });
  
  window.addEventListener('mouseup', () => {
    isDragging = false;
    if (onDragEnd) onDragEnd(draggedAvatar);
    draggedAvatar = null;
  });
  
  // Prevent context menu on canvas for better UX
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  
  return { isDragging, draggedAvatar };
}
