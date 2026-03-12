// Skins tab functions

async function loadSkins(){
  try{
    const res = await fetch('/env');
    if(!res.ok) throw new Error('config not found');
    const cfg = await res.json();

    // Fetch auto-detected skins
    let allSkins = [];
    try{
      const autoRes = await fetch('/api/skins/auto');
      if(autoRes.ok){
        allSkins = await autoRes.json();
      }
    }catch(e){
      console.warn('Failed to fetch auto-detected skins:', e);
      allSkins = cfg.skins || [];
    }

    displaySkins(allSkins);
  }catch(e){
    console.error('Failed to load skins:', e);
  }
}

function displaySkins(skins){
  const list = document.getElementById('skinList');
  if(!list) return;
  list.innerHTML = '';
  skins.forEach(s => {
    const div = document.createElement('div');
    div.className = 'stat-card';
    div.style.padding = '16px';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.alignItems = 'center';
    div.style.gap = '8px';

    // Create image element
    const img = document.createElement('img');
    img.src = s.file;
    img.style.maxWidth = '150px';
    img.style.maxHeight = '150px';
    img.style.objectFit = 'contain';
    img.style.borderRadius = '4px';
    img.style.background = '#333';

    // Check if it's a GIF
    const isGif = s.file.toLowerCase().endsWith('.gif');
    if(isGif){
      img.title = 'GIF - will animate in overlay';
    }

    const nameDiv = document.createElement('div');
    nameDiv.innerHTML = `<strong>${s.name}</strong>`;

    const fileDiv = document.createElement('div');
    fileDiv.innerHTML = `<code>${s.file}</code>`;
    fileDiv.style.fontSize = '11px';
    fileDiv.style.color = '#aaa';

    div.appendChild(img);
    div.appendChild(nameDiv);
    div.appendChild(fileDiv);
    list.appendChild(div);
  });
}

// Register initializer
window.tabInitializers = window.tabInitializers || {};
window.tabInitializers.skins = async function() {
await loadSkins();
};
