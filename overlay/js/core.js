// Core utilities — consolidated from loop.js, spatialHash.js, and userSkinCache.js

import { getServerBaseUrl } from './config.js';

// ── Game loop (from loop.js) ────────────────────────────────────────────────

import { DT_CAP } from './config.js';

export function createGameLoop(drawFn, updatePhysicsFn, updateExplosionParticlesFn, dtCap = DT_CAP) {
  let last = Date.now();
  const maxDt = Number.isFinite(dtCap) && dtCap > 0 ? dtCap : DT_CAP;

  function loop() {
    const now = Date.now();
    const dt = Math.min(maxDt, (now - last) / 1000);
    updatePhysicsFn(dt);
    drawFn();
    updateExplosionParticlesFn(dt);
    last = now;
    requestAnimationFrame(loop);
  }

  return loop;
}

// ── Spatial hash (from spatialHash.js) ───────────────────────────────────────

export class SpatialHash {
  constructor(cellSize, width, height) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.buckets = new Map();
    this._querySet = new Set(); // Reusable set to avoid allocation per query
  }

  _key(cx, cy) { return cx + ',' + cy; }

  insert(obj) {
    const radius = obj.collisionRadius || obj.size / 2;
    const minx = Math.floor((obj.x - radius) / this.cellSize);
    const maxx = Math.floor((obj.x + radius) / this.cellSize);
    const miny = Math.floor((obj.y - radius) / this.cellSize);
    const maxy = Math.floor((obj.y + radius) / this.cellSize);
    for (let i = minx; i <= maxx; i++) {
      for (let j = miny; j <= maxy; j++) {
        const k = this._key(i, j);
        if (!this.buckets.has(k)) this.buckets.set(k, []);
        this.buckets.get(k).push(obj);
      }
    }
  }

  query(obj, excludeSelf) {
    const results = this._querySet;
    results.clear();
    const radius = obj.collisionRadius || obj.size / 2;
    const minx = Math.floor((obj.x - radius) / this.cellSize);
    const maxx = Math.floor((obj.x + radius) / this.cellSize);
    const miny = Math.floor((obj.y - radius) / this.cellSize);
    const maxy = Math.floor((obj.y + radius) / this.cellSize);
    for (let i = minx; i <= maxx; i++) {
      for (let j = miny; j <= maxy; j++) {
        const k = this._key(i, j);
        const arr = this.buckets.get(k);
        if (arr) {
          for (let n = 0; n < arr.length; n++) {
            const o = arr[n];
            if (o !== excludeSelf) results.add(o);
          }
        }
      }
    }
    return results;
  }

  clear() { this.buckets.clear(); }

  reinitialize(cellSize, width, height) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.buckets.clear();
  }
}

// ── User skin cache (from userSkinCache.js) ─────────────────────────────────

export function createUserSkinCache() {
  return new Map();
}

export async function fetchUserSkin(username, userSkinCache) {
  try {
    const baseUrl = getServerBaseUrl();
    const res = await fetch(baseUrl + `/api/user/${encodeURIComponent(username)}`);
    if (res.ok) {
      const data = await res.json();
      userSkinCache.set(username.toLowerCase(), data.assigned_skin || 'default');
      return data.assigned_skin || 'default';
    }
  } catch (e) {
    console.warn('Failed to fetch skin for', username, e);
  }
  return 'default';
}

export function getUserSkinFromCache(userSkinCache, username) {
  return userSkinCache.get(username.toLowerCase()) || 'default';
}

export function cacheUserSkin(userSkinCache, username, skinId) {
  userSkinCache.set(username.toLowerCase(), skinId);
}
