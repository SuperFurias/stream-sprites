// Animated Media Renderer - manages DOM-based rendering for GIF and WebM animations
// Optimized with element pooling and separate animated sprite tracking

const CSS_BASE = 'position:absolute;transform-origin:center center;pointer-events:none;will-change:transform,opacity;';

function createPooledElement(type) {
  const el = document.createElement(type);
  el.style.cssText = CSS_BASE;
  return el;
}

export function createAnimatedMediaRenderer() {
  const container = document.createElement('div');
  container.id = 'animated-media-container';
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;';
  document.body.appendChild(container);

  const mediaElements = new Map(); // spriteId -> { el, skinFile, type }
  const animatedSpriteIds = new Set(); // Tracks which sprite IDs currently have animated skins

  // Element pools for reuse
  const imgPool = [];
  const videoPool = [];

  function acquireElement(type) {
    const pool = type === 'video' ? videoPool : imgPool;
    if (pool.length > 0) {
      return pool.pop();
    }
    return createPooledElement(type);
  }

  function releaseElement(el, type) {
    el.style.display = 'none';
    el.src = '';
    const pool = type === 'video' ? videoPool : imgPool;
    pool.push(el);
  }

  return {
    container,
    mediaElements,
    animatedSpriteIds,

    update(sprites, skins, W, H, GROUND_Y) {
      // Rebuild animated sprite set
      animatedSpriteIds.clear();
      for (const sprite of sprites.values()) {
        const skin = skins.get(sprite.skin);
        if (skin && (skin.isGif || skin.isWebm)) {
          animatedSpriteIds.add(sprite.id);
        }
      }

      // Remove entries for sprites that no longer have animated media
      for (const [id, entry] of mediaElements) {
        if (!animatedSpriteIds.has(id)) {
          releaseElement(entry.el, entry.type);
          mediaElements.delete(id);
        }
      }

      // Update or create elements for animated sprites
      for (const sprite of sprites.values()) {
        const skin = skins.get(sprite.skin);
        if (!skin || (!skin.isGif && !skin.isWebm)) continue;

        const isVideo = skin.isWebm;
        const entryType = isVideo ? 'video' : 'img';
        const entry = mediaElements.get(sprite.id);

        if (entry) {
          // Check if skin changed
          if (entry.skinFile !== skin.file) {
            releaseElement(entry.el, entry.type);
            const newEl = acquireElement(entryType);
            setupElement(newEl, skin, sprite.username);
            container.appendChild(newEl);
            mediaElements.set(sprite.id, { el: newEl, skinFile: skin.file, type: entryType });
          }
        } else {
          // Create new element from pool
          const el = acquireElement(entryType);
          setupElement(el, skin, sprite.username);
          container.appendChild(el);
          mediaElements.set(sprite.id, { el, skinFile: skin.file, type: entryType });
        }

        // Update transform
        const currentEntry = mediaElements.get(sprite.id);
        const el = currentEntry.el;
        const heightScale = sprite.heightScale || 1.0;
        const scaledHeight = sprite.size * heightScale;
        const yOffset = (sprite.size - scaledHeight) / 2;

        const screenX = (sprite.x / W) * window.innerWidth;
        const screenY = (sprite.y + yOffset) / H * window.innerHeight;
        const screenWidth = (sprite.size / W) * window.innerWidth;
        const screenHeight = scaledHeight / H * window.innerHeight;
        const rotate = (sprite.angle || 0) * (180 / Math.PI);
        const scaleX = sprite.facingRight ? 1 : -1;

        el.style.transform = `translate(${screenX}px,${screenY}px) translate(-50%,-50%) rotate(${rotate}deg) scale(${scaleX},1)`;
        el.style.width = `${screenWidth}px`;
        el.style.height = `${screenHeight}px`;
        el.style.opacity = sprite.opacity !== undefined ? sprite.opacity : 1;
        el.style.display = '';

        if (isVideo) {
          el.width = Math.round(screenWidth);
          el.height = Math.round(screenHeight);
          el.style.aspectRatio = 'auto';
          el.style.objectFit = 'fill';
        }
      }
    },

    clear() {
      for (const [id, entry] of mediaElements) {
        releaseElement(entry.el, entry.type);
      }
      mediaElements.clear();
      animatedSpriteIds.clear();
    },

    destroy() {
      this.clear();
      container.remove();
    }
  };
}

function setupElement(el, skin, username) {
  const zIndex = Math.round(5000 + (50 - 50) * 50);
  el.dataset.skinFile = skin.file;
  el.style.zIndex = zIndex;
  el.alt = `${username}'s ${skin.isWebm ? 'WebM' : 'GIF'}`;

  if (skin.isWebm) {
    el.src = skin.file;
    el.loop = true;
    el.muted = true;
    el.playsInline = true;
    el.autoplay = true;
    el.style.objectFit = 'fill';
    el.play().catch(() => {});
  } else {
    el.src = skin.file;
  }
}
