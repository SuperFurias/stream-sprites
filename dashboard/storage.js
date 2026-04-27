const DB_CONFIGS = {
  sqlite: {
    label: 'SQLite',
    placeholder: '',
    example: 'No connection string needed — data stored locally in a file.',
    supportsTest: false
  },
  postgres: {
    label: 'PostgreSQL',
    placeholder: 'postgresql://user:password@localhost:5432/dbname',
    example: 'postgresql://user:password@localhost:5432/mydb',
    supportsTest: true
  },
  supabase: {
    label: 'Supabase',
    placeholder: 'postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres',
    example: 'postgresql://postgres.abc123:secretpass@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    supportsTest: true
  },
  neon: {
    label: 'Neon',
    placeholder: 'postgresql://user:password@ep-cool-rain-123456.us-east-2.aws.neon.tech/dbname?sslmode=require',
    example: 'postgresql://neondb_owner:abcdef@ep-cool-rain-123456.us-east-2.aws.neon.tech/mydb?sslmode=require',
    supportsTest: true
  },
  mysql: {
    label: 'MySQL',
    placeholder: 'mysql://user:password@localhost:3306/dbname',
    example: 'mysql://root:password@localhost:3306/mysprites',
    supportsTest: false
  },
  mongodb: {
    label: 'MongoDB',
    placeholder: 'mongodb+srv://user:password@cluster.mongodb.net/dbname',
    example: 'mongodb+srv://admin:password@cluster0.abc123.mongodb.net/mysprites',
    supportsTest: false
  }
};

function onDbTypeChange() {
  const dbType = document.getElementById('dbType').value;
  const cfg = DB_CONFIGS[dbType];
  const connStrGroup = document.getElementById('connStrGroup');
  const label = document.getElementById('connStrLabel');
  const input = document.getElementById('pgConnectionString');
  const example = document.getElementById('connStrExample');
  const testBtn = document.getElementById('testBtn');

  if (dbType === 'sqlite') {
    connStrGroup.style.display = 'none';
  } else {
    connStrGroup.style.display = '';
    label.textContent = cfg.label + ' Connection String';
    input.placeholder = cfg.placeholder;
    example.innerHTML = 'Example: <code>' + cfg.example + '</code>';
    testBtn.style.display = cfg.supportsTest ? '' : 'none';
  }
}

window.tabInitializers.storage = async function() {
  await loadStorageStatus();
  onDbTypeChange();
};

function toggleStoragePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'hide';
  } else {
    input.type = 'password';
    btn.innerHTML = '&#128065;';
  }
}

async function loadStorageStatus() {
  try {
    const res = await window.sharedAPI('/api/storage/status');
    const backend = res.type || 'sqlite';
    const labelMap = { sqlite: 'SQLite (Local)', postgres: 'PostgreSQL', mysql: 'MySQL', mongodb: 'MongoDB' };
    document.getElementById('currentBackend').textContent = labelMap[backend] || backend;
    document.getElementById('backendBadge').textContent = backend === 'sqlite' ? 'Local' : 'Cloud';
    document.getElementById('backendBadge').style.background = backend === 'sqlite' ? '#9146FF' : '#0f0';

    if (res.config && res.config.connectionString) {
      document.getElementById('pgConnectionString').value = res.config.connectionString;
    }

    // Set dropdown to current backend
    const dbTypeSelect = document.getElementById('dbType');
    if (dbTypeSelect) {
      const options = [...dbTypeSelect.options].map(o => o.value);
      if (options.includes(backend)) {
        dbTypeSelect.value = backend;
      } else {
        dbTypeSelect.value = 'postgres';
      }
    }
  } catch (e) {
    document.getElementById('currentBackend').textContent = 'Error';
  }
}

async function testPgConnection() {
  const connStr = document.getElementById('pgConnectionString').value.trim();
  if (!connStr) return showResult('Please enter a connection string', false);

  const btn = document.getElementById('testBtn');
  btn.disabled = true;
  btn.textContent = 'Testing...';

  try {
    const res = await window.sharedAPI('/api/storage/testConnection', {
      method: 'POST',
      body: JSON.stringify({ connectionString: connStr })
    });
    showResult(res.ok ? '✓ Connection successful!' : '✗ ' + (res.message || 'Connection failed'), res.ok);
  } catch (e) {
    showResult('✗ Error: ' + e.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Connection';
  }
}

async function switchDatabase() {
  const dbType = document.getElementById('dbType').value;
  const connStr = document.getElementById('pgConnectionString').value.trim();

  if (dbType === 'sqlite') {
    if (!confirm('Switch to SQLite (local)? New data will be stored locally.')) return;
  } else {
    if (!connStr) return showResult('Please enter a connection string', false);
    if (!confirm(`Switch to ${dbType}? The server will use this database from now on.`)) return;
  }

  const btn = document.getElementById('switchBtn');
  btn.disabled = true;
  btn.textContent = 'Switching...';

  try {
    const body = dbType === 'sqlite'
      ? { type: 'sqlite' }
      : { type: 'postgres', connectionString: connStr };
    const res = await window.sharedAPI('/api/storage/switch', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    showResult(res.ok ? `✓ Switched to ${dbType}!` : '✗ ' + (res.message || res.error), res.ok);
    await loadStorageStatus();
  } catch (e) {
    showResult('✗ Error: ' + e.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Switch Database';
  }
}

async function migrateToPostgres() {
  const connStr = document.getElementById('pgConnectionString').value.trim();
  if (!connStr) return showResult('Please enter a connection string', false);
  if (!confirm('Migrate all local SQLite data (users, excluded users, config, assets) to the new database? This copies data — your local SQLite data will NOT be deleted.')) return;

  const btn = document.getElementById('migrateBtn');
  btn.disabled = true;
  btn.textContent = 'Migrating...';

  try {
    const res = await window.sharedAPI('/api/storage/migrate', {
      method: 'POST',
      body: JSON.stringify({ connectionString: connStr })
    });
    showResult(res.ok
      ? `✓ Migration complete! ${res.users || 0} users, ${res.excluded || 0} excluded users migrated.`
      : '✗ ' + (res.error || 'Migration failed'), res.ok);
  } catch (e) {
    showResult('✗ Error: ' + e.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Migrate Data';
  }
}

function showResult(message, success) {
  const el = document.getElementById('connectionResult');
  el.className = '';
  el.style.background = success ? 'rgba(0,255,0,0.1)' : 'rgba(255,68,68,0.1)';
  el.style.border = `1px solid ${success ? '#0f0' : '#f44'}`;
  el.style.color = success ? '#0f0' : '#f44';
  el.textContent = message;
  setTimeout(() => { el.className = 'hidden'; }, 8000);
}
