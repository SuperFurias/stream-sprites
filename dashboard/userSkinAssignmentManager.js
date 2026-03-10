// Skin Assignment Manager - handles user skin assignment functionality

// State
let allUsers = [];
let filteredUsers = [];
let userCurrentPage = 1;
let userPageSize = 5;

// Load config and populate skin select
async function loadConfigForUsers() {
  try {
    const res = await fetch('/config.json');
    if (!res.ok) throw new Error('config not found');
    const cfg = await res.json();

    // Fetch auto-detected skins
    let allSkins = [];
    try {
      const autoRes = await fetch('/api/skins/auto');
      if (autoRes.ok) {
        allSkins = await autoRes.json();
      }
    } catch (e) {
      console.warn('Failed to fetch auto-detected skins:', e);
      allSkins = cfg.skins || [];
    }

    populateSkinSelect(allSkins);
  } catch (e) {
    console.error('Failed to load config for users tab:', e);
  }
}

function populateSkinSelect(skins) {
  const select = document.getElementById('assignSkin');
  if (!select) return;
  select.innerHTML = '';
  // Add default option first and select it by default
  const defaultOpt = document.createElement('option');
  defaultOpt.value = 'default';
  defaultOpt.textContent = 'default';
  defaultOpt.selected = true;
  select.appendChild(defaultOpt);
  // Add other skins
  skins.forEach(s => {
    if (s.id !== 'default') {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      select.appendChild(opt);
    }
  });
}

// Load users from API
async function loadUsers() {
  try {
    allUsers = await sharedAPI('/api/admin/users');
    const search = document.getElementById('userSearch');
    const searchVal = search ? search.value.toLowerCase() : '';
    filteredUsers = allUsers.filter(u => u.id.toLowerCase().includes(searchVal));
    userCurrentPage = 1;
    renderUserTable();
  } catch (e) {
    console.error('load users error', e);
  }
}

// Render user table with pagination
function renderUserTable() {
  const tbody = document.getElementById('userTable');
  if (!tbody) return;
  tbody.innerHTML = '';

  const start = (userCurrentPage - 1) * userPageSize;
  const end = start + userPageSize;
  const pageData = filteredUsers.slice(start, end);

  pageData.forEach(u => {
    const tr = document.createElement('tr');
    const currentSkin = u.assigned_skin || 'default';
    
    const idTd = document.createElement('td');
    idTd.textContent = u.id;
    idTd.style.textAlign = 'center';
    
    const skinTd = document.createElement('td');
    skinTd.textContent = currentSkin;
    skinTd.style.textAlign = 'center';
    
    const actionsTd = document.createElement('td');
    actionsTd.style.textAlign = 'center';
    actionsTd.style.display = 'flex';
    actionsTd.style.gap = '8px';
    actionsTd.style.justifyContent = 'center';
    
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.style.setProperty('background', '#c05621', 'important');
    editBtn.onclick = () => showEditSkinModal(u.id, currentSkin);
    editBtn.addEventListener('mouseenter', () => {
      editBtn.style.setProperty('background', '#ecc94b', 'important');
    });
    editBtn.addEventListener('mouseleave', () => {
      editBtn.style.setProperty('background', '#c05621', 'important');
    });
    
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = () => resetUser(u.id);
    
    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(removeBtn);
    
    tr.appendChild(idTd);
    tr.appendChild(skinTd);
    tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  });

  renderPagination('userPagination', filteredUsers.length, userPageSize, userCurrentPage, (page) => {
    userCurrentPage = page;
    renderUserTable();
  });
}

// Filter users by search
function filterUsers() {
  const search = document.getElementById('userSearch');
  const searchVal = search ? search.value.toLowerCase() : '';
  filteredUsers = allUsers.filter(u => u.id.toLowerCase().includes(searchVal));
  userCurrentPage = 1;
  renderUserTable();
}

// Assign skin to user
async function assignSkin() {
  const userId = document.getElementById('assignUser').value.trim();
  const skinId = document.getElementById('assignSkin').value;
  if (!userId || !skinId) return alert('Enter username and select a skin');
  if (userId.length > 25) return alert('Error: Username cannot exceed 25 characters');
  try {
    await sharedAPI('/api/admin/assignSkin', { method: 'POST', body: JSON.stringify({ userId, skinId }) });
    alert('✓ Skin assigned to ' + userId);
    document.getElementById('assignUser').value = '';
    await loadUsers();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

// Reset user's skin assignment
async function resetUser(username) {
  if (!confirm('Remove skin assignment for ' + username + '?')) return;
  await sharedAPI('/api/admin/resetUser', { method: 'POST', body: JSON.stringify({ id: username }) });
  loadUsers();
}

// Edit user's skin assignment
let currentEditingSkinUserId = null;

function showEditSkinModal(userId, currentSkin) {
  const modal = document.getElementById('editSkinModal');
  const usernameSpan = document.getElementById('editSkinUsername');
  const skinSelect = document.getElementById('editSkinSelect');
  
  if (!modal || !usernameSpan || !skinSelect) return;
  
  // Populate skin options
  skinSelect.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = 'default';
  defaultOpt.textContent = 'default';
  skinSelect.appendChild(defaultOpt);
  
  // Get available skins from config
  fetch('/config.json')
    .then(res => res.json())
    .then(cfg => {
      // Try to fetch auto-detected skins
      return fetch('/api/skins/auto').then(r => r.ok ? r.json() : cfg.skins || []).catch(() => cfg.skins || []);
    })
    .then(skins => {
      skins.forEach(s => {
        if (s.id !== 'default') {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.name;
          skinSelect.appendChild(opt);
        }
      });
      // Set current value after populating
      skinSelect.value = currentSkin || 'default';
    })
    .catch(err => {
      console.error('Failed to load skins for edit modal:', err);
    });
  
  currentEditingSkinUserId = userId;
  usernameSpan.textContent = userId;
  modal.style.display = 'flex';
}

function closeEditSkinModal() {
  const modal = document.getElementById('editSkinModal');
  if (modal) modal.style.display = 'none';
  currentEditingSkinUserId = null;
}

async function saveEditedSkin() {
  if (!currentEditingSkinUserId) return;
  
  const skinSelect = document.getElementById('editSkinSelect');
  if (!skinSelect) return;
  
  const newSkinId = skinSelect.value;
  
  try {
    await sharedAPI('/api/admin/assignSkin', {
      method: 'POST',
      body: JSON.stringify({ userId: currentEditingSkinUserId, skinId: newSkinId })
    });
    alert('✓ Skin updated for ' + currentEditingSkinUserId);
    closeEditSkinModal();
    await loadUsers();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

// Shared pagination renderer
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
window.userSkinAssignment = {
  loadConfigForUsers,
  loadUsers,
  assignSkin,
  resetUser,
  filterUsers,
  renderUserTable,
  showEditSkinModal,
  closeEditSkinModal,
  saveEditedSkin
};
