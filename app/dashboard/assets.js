async function loadAssets() {
  const container = document.getElementById('assetContainer');
  if (!container) return;
  try {
    const res = await window.sharedAPI('/api/assets/list');
    const folderSelect = document.getElementById('assetFolderSelect');

    if (!res || Object.keys(res).length === 0) {
      container.innerHTML = '<div class="empty-state">No assets found.</div>';
      return;
    }

    // Update folder dropdown
    if (folderSelect) {
      const currentVal = folderSelect.value;
      folderSelect.innerHTML = '';
      for (const folder of Object.keys(res).sort()) {
        const opt = document.createElement('option');
        opt.value = folder;
        opt.textContent = folder;
        folderSelect.appendChild(opt);
      }
      if (currentVal && [...folderSelect.options].some(o => o.value === currentVal)) {
        folderSelect.value = currentVal;
      }
    }

    container.innerHTML = '';
    for (const folder of Object.keys(res).sort()) {
      const assets = res[folder];

      const section = document.createElement('div');
      section.className = 'asset-folder';

      const header = document.createElement('h3');
      header.textContent = folder;
      section.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'asset-grid';

      for (const asset of assets) {
        const div = document.createElement('div');
        div.className = 'asset-card';

        const ext = asset.name.split('.').pop().toLowerCase();
        const isVideo = ext === 'webm';

        let mediaElement;
        if (isVideo) {
          mediaElement = document.createElement('video');
          mediaElement.src = `/api/assets/${encodeURIComponent(folder)}/${encodeURIComponent(asset.name)}`;
          mediaElement.alt = `${asset.name} (WebM)`;
          mediaElement.loop = true;
          mediaElement.muted = true;
          mediaElement.playsInline = true;
          mediaElement.controls = false;
          mediaElement.autoplay = true;
          mediaElement.onerror = () => {
            mediaElement.style.display = 'none';
          };
        } else {
          mediaElement = document.createElement('img');
          mediaElement.src = `/api/assets/${encodeURIComponent(folder)}/${encodeURIComponent(asset.name)}`;
          mediaElement.alt = asset.name;
          mediaElement.loading = 'lazy';
        }

        mediaElement.className = 'asset-media';

        const nameDiv = document.createElement('div');
        const nameStrong = document.createElement('strong');
        nameStrong.textContent = asset.name;
        nameDiv.appendChild(nameStrong);

        const delBtn = document.createElement('button');
        delBtn.className = 'danger asset-delete';
        delBtn.textContent = '×';
        delBtn.setAttribute('aria-label', `Delete ${asset.name}`);
        delBtn.title = `Delete ${asset.name}`;
        delBtn.onclick = () => deleteAsset(asset.name, folder);

        div.appendChild(delBtn);
        div.appendChild(mediaElement);
        div.appendChild(nameDiv);
        grid.appendChild(div);
      }

      section.appendChild(grid);
      container.appendChild(section);
    }
  } catch (e) {
    container.innerHTML = '<div style="color:#f44">Error loading assets</div>';
  }
}

async function uploadAsset() {
  const fileInput = document.getElementById('assetFileInput');
  const folderSelect = document.getElementById('assetFolderSelect');
  if (!fileInput.files || !fileInput.files[0]) return;

  const folder = folderSelect ? folderSelect.value : 'skins';
  const btn = document.getElementById('uploadBtn');
  btn.disabled = true;
  btn.textContent = 'Uploading...';

  try {
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('folder', folder);

    const res = await fetch('/api/assets/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.ok) {
      fileInput.value = '';
      await loadAssets();
    }
  } catch (e) {
    console.error('Upload error:', e);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload';
  }
}

async function deleteAsset(filename, folder) {
  if (!confirm(`Delete "${filename}" from ${folder}?`)) return;
  try {
    await window.sharedAPI('/api/assets/delete', {
      method: 'DELETE',
      body: JSON.stringify({ filename, folder })
    });
    await loadAssets();
  } catch (e) {
    console.error('Delete error:', e);
  }
}

window.tabInitializers = window.tabInitializers || {};
window.tabInitializers.assets = async function() {
  await loadAssets();
};
