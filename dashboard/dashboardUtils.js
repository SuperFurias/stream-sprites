// Shared dashboard utilities (non-module, attaches to window)
// NOTE: userSkinAssignmentManager.js and userExclusionManager.js each have prefixed
// fallback copies of renderPagination (as _saRenderPagination / _exRenderPagination)
// because both scripts share the global scope and const/let cannot be redeclared.
// Keep fallbacks in sync if you change this file.

// Cached skin loading (avoids redundant API calls)
let cachedSkins = null;
let cachedSkinsTime = 0;
const SKINS_CACHE_TTL_MS = 10000;

async function fetchAvailableSkins() {
  const now = Date.now();
  if (cachedSkins && (now - cachedSkinsTime) < SKINS_CACHE_TTL_MS) {
    return cachedSkins;
  }
  try {
    const res = await fetch('/api/skins/auto');
    if (res.ok) {
      cachedSkins = await res.json();
      cachedSkinsTime = now;
      return cachedSkins;
    }
  } catch (e) {
    console.warn('Failed to fetch skins:', e);
  }
  return cachedSkins || [];
}

function populateSkinSelect(selectId, skins, includeDefault) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '';
  if (includeDefault !== false) {
    const defaultOpt = document.createElement('option');
    defaultOpt.value = 'default';
    defaultOpt.textContent = 'default';
    defaultOpt.selected = true;
    select.appendChild(defaultOpt);
  }
  skins.forEach(function(s) {
    if (s.id !== 'default') {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      select.appendChild(opt);
    }
  });
}

function renderPagination(containerId, totalItems, pageSize, currentPage, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const totalPages = Math.ceil(totalItems / pageSize);

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '\u2190';
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = function() { onPageChange(Math.max(1, currentPage - 1)); };
  container.appendChild(prevBtn);

  const info = document.createElement('span');
  info.textContent = 'Page ' + currentPage + ' of ' + totalPages;
  info.style.margin = '0 8px';
  container.appendChild(info);

  const nextBtn = document.createElement('button');
  nextBtn.textContent = '\u2192';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.onclick = function() { onPageChange(Math.min(totalPages, currentPage + 1)); };
  container.appendChild(nextBtn);
}

window.dashboardUtils = {
  fetchAvailableSkins: fetchAvailableSkins,
  populateSkinSelect: populateSkinSelect,
  renderPagination: renderPagination
};
