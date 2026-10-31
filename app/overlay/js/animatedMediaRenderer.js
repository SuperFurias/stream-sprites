// Animated Media Renderer - manages DOM-based rendering for GIF and WebM animations
// Optimized with element pooling and separate animated sprite tracking
//
// IMPORTANT: Animated skins (GIF/WebM) are NOT drawn on the canvas. They render
// as DOM elements here. The canvas sort in renderer.js does NOT apply to them.
// This module must apply its own z-index ordering based on sprite size so that
// small sprites appear on top of big ones. The container z-index (5001) must be
// ABOVE the canvas (5000) so animated elements are visible.

import { getServerBaseUrl } from './config.js';

const CSS_BASE = 'position:absolute;transform-origin:center center;pointer-events:none;will-change:transform,opacity;';

function createPooledElement(type) {
  const el = document.createElement(type);
  el.style.cssText = CSS_BASE;
  return el;
}

export function createAnimatedMediaRenderer() {
  const container = document.createElement('div');
  container.id = 'animated-media-container';
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5001;';
  document.body.appendChild(container);

  const mediaElements = new Map(); // spriteId -> { el, skinFile, type }
  const animatedSpriteIds = new Set();

  // Element pools for reuse
  const imgPool = [];
  const videoPool = [];

  // Cached sorted animated sprite list (rebuild only when membership changes)
  let cachedAnimatedSprites = [];
  let cachedAnimatedIdSet = new Set();

  function acquireElement(type) {
    const pool = type === 'video' ? videoPool : imgPool;
    if (pool.length > 0) {
      return pool.pop();
    }
    return createPooledElement(type);
  }

  function releaseElement(el, type) {
    if (type === 'video' && typeof el.pause === 'function') {
      try { el.pause(); } catch (e) { /* no-op */ }
    }
    el.style.display = 'none';
    el.src = '';
    el.remove();
    const pool = type === 'video' ? videoPool : imgPool;
    pool.push(el);
  }

  return {
    container,
    mediaElements,
    animatedSpriteIds,

    update(sprites, skins, W, H, GROUND_Y) {
      // Collect animated sprites in one pass, preserving Map order.
      animatedSpriteIds.clear();
      const currentAnimated = [];
      for (const sprite of sprites.values()) {
        const skin = skins.get(sprite.skin);
        if (skin && (skin.isGif || skin.isWebm)) {
          animatedSpriteIds.add(sprite.id);
          currentAnimated.push(sprite);
        }
      }

      // Rebuild only when membership changed. The cached list is size-sorted,
      // so comparing positions would force a rebuild every frame.
      let membershipChanged = animatedSpriteIds.size !== cachedAnimatedIdSet.size;
      if (!membershipChanged) {
        for (const id of animatedSpriteIds) {
          if (!cachedAnimatedIdSet.has(id)) {
            membershipChanged = true;
            break;
          }
        }
      }
      if (membershipChanged) {
        cachedAnimatedSprites.length = 0;
        for (let i = 0; i < currentAnimated.length; i++) {
          cachedAnimatedSprites.push(currentAnimated[i]);
        }
        cachedAnimatedSprites.sort((a, b) => b.size - a.size);
        cachedAnimatedIdSet = new Set(animatedSpriteIds);
      }

      // Pre-compute coordinate scale factors once per frame
      const scaleX = window.innerWidth / W;
      const scaleY = window.innerHeight / H;
      const radToDeg = 180 / Math.PI;

      // Remove entries for sprites that no longer have animated media
      for (const [id, entry] of mediaElements) {
        if (!animatedSpriteIds.has(id)) {
          releaseElement(entry.el, entry.type);
          mediaElements.delete(id);
        }
      }

      // Update or create elements for animated sprites (in sorted order)
      for (let i = 0; i < cachedAnimatedSprites.length; i++) {
        const sprite = cachedAnimatedSprites[i];
        const skin = skins.get(sprite.skin);
        if (!skin || (!skin.isGif && !skin.isWebm)) continue;

        const isVideo = skin.isWebm;
        const entryType = isVideo ? 'video' : 'img';
        const entry = mediaElements.get(sprite.id);
        // z-index: small sprites get higher z (drawn on top)
        const zIndex = 1 + i;

        if (entry) {
          if (entry.skinFile !== skin.file) {
            releaseElement(entry.el, entry.type);
            const newEl = acquireElement(entryType);
            newEl.style.zIndex = zIndex;
            setupElement(newEl, skin, sprite.username);
            container.appendChild(newEl);
            mediaElements.set(sprite.id, { el: newEl, skinFile: skin.file, type: entryType });
          } else {
            entry.el.style.zIndex = zIndex;
          }
        } else {
          const el = acquireElement(entryType);
          el.style.zIndex = zIndex;
          setupElement(el, skin, sprite.username);
          container.appendChild(el);
          mediaElements.set(sprite.id, { el, skinFile: skin.file, type: entryType });
        }

        const currentEntry = mediaElements.get(sprite.id);
        const el = currentEntry.el;
        const heightScale = sprite.heightScale || 1.0;
        const scaledHeight = sprite.size * heightScale;
        const yOffset = (sprite.size - scaledHeight) / 2;

        const screenX = sprite.x * scaleX;
        const screenY = (sprite.y + yOffset) * scaleY;
        const screenWidth = sprite.size * scaleX;
        const screenHeight = scaledHeight * scaleY;
        const rotate = (sprite.angle || 0) * radToDeg;
        const scaleXDir = sprite.facingRight ? 1 : -1;

        el.style.transform = `translate(${screenX}px,${screenY}px) translate(-50%,-50%) rotate(${rotate}deg) scale(${scaleXDir},1)`;
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
  const baseUrl = getServerBaseUrl();
  el.dataset.skinFile = skin.file;
  el.alt = `${username}'s ${skin.isWebm ? 'WebM' : 'GIF'}`;

  if (skin.isWebm) {
    el.src = baseUrl + skin.file;
    el.loop = true;
    el.muted = true;
    el.playsInline = true;
    el.autoplay = true;
    el.style.objectFit = 'fill';
    el.play().catch(() => {});
  } else {
    el.src = baseUrl + skin.file;
  }
}
