// Exclusion Manager - handles user exclusion functionality

// NOTE: Variable names use _ex prefix (e.g., _exRenderPagination) to avoid conflicts
// with userSkinAssignmentManager.js. Both scripts run in the global scope and const/let
// cannot be redeclared in the same scope. Do NOT rename to generic names like
// _renderPagination — it will break the other manager script.

// Use shared utilities with fallback (unique var names to avoid conflicts)
const _exRenderPagination = (window.dashboardUtils && window.dashboardUtils.renderPagination)
  ? window.dashboardUtils.renderPagination
  : function(containerId, totalItems, pageSize, currentPage, onPageChange) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = '';
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const prevBtn = document.createElement('button');
      prevBtn.textContent = '\u2190';
      prevBtn.setAttribute('aria-label', 'Previous page');
      prevBtn.disabled = currentPage === 1;
      prevBtn.onclick = function() { onPageChange(Math.max(1, currentPage - 1)); };
      container.appendChild(prevBtn);
      const info = document.createElement('span');
      info.textContent = 'Page ' + currentPage + ' of ' + totalPages;
      info.style.margin = '0 8px';
      container.appendChild(info);
      const nextBtn = document.createElement('button');
      nextBtn.textContent = '\u2192';
      nextBtn.setAttribute('aria-label', 'Next page');
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.onclick = function() { onPageChange(Math.min(totalPages, currentPage + 1)); };
      container.appendChild(nextBtn);
    };

// State
let allExcluded = [];
let filteredExcluded = [];
let excludedCurrentPage = 1;
let excludedPageSize = 5;
let currentEditingUserId = null;

// Load excluded users from API
async function loadExcluded() {
  try {
    console.log('[EXCLUDED] Loading excluded users...');
    console.log('[EXCLUDED] sharedAPI available:', typeof sharedAPI);
    allExcluded = await sharedAPI('/api/local/excluded');
    console.log('[EXCLUDED] API returned:', allExcluded);
    const search = document.getElementById('excludedSearch');
    const searchVal = search ? search.value.toLowerCase() : '';
    filteredExcluded = allExcluded.filter(u => u.id.toLowerCase().includes(searchVal));
    console.log('[EXCLUDED] Filtered:', filteredExcluded.length, 'items');
    excludedCurrentPage = 1;
    renderExcludedTable();
    console.log('[EXCLUDED] Table rendered');
  } catch (e) {
    console.error('[EXCLUDED] load excluded error:', e);
  }
}

// Render excluded users table with pagination
function renderExcludedTable() {
  const tbody = document.getElementById('excludedTable');
  console.log('[EXCLUDED] renderExcludedTable called, tbody found:', !!tbody, 'data:', filteredExcluded.length, 'items');
  if (!tbody) {
    console.error('[EXCLUDED] excludedTable element not found in DOM!');
    return;
  }
  tbody.innerHTML = '';

  const start = (excludedCurrentPage - 1) * excludedPageSize;
  const end = start + excludedPageSize;
  const pageData = filteredExcluded.slice(start, end);

  pageData.forEach(u => {
    const tr = document.createElement('tr');
    const reason = u.reason || '';
    const displayReason = reason.length > 30 ? reason.substring(0, 30) + '...' : reason;

    const idTd = document.createElement('td');
    idTd.textContent = u.id;

    const reasonTd = document.createElement('td');
    const reasonSpan = document.createElement('span');
    reasonSpan.textContent = displayReason || '(No reason)';
    reasonSpan.dataset.reason = reason;
    reasonSpan.className = 'reason-link';
    reasonSpan.title = 'Click to view full reason';
    reasonSpan.addEventListener('click', function () {
      showReasonModal(this.dataset.reason);
    });
    reasonTd.appendChild(reasonSpan);

    const actionsTd = document.createElement('td');

    const removeBtn = document.createElement('button');
    removeBtn.className = 'secondary';
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = () => unexcludeUser(u.id);

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.className = 'warning';
    editBtn.onclick = () => showEditReasonModal(u.id, reason);

    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(removeBtn);

    tr.appendChild(idTd);
    tr.appendChild(reasonTd);
    tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  });

  if (pageData.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = filteredExcluded.length === 0 ? 'No excluded users.' : 'No matching excluded users.';
    td.className = 'empty-state';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  _exRenderPagination('excludedPagination', filteredExcluded.length, excludedPageSize, excludedCurrentPage, (page) => {
    excludedCurrentPage = page;
    renderExcludedTable();
  });
}

// Filter excluded users by search
function filterExcluded() {
  const search = document.getElementById('excludedSearch');
  const searchVal = search ? search.value.toLowerCase() : '';
  filteredExcluded = allExcluded.filter(u => u.id.toLowerCase().includes(searchVal));
  excludedCurrentPage = 1;
  renderExcludedTable();
}

// Exclude a user
async function excludeUser() {
  const userId = document.getElementById('excludeUser').value.trim();
  const reason = document.getElementById('excludeReason').value.trim();
  if (!userId) return alert('Enter a username to exclude');
  if (userId.length > 25) return alert('Error: Username cannot exceed 25 characters');
  try {
     await sharedAPI('/api/local/exclude', { method: 'POST', body: JSON.stringify({ userId, reason }) });
    alert('✓ User ' + userId + ' excluded');
    document.getElementById('excludeUser').value = '';
    document.getElementById('excludeReason').value = '';
    await loadExcluded();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

// Remove user from exclusion list
async function unexcludeUser(username) {
  if (!confirm('Remove ' + username + ' from exclusion list?')) return;
   await sharedAPI('/api/local/unexclude', { method: 'POST', body: JSON.stringify({ userId: username }) });
  loadExcluded();
}

// Modal functions for viewing exclusion reasons
function showReasonModal(reason) {
  const modal = document.getElementById('reasonModal');
  const text = document.getElementById('modalReasonText');
  text.textContent = reason || '(No reason provided)';
  modal.style.display = 'flex';
}

function closeReasonModal() {
  const modal = document.getElementById('reasonModal');
  modal.style.display = 'none';
}

// Edit reason modal
function showEditReasonModal(userId, reason) {
  const modal = document.getElementById('editReasonModal');
  const usernameSpan = document.getElementById('editReasonUsername');
  const input = document.getElementById('editReasonInput');

  currentEditingUserId = userId;
  usernameSpan.textContent = userId;
  input.value = reason || '';
  modal.style.display = 'flex';
}

function closeEditReasonModal() {
  const modal = document.getElementById('editReasonModal');
  modal.style.display = 'none';
  currentEditingUserId = null;
}

async function saveEditedReason() {
  if (!currentEditingUserId) return;

  const input = document.getElementById('editReasonInput');
  const newReason = input.value.trim();

  try {
     await sharedAPI('/api/local/updateExclusionReason', {
      method: 'POST',
      body: JSON.stringify({ userId: currentEditingUserId, reason: newReason })
    });
    alert('✓ Reason updated for ' + currentEditingUserId);
    closeEditReasonModal();
    await loadExcluded();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

// Expose functions globally for HTML onclick handlers
window.userExclusion = {
  loadExcluded,
  excludeUser,
  unexcludeUser,
  filterExcluded,
  renderExcludedTable,
  showReasonModal,
  closeReasonModal,
  showEditReasonModal,
  closeEditReasonModal,
  saveEditedReason
};
