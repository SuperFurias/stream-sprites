// Skin management module
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
    const autoRes = await fetch('/api/skins/auto');
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
  await Promise.all(Array.from(skins.values()).map(async s => {
    // Skip preloading for WebM videos - they'll be loaded by video elements directly
    if (s.isWebm) {
      dbg('Skipping preload for WebM skin:', s.id);
      s.img = null;
      return;
    }
    try {
      const img = new Image();
      img.src = s.file;
      await new Promise(r => { img.onload = r; img.onerror = r; });
      s.img = img;
      dbg('Preloaded skin:', s.id);
    } catch (e) {
      dbg('Failed to preload skin:', s.id, e);
      s.img = null;
    }
  }));
  dbg('All skins preloaded');
}

export function getSkin(skins, skinId) {
  const skin = skins.get(skinId);
  dbg('getSkin:', skinId, 'found:', !!skin);
  return skin;
}
