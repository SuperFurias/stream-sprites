// Skin management module
import { getServerBaseUrl } from './config.js';

function dbg(...args) {
  console.log('[SKINS]', ...args);
}

export function createSkinsMap() {
  dbg('Creating skins map');
  return new Map();
}

export function loadSkinsFromConfig(skins, cfg) {
  dbg('Loading skins from config:', cfg.skins?.length || 0, 'skins');
  (cfg.skins || []).forEach(s => {
    const file = s.file || '';
    const lowerFile = file.toLowerCase();
    const isGif = lowerFile.endsWith('.gif');
    const isWebm = lowerFile.endsWith('.webm');
    skins.set(s.id, { ...s, img: null, isGif, isWebm });
    dbg('Loaded skin from config:', s.id, 'isGif:', isGif, 'isWebm:', isWebm);
  });
}

export async function fetchAutoSkins(skins) {
  dbg('Fetching auto-detected skins...');
  try {
    const baseUrl = getServerBaseUrl();
    const autoRes = await fetch(baseUrl + '/api/skins/auto');
    if (autoRes.ok) {
      const autoSkins = await autoRes.json();
      dbg('Auto-detected skins:', autoSkins.map(s => s.id));
      dbg('Raw auto skins data:', JSON.stringify(autoSkins, null, 2));
      autoSkins.forEach(s => {
        if (!skins.has(s.id)) {
          const file = s.file || '';
          const lowerFile = file.toLowerCase();
          const isGif = lowerFile.endsWith('.gif');
          const isWebm = lowerFile.endsWith('.webm');
          // Use server-provided flags if available
          const skinWithFlags = {
            ...s,
            img: null,
            isGif: s.isGif || isGif,
            isWebm: s.isWebm || isWebm
          };
          skins.set(s.id, skinWithFlags);
          dbg('Added auto skin:', s.id, 'isGif:', skinWithFlags.isGif, 'isWebm:', skinWithFlags.isWebm, 'file:', s.file);
        }
      });
      dbg('Total skins after auto-fetch:', Array.from(skins.keys()).map(k => ({
        id: k,
        isGif: skins.get(k)?.isGif,
        isWebm: skins.get(k)?.isWebm
      })));
    } else {
      dbg('Auto skins API returned:', autoRes.status);
    }
  } catch (e) {
    dbg('Failed to fetch auto-detected skins:', e);
  }
}

export async function preloadSkins(skins) {
  dbg('Preloading', skins.size, 'skins...');
  const baseUrl = getServerBaseUrl();
  await Promise.all(Array.from(skins.values()).map(async s => {
    // Already preloaded entries (for example after a skin refresh) are reused.
    if (s.img && s.img.complete) return;
    // Skip preloading for WebM videos - they'll be loaded by video elements directly
    if (s.isWebm) {
      dbg('Skipping preload for WebM skin:', s.id);
      s.img = null;
      return;
    }
    try {
      const img = new Image();
      const loaded = await new Promise((resolve) => {
        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(ok);
        };
        const timer = setTimeout(() => finish(false), 5000);
        img.onload = () => finish(true);
        img.onerror = () => finish(false);
        // Prepend server base URL for remote hosting (e.g. Cloudflare tunnel)
        img.src = baseUrl + s.file;
      });
      s.img = loaded ? img : null;
      dbg(loaded ? 'Preloaded skin:' : 'Failed to preload skin:', s.id);
    } catch (e) {
      dbg('Failed to preload skin:', s.id, e);
      s.img = null;
    }
  }));
  dbg('All skins preloaded');
}

// Reconcile the client skin map with the server after an upload/delete.
export async function reloadSkins(skins) {
  const baseUrl = getServerBaseUrl();
  const res = await fetch(baseUrl + '/api/skins/auto');
  if (!res.ok) return false;
  const autoSkins = await res.json();
  const incoming = new Set(autoSkins.map(s => s.id));

  for (const id of Array.from(skins.keys())) {
    if (!incoming.has(id)) skins.delete(id);
  }

  for (const s of autoSkins) {
    const existing = skins.get(s.id);
    const file = s.file || '';
    const lowerFile = file.toLowerCase();
    const isGif = s.isGif || lowerFile.endsWith('.gif');
    const isWebm = s.isWebm || lowerFile.endsWith('.webm');
    if (existing && existing.file === file && existing.isGif === isGif && existing.isWebm === isWebm) {
      continue;
    }
    skins.set(s.id, { ...s, img: null, isGif, isWebm });
  }

  await preloadSkins(skins);
  return true;
}

export function getSkin(skins, skinId) {
  const skin = skins.get(skinId);
  dbg('getSkin:', skinId, 'found:', !!skin);
  return skin;
}
