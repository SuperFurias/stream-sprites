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
    const isGif = s.file && s.file.toLowerCase().endsWith('.gif');
    skins.set(s.id, { ...s, img: null, isGif });
    dbg('Loaded skin from config:', s.id, 'isGif:', isGif);
  });
}

export async function fetchAutoSkins(skins) {
  dbg('Fetching auto-detected skins...');
  try {
    const autoRes = await fetch('/api/skins/auto');
    if (autoRes.ok) {
      const autoSkins = await autoRes.json();
      dbg('Auto-detected skins:', autoSkins.map(s => s.id));
      autoSkins.forEach(s => {
        if (!skins.has(s.id)) {
          const isGif = s.file && s.file.toLowerCase().endsWith('.gif');
          skins.set(s.id, { ...s, img: null, isGif });
          dbg('Added auto skin:', s.id, 'isGif:', isGif);
        }
      });
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
