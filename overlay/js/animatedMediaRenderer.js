// Animated Media Renderer - manages DOM-based rendering for GIF and WebM animations
export function createAnimatedMediaRenderer() {
  const container = document.createElement('div');
  container.id = 'animated-media-container';
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;';
  document.body.appendChild(container);

  const mediaElements = new Map(); // avatarId -> img/video element

  return {
    container,
    mediaElements,

    update(avatars, skins, W, H, GROUND_Y) {
      // Collect IDs of avatars that should have animated media elements (GIF or WebM)
      const avatarsWithAnimatedMedia = new Set();
      for (const a of avatars.values()) {
        const skin = skins.get(a.skin);
        if (skin && (skin.isGif || skin.isWebm)) {
          avatarsWithAnimatedMedia.add(a.id);
          console.log('[ANIMATED MEDIA] Avatar with animated media:', a.id, 'skin:', a.skin, 'isGif:', skin.isGif, 'isWebm:', skin.isWebm);
        }
      }
      console.log('[ANIMATED MEDIA] Update - avatars with animated media:', avatarsWithAnimatedMedia.size, 'total avatars:', avatars.size);

      // Remove animated media elements for avatars that no longer exist OR no longer have animated skins
      // Collect removals first to avoid modifying map during iteration
      const toRemove = [];
      for (const [id, element] of mediaElements) {
        if (!avatarsWithAnimatedMedia.has(id)) {
          toRemove.push([id, element]);
        }
      }
      for (const [id, element] of toRemove) {
        element.remove();
        mediaElements.delete(id);
      }

      // Update or create animated media elements for avatars with GIF or WebM skins
      for (const a of avatars.values()) {
        const skin = skins.get(a.skin);
        if (!skin || (!skin.isGif && !skin.isWebm)) {
          if (skin) {
            console.log('[ANIMATED MEDIA] Skipping avatar:', a.id, 'skin is not animated - isGif:', skin.isGif, 'isWebm:', skin.isWebm);
          }
          continue;
        }
        console.log('[ANIMATED MEDIA] Processing avatar:', a.id, 'with skin:', a.skin);

        const heightScale = a.heightScale || 1.0;
        const scaledHeight = a.size * heightScale;
        const yOffset = (a.size - scaledHeight) / 2;

        let element = mediaElements.get(a.id);

        if (!element) {
          // Create element based on skin type
          if (skin.isWebm) {
            element = document.createElement('video');
            element.src = skin.file;
            element.dataset.skinFile = skin.file; // Store original path for comparison
            element.alt = `${a.username}'s WebM`;
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
            element.alt = `${a.username}'s GIF`;
          }
          element.style.cssText = `
            position: absolute;
            transform-origin: center center;
            pointer-events: none;
            will-change: transform, opacity;
          `;
          container.appendChild(element);
          mediaElements.set(a.id, element);
          console.log('[ANIMATED MEDIA] Created new element for:', a.id, 'type:', skin.isWebm ? 'video' : 'image', 'file:', skin.file);
        } else {
          // Check if skin changed to a different file or type
          const currentSkinFile = element.dataset.skinFile || '';
          if (currentSkinFile !== skin.file) {
            console.log('[ANIMATED MEDIA] Skin changed for', a.id, 'from:', currentSkinFile, 'to:', skin.file);
            // Skin changed - create new element to ensure animation restarts
            element.remove();
            if (skin.isWebm) {
              element = document.createElement('video');
              element.src = skin.file;
              element.dataset.skinFile = skin.file;
              element.alt = `${a.username}'s WebM`;
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
              element.alt = `${a.username}'s GIF`;
            }
            element.style.cssText = `
              position: absolute;
              transform-origin: center center;
              pointer-events: none;
              will-change: transform, opacity;
            `;
            container.appendChild(element);
            mediaElements.set(a.id, element);
            console.log('[ANIMATED MEDIA] Recreated element for:', a.id, 'type:', skin.isWebm ? 'video' : 'image');
          } else {
            console.log('[ANIMATED MEDIA] Element exists and skin unchanged for:', a.id);
          }
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

        element.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -50%) rotate(${rotate}deg) scale(${scaleX}, 1)`;
        element.style.width = `${screenWidth}px`;
        element.style.height = `${screenHeight}px`;
        element.style.opacity = a.opacity !== undefined ? a.opacity : 1;
        
        // For video elements, ensure dimensions are strictly enforced
        if (skin.isWebm) {
          element.width = Math.round(screenWidth);
          element.height = Math.round(screenHeight);
          element.style.aspectRatio = 'auto';
          element.style.objectFit = 'fill';
        }
        
        // Debug: log dimensions for sit state
        if (a.state === 'sit' && skin.isWebm) {
          console.log('[ANIMATED MEDIA] WebM sit dimensions:', {
            id: a.id,
            aSize: a.size,
            heightScale: a.heightScale,
            scaledHeight: scaledHeight,
            screenWidth: screenWidth,
            screenHeight: screenHeight,
            elementWidth: element.style.width,
            elementHeight: element.style.height
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
