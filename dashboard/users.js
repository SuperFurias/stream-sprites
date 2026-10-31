// Users tab - initialization and modal event handlers

// Register initializer
window.tabInitializers = window.tabInitializers || {};
window.tabInitializers.users = async function () {
  console.log('[USERS] Initializing users tab...');
  console.log('[USERS] userSkinAssignment available:', !!window.userSkinAssignment);
  console.log('[USERS] userExclusion available:', !!window.userExclusion);

  // Initialize skin assignment manager
  if (window.userSkinAssignment) {
    await window.userSkinAssignment.loadConfigForUsers();
    await window.userSkinAssignment.loadUsers();
  } else {
    console.error('userSkinAssignment manager not found');
  }

  // Initialize exclusion manager
  if (window.userExclusion) {
    console.log('[USERS] Calling loadExcluded...');
    await window.userExclusion.loadExcluded();
  } else {
    console.error('userExclusion manager not found');
  }

  // Attach click outside handler to modals after content is loaded
  const viewModal = document.getElementById('reasonModal');
  if (viewModal) {
    viewModal.addEventListener('click', function (e) {
      if (e.target === this) window.userExclusion.closeReasonModal();
    });
  }

  const editExclusionModal = document.getElementById('editReasonModal');
  if (editExclusionModal) {
    editExclusionModal.addEventListener('click', function (e) {
      if (e.target === this) window.userExclusion.closeEditReasonModal();
    });
  }

  const editSkinModal = document.getElementById('editSkinModal');
  if (editSkinModal) {
    editSkinModal.addEventListener('click', function (e) {
      if (e.target === this) window.userSkinAssignment.closeEditSkinModal();
    });
  }

  if (!window._usersEscapeBound) {
    window._usersEscapeBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (window.userExclusion) {
        window.userExclusion.closeReasonModal();
        window.userExclusion.closeEditReasonModal();
      }
      if (window.userSkinAssignment) window.userSkinAssignment.closeEditSkinModal();
    });
  }
};
