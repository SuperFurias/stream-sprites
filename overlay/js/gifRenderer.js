// GIF Renderer - manages DOM-based GIF rendering over the canvas
export function createGifRenderer() {
  const container = document.createElement('div');
  container.id = 'gif-container';
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;';
  document.body.appendChild(container);

  const gifElements = new Map(); // avatarId -> img element

  return {
    container,
    gifElements,

    update(avatars, skins, W, H, GROUND_Y) {
      // Collect IDs of avatars that should have GIF elements
      const avatarsWithGifs = new Set();
      for (const a of avatars.values()) {
        const skin = skins.get(a.skin);
        if (skin && skin.isGif) {
          avatarsWithGifs.add(a.id);
        }
      }

      // Remove GIF elements for avatars that no longer exist OR no longer have GIF skins
      // Collect removals first to avoid modifying map during iteration
      const toRemove = [];
      for (const [id, img] of gifElements) {
        if (!avatarsWithGifs.has(id)) {
          toRemove.push([id, img]);
        }
      }
      for (const [id, img] of toRemove) {
        img.remove();
        gifElements.delete(id);
      }

      // Update or create GIF elements for avatars with GIF skins
      for (const a of avatars.values()) {
        const skin = skins.get(a.skin);
        if (!skin || !skin.isGif) continue;

        const heightScale = a.heightScale || 1.0;
        const scaledHeight = a.size * heightScale;
        const yOffset = (a.size - scaledHeight) / 2;

        let img = gifElements.get(a.id);

        if (!img) {
          img = document.createElement('img');
          img.src = skin.file;
          img.alt = `${a.username}'s GIF`;
          img.style.cssText = `
            position: absolute;
            transform-origin: center center;
            pointer-events: none;
            will-change: transform, opacity;
          `;
          container.appendChild(img);
          gifElements.set(a.id, img);
        }

        // Calculate position (canvas coordinates to screen coordinates)
        const screenX = (a.x / W) * window.innerWidth;
        const screenY = (a.y + yOffset) / H * window.innerHeight;

        // Calculate size
        const screenWidth = (a.size / W) * window.innerWidth;
        const screenHeight = scaledHeight / H * window.innerHeight;

        // Apply transform
        const rotate = (a.angle || 0) * (180 / Math.PI);
        const scaleX = a.facingRight ? 1 : -1;

        img.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -50%) rotate(${rotate}deg) scale(${scaleX}, 1)`;
        img.style.width = `${screenWidth}px`;
        img.style.height = `${screenHeight}px`;
        img.style.opacity = a.opacity !== undefined ? a.opacity : 1;
      }
    },

    clear() {
      for (const img of gifElements.values()) {
        img.remove();
      }
      gifElements.clear();
    },

    destroy() {
      this.clear();
      container.remove();
    }
  };
}
