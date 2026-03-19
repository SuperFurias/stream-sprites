// Exclusion Manager - handles user exclusion functionality

// State
let allExcluded = [];
let filteredExcluded = [];
let excludedCurrentPage = 1;
let excludedPageSize = 5;
let currentEditingUserId = null;

// Load excluded users from API
async function loadExcluded() {
   try {
     allExcluded = await sharedAPI('/api/local/excluded');
    const search = document.getElementById('excludedSearch');
    const searchVal = search ? search.value.toLowerCase() : '';
    filteredExcluded = allExcluded.filter(u => u.id.toLowerCase().includes(searchVal));
    excludedCurrentPage = 1;
    renderExcludedTable();
  } catch (e) {
    console.error('load excluded error', e);
  }
}

// Render excluded users table with pagination
function renderExcludedTable() {
  const tbody = document.getElementById('excludedTable');
  if (!tbody) return;
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
    idTd.style.textAlign = 'center';

    const reasonTd = document.createElement('td');
    reasonTd.style.textAlign = 'center';
    const reasonSpan = document.createElement('span');
    reasonSpan.textContent = displayReason || '(No reason)';
    reasonSpan.dataset.reason = reason;
    reasonSpan.style.cursor = 'pointer';
    reasonSpan.style.color = '#63b3ed';
    reasonSpan.style.textDecoration = 'underline';
    reasonSpan.style.display = 'inline-block';
    reasonSpan.style.maxWidth = '200px';
    reasonSpan.style.overflow = 'hidden';
    reasonSpan.style.textOverflow = 'ellipsis';
    reasonSpan.style.whiteSpace = 'nowrap';
    reasonSpan.title = 'Click to view full reason';
    reasonSpan.addEventListener('click', function () {
      showReasonModal(this.dataset.reason);
    });
    reasonTd.appendChild(reasonSpan);

    const actionsTd = document.createElement('td');
    actionsTd.style.textAlign = 'center';
    actionsTd.style.display = 'flex';
    actionsTd.style.gap = '8px';
    actionsTd.style.justifyContent = 'center';

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = () => unexcludeUser(u.id);

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.style.setProperty('background', '#c05621', 'important');
    editBtn.onclick = () => showEditReasonModal(u.id, reason);
    editBtn.addEventListener('mouseenter', () => {
      editBtn.style.setProperty('background', '#ecc94b', 'important');
    });
    editBtn.addEventListener('mouseleave', () => {
      editBtn.style.setProperty('background', '#c05621', 'important');
    });

    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(removeBtn);

    tr.appendChild(idTd);
    tr.appendChild(reasonTd);
    tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  });

  renderPagination('excludedPagination', filteredExcluded.length, excludedPageSize, excludedCurrentPage, (page) => {
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

// Shared pagination renderer (same as in skin assignment)
function renderPagination(containerId, totalItems, pageSize, currentPage, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const totalPages = Math.ceil(totalItems / pageSize);

  // Previous button
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '←';
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = () => onPageChange(Math.max(1, currentPage - 1));
  container.appendChild(prevBtn);

  // Page info
  const info = document.createElement('span');
  info.textContent = `Page ${currentPage} of ${totalPages}`;
  info.style.margin = '0 8px';
  container.appendChild(info);

  // Next button
  const nextBtn = document.createElement('button');
  nextBtn.textContent = '→';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.onclick = () => onPageChange(Math.min(totalPages, currentPage + 1));
  container.appendChild(nextBtn);
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
