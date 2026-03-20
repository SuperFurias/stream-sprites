// Animated Media Renderer - manages DOM-based rendering for GIF and WebM animations
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
          console.log('[ANIMATED MEDIA] Sprite with animated media:', sprite.id, 'skin:', sprite.skin, 'isGif:', skin.isGif, 'isWebm:', skin.isWebm);
        }
      }
      console.log('[ANIMATED MEDIA] Update - sprites with animated media:', spritesWithAnimatedMedia.size, 'total sprites:', sprites.size);

      // Remove animated media elements for sprites that no longer exist OR no longer have animated skins
      // Collect removals first to avoid modifying map during iteration
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
          if (skin) {
            console.log('[ANIMATED MEDIA] Skipping sprite:', sprite.id, 'skin is not animated - isGif:', skin.isGif, 'isWebm:', skin.isWebm);
          }
          continue;
        }
        console.log('[ANIMATED MEDIA] Processing sprite:', sprite.id, 'with skin:', sprite.skin);

        const heightScale = sprite.heightScale || 1.0;
        const scaledHeight = sprite.size * heightScale;
        const yOffset = (sprite.size - scaledHeight) / 2;

        let element = mediaElements.get(sprite.id);

        if (!element) {
          // Create element based on skin type
          if (skin.isWebm) {
            element = document.createElement('video');
            element.src = skin.file;
            element.dataset.skinFile = skin.file; // Store original path for comparison
            element.alt = `${sprite.username}'s WebM`;
            element.loop = true;
            element.muted = true;
            element.playsInline = true;
            element.autoplay = true;
            element.style.objectFit = 'fill'; // Stretch to fill exact dimensions
            element.onerror = () => {
              console.warn('Failed to load WebM video:', skin.file);
            };
            // Try to play the video (required for some browsers)
            element.play().catch(() => {}); // Ignore autoplay restrictions
          } else {
            element = document.createElement('img');
            element.src = skin.file;
            element.dataset.skinFile = skin.file;
            element.alt = `${sprite.username}'s GIF`;
          }
          // Calculate z-index based on sprite size for proper layering
          // Smaller sprites should have higher z-index (foreground)
          // Using baseline 5000 (canvas z-index) with scaling: z = 5000 + (50 - size) * 50
          // This gives: size 30 -> 6000, size 80 -> 3500
          const zIndex = Math.round(5000 + (50 - sprite.size) * 50);
          
          element.style.cssText = `
            position: absolute;
            transform-origin: center center;
            pointer-events: none;
            will-change: transform, opacity;
            z-index: ${zIndex};
          `;
          container.appendChild(element);
          mediaElements.set(sprite.id, element);
          console.log('[ANIMATED MEDIA] Created new element for:', sprite.id, 'type:', skin.isWebm ? 'video' : 'image', 'file:', skin.file);
        } else {
          // Check if skin changed to a different file or type
          const currentSkinFile = element.dataset.skinFile || '';
          if (currentSkinFile !== skin.file) {
            console.log('[ANIMATED MEDIA] Skin changed for', sprite.id, 'from:', currentSkinFile, 'to:', skin.file);
            // Skin changed - create new element to ensure animation restarts
            element.remove();
            if (skin.isWebm) {
              element = document.createElement('video');
              element.src = skin.file;
              element.dataset.skinFile = skin.file;
              element.alt = `${sprite.username}'s WebM`;
              element.loop = true;
              element.muted = true;
              element.playsInline = true;
              element.autoplay = true;
              element.style.objectFit = 'fill'; // Stretch to fill exact dimensions
              element.onerror = () => {
                console.warn('Failed to load WebM video:', skin.file);
              };
              // Try to play the video (required for some browsers)
              element.play().catch(() => {}); // Ignore autoplay restrictions
            } else {
              element = document.createElement('img');
              element.src = skin.file;
              element.dataset.skinFile = skin.file;
              element.alt = `${sprite.username}'s GIF`;
            }
            // Calculate z-index based on sprite size for proper layering
            const zIndex = Math.round(5000 + (50 - sprite.size) * 50);
            element.style.cssText = `
              position: absolute;
              transform-origin: center center;
              pointer-events: none;
              will-change: transform, opacity;
              z-index: ${zIndex};
            `;
            container.appendChild(element);
            mediaElements.set(sprite.id, element);
            console.log('[ANIMATED MEDIA] Recreated element for:', sprite.id, 'type:', skin.isWebm ? 'video' : 'image');
          } else {
            console.log('[ANIMATED MEDIA] Element exists and skin unchanged for:', sprite.id);
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
        
        // Debug: log dimensions for sit state
        if (sprite.state === 'sit' && skin.isWebm) {
          const rect = element.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(element);
          console.log('[ANIMATED MEDIA] WebM sit full debug:', {
            id: sprite.id,
            spriteSize: sprite.size,
            heightScale: sprite.heightScale,
            scaledHeight: scaledHeight,
            screenWidth: screenWidth,
            screenHeight: screenHeight,
            elementStyleWidth: element.style.width,
            elementStyleHeight: element.style.height,
            elementAttrWidth: element.width,
            elementAttrHeight: element.height,
            rectWidth: rect.width,
            rectHeight: rect.height,
            objectFit: computedStyle.objectFit,
            objectPosition: computedStyle.objectPosition
          });
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
