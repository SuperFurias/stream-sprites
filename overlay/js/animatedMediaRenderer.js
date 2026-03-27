// Animated Media Renderer - manages DOM-based rendering for GIF and WebM animations

// Shared helper to create a media element (video or image) for a given skin
function createMediaElement(skin, username, spriteSize) {
  const zIndex = Math.round(5000 + (50 - spriteSize) * 50);
  let element;

  if (skin.isWebm) {
    element = document.createElement('video');
    element.src = skin.file;
    element.alt = `${username}'s WebM`;
    element.loop = true;
    element.muted = true;
    element.playsInline = true;
    element.autoplay = true;
    element.style.objectFit = 'fill';
    element.onerror = () => {
      console.warn('Failed to load WebM video:', skin.file);
    };
    element.play().catch(() => {});
  } else {
    element = document.createElement('img');
    element.src = skin.file;
    element.alt = `${username}'s GIF`;
  }

  element.dataset.skinFile = skin.file;
  element.style.cssText = `
    position: absolute;
    transform-origin: center center;
    pointer-events: none;
    will-change: transform, opacity;
    z-index: ${zIndex};
  `;

  return element;
}

export function createAnimatedMediaRenderer() {
  const container = document.createElement('div');
  container.id = 'animated-media-container';
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;';
  document.body.appendChild(container);

  const mediaElements = new Map(); // spriteId -> img/video element

  return {
    container,
    mediaElements,

    update(sprites, skins, W, H, GROUND_Y) {
      // Collect IDs of sprites that should have animated media elements (GIF or WebM)
      const spritesWithAnimatedMedia = new Set();
      for (const sprite of sprites.values()) {
        const skin = skins.get(sprite.skin);
        if (skin && (skin.isGif || skin.isWebm)) {
          spritesWithAnimatedMedia.add(sprite.id);
        }
      }

      // Remove animated media elements for sprites that no longer exist OR no longer have animated skins
      const toRemove = [];
      for (const [id, element] of mediaElements) {
        if (!spritesWithAnimatedMedia.has(id)) {
          toRemove.push([id, element]);
        }
      }
      for (const [id, element] of toRemove) {
        element.remove();
        mediaElements.delete(id);
      }

      // Update or create animated media elements for sprites with GIF or WebM skins
      for (const sprite of sprites.values()) {
        const skin = skins.get(sprite.skin);
        if (!skin || (!skin.isGif && !skin.isWebm)) {
          continue;
        }

        const heightScale = sprite.heightScale || 1.0;
        const scaledHeight = sprite.size * heightScale;
        const yOffset = (sprite.size - scaledHeight) / 2;

        let element = mediaElements.get(sprite.id);

        if (!element) {
          element = createMediaElement(skin, sprite.username, sprite.size);
          container.appendChild(element);
          mediaElements.set(sprite.id, element);
        } else {
          // Check if skin changed to a different file or type
          const currentSkinFile = element.dataset.skinFile || '';
          if (currentSkinFile !== skin.file) {
            // Skin changed - create new element to ensure animation restarts
            element.remove();
            element = createMediaElement(skin, sprite.username, sprite.size);
            container.appendChild(element);
            mediaElements.set(sprite.id, element);
          }
        }

        // Calculate position (canvas coordinates to screen coordinates)
        const screenX = (sprite.x / W) * window.innerWidth;
        const screenY = (sprite.y + yOffset) / H * window.innerHeight;

        // Calculate size
        const screenWidth = (sprite.size / W) * window.innerWidth;
        const screenHeight = scaledHeight / H * window.innerHeight;

        // Apply transform
        const rotate = (sprite.angle || 0) * (180 / Math.PI);
        const scaleX = sprite.facingRight ? 1 : -1;

        element.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -50%) rotate(${rotate}deg) scale(${scaleX}, 1)`;
        element.style.width = `${screenWidth}px`;
        element.style.height = `${screenHeight}px`;
        element.style.opacity = sprite.opacity !== undefined ? sprite.opacity : 1;

        // For video elements, ensure dimensions are strictly enforced
        if (skin.isWebm) {
          element.width = Math.round(screenWidth);
          element.height = Math.round(screenHeight);
          element.style.aspectRatio = 'auto';
          element.style.objectFit = 'fill';
        }
      }
    },

    clear() {
      for (const element of mediaElements.values()) {
        element.remove();
      }
      mediaElements.clear();
    },

    destroy() {
      this.clear();
      container.remove();
    }
  };
}
