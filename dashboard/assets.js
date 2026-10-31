async function loadAssets() {
  const container = document.getElementById('assetContainer');
  if (!container) return;
  try {
    const res = await window.sharedAPI('/api/assets/list');
    const folderSelect = document.getElementById('assetFolderSelect');

    if (!res || Object.keys(res).length === 0) {
      container.innerHTML = '<div style="color:#888">No assets found</div>';
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
      section.className = 'panel';
      section.style.marginBottom = '16px';

      const header = document.createElement('h2');
      header.style.marginTop = '0';
      header.textContent = `📁 ${folder}`;
      section.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'grid';

      for (const asset of assets) {
        const div = document.createElement('div');
        div.className = 'stat-card';
        div.style.padding = '16px';
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.alignItems = 'center';
        div.style.gap = '8px';
        div.style.position = 'relative';

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

        mediaElement.style.maxWidth = '150px';
        mediaElement.style.maxHeight = '150px';
        mediaElement.style.objectFit = 'contain';
        mediaElement.style.borderRadius = '4px';

        const nameDiv = document.createElement('div');
        const nameStrong = document.createElement('strong');
        nameStrong.textContent = asset.name;
        nameDiv.appendChild(nameStrong);

        const delBtn = document.createElement('button');
        delBtn.className = 'danger';
        delBtn.textContent = '✕';
        delBtn.setAttribute('aria-label', `Delete ${asset.name}`);
        delBtn.title = `Delete ${asset.name}`;
        delBtn.style.position = 'absolute';
        delBtn.style.top = '4px';
        delBtn.style.right = '4px';
        delBtn.style.padding = '2px 6px';
        delBtn.style.fontSize = '11px';
        delBtn.style.zIndex = '10';
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
