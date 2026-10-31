const path = require('path');

const ALLOWED_ASSET_EXTENSIONS = new Set([
  '.png', '.gif', '.jpg', '.jpeg', '.webp', '.webm', '.avif'
]);

const ASSET_MIME_TYPES = {
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.avif': 'image/avif'
};

function normalizeAssetFolder(value, fallback = 'skins') {
  const folder = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  return folder || fallback;
}

function isValidAssetFolder(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 &&
    /^[a-zA-Z0-9_-]+$/.test(value);
}

function isSafeAssetName(name) {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 200) return false;
  if (trimmed === '.' || trimmed === '..' || trimmed.startsWith('.')) return false;
  if (/[/\\\0]/.test(trimmed)) return false;
  if (/[\x00-\x1F<>:"|?*]/.test(trimmed)) return false;
  return true;
}

function hasAllowedAssetExtension(filename) {
  return ALLOWED_ASSET_EXTENSIONS.has(path.extname(String(filename || '')).toLowerCase());
}

function sanitizeUploadFilename(originalName) {
  const base = path.basename(String(originalName || '').replace(/\0/g, ''));
  const rawExt = path.extname(base).toLowerCase();
  if (!ALLOWED_ASSET_EXTENSIONS.has(rawExt)) return null;

  let stem = path.basename(base, path.extname(base))
    .replace(/[\x00-\x1F<>:"|?*]/g, '_')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/^[. ]+|[. ]+$/g, '')
    .trim();

  if (!stem) stem = 'asset';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = `_${stem}`;

  stem = stem.slice(0, 120).replace(/[. ]+$/g, '');
  const filename = `${stem || 'asset'}${rawExt}`;
  return isSafeAssetName(filename) ? filename : null;
}

// Resolves an asset path and guarantees the result stays inside assetsRoot.
function resolveAssetPath(assetsRoot, folder, filename) {
  if (!isValidAssetFolder(folder) || !isSafeAssetName(filename)) return null;
  const root = path.resolve(assetsRoot);
  const resolved = path.resolve(root, folder, filename);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
}

function getAssetMimeType(filename) {
  return ASSET_MIME_TYPES[path.extname(String(filename || '')).toLowerCase()] ||
    'application/octet-stream';
}

module.exports = {
  ALLOWED_ASSET_EXTENSIONS,
  ASSET_MIME_TYPES,
  normalizeAssetFolder,
  isValidAssetFolder,
  isSafeAssetName,
  hasAllowedAssetExtension,
  sanitizeUploadFilename,
  resolveAssetPath,
  getAssetMimeType
};
