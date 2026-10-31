const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DESKTOP = path.join(ROOT, 'desktop', 'Program.cs');
const DASHBOARD_HTML = path.join(ROOT, 'dashboard', 'dashboard.html');
const DASHBOARD_JS = path.join(ROOT, 'dashboard', 'dashboard.js');
const UI_CSS = path.join(ROOT, 'dashboard', 'ui.css');
const README = path.join(ROOT, '..', 'README.md');
const SCREENSHOTS = path.join(ROOT, '..', 'docs', 'screenshots');

function createDashboardSandbox() {
  const calls = { open: [], clipboard: [], timers: [] };
  const elements = {
    overlayPreview: { src: '' },
    chatLog: {
      children: [],
      scrollTop: 0,
      scrollHeight: 0,
      appendChild() {},
      removeChild() {}
    },
    chatInput: { value: '', focus() {} }
  };
  const sandbox = {
    window: {
      location: { origin: 'http://127.0.0.1:8080' },
      open(...args) { calls.open.push(args); },
      addEventListener() {}
    },
    document: {
      getElementById(id) { return elements[id] || null; },
      addEventListener() {},
      createElement() {
        return {
          style: {},
          value: '',
          setAttribute() {},
          select() {},
          remove() {}
        };
      },
      body: { appendChild() {} },
      execCommand() { return true; }
    },
    navigator: {
      clipboard: {
        async writeText(text) { calls.clipboard.push(text); }
      }
    },
    console: { log() {}, warn() {}, error() {} },
    setTimeout(fn) {
      calls.timers.push(fn);
      return calls.timers.length;
    },
    clearTimeout() {},
    fetch: async () => ({ ok: false }),
    alert() {}
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(DASHBOARD_JS, 'utf8'), sandbox, { filename: 'dashboard.js' });
  return { sandbox, calls, elements };
}

function pngSize(file) {
  const buffer = fs.readFileSync(file);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('preview controls copy and open the overlay URL', async () => {
  const { sandbox, calls, elements } = createDashboardSandbox();
  const overlayUrl = 'http://127.0.0.1:8080/overlay/overlay.html';

  assert.equal(sandbox.getOverlayUrl(), overlayUrl);

  sandbox.refreshPreview();
  assert.equal(elements.overlayPreview.src, overlayUrl);

  sandbox.openOverlayInBrowser();
  assert.deepEqual(calls.open, [[overlayUrl, '_blank']]);

  const button = { textContent: 'Copy URL', isConnected: true };
  await sandbox.copyOverlayUrl(button);
  assert.deepEqual(calls.clipboard, [overlayUrl]);
  assert.equal(button.textContent, 'Copied');

  assert.equal(calls.timers.length, 1);
  calls.timers[0]();
  assert.equal(button.textContent, 'Copy URL');
});

test('dashboard markup exposes the new browser and copy controls', () => {
  const html = fs.readFileSync(DASHBOARD_HTML, 'utf8');
  assert.match(html, /onclick="copyOverlayUrl\(this\)"/);
  assert.match(html, />Copy URL</);
  assert.match(html, /onclick="openOverlayInBrowser\(\)"/);
  assert.match(html, />Open in browser</);
  assert.doesNotMatch(html, /Open in new tab|openOverlayInNewTab/);
});

test('desktop new-window requests open app links in the system browser', () => {
  const source = fs.readFileSync(DESKTOP, 'utf8');
  const handler = source.match(/private void Core_NewWindowRequested[\s\S]*?\n        \}/);
  assert.ok(handler, 'NewWindowRequested handler exists');
  assert.match(handler[0], /if \(IsAuthHost\(e\.Uri\)\) return;/);
  assert.match(handler[0], /OpenExternal\(e\.Uri\);/);
  assert.doesNotMatch(handler[0], /if \(IsAppUrl\(e\.Uri\) \|\| IsAuthHost\(e\.Uri\)\) return;/);
});

test('desktop launcher prefers bundled Node and WebView2 runtimes', () => {
  const source = fs.readFileSync(DESKTOP, 'utf8');
  assert.match(source, /Path\.Combine\(AppContext\.BaseDirectory, "node", "node\.exe"\)/);
  assert.match(source, /FindBundledWebView2Runtime/);
  assert.match(source, /GetAvailableBrowserVersionString\(bundledRuntime\)/);
  assert.match(source, /CreateAsync\(\s*bundledRuntime/);
  assert.match(source, /server_starting node=/);
});

test('portable packaging script includes both bundled runtimes', () => {
  const script = fs.readFileSync(path.join(ROOT, 'tools', 'package-portable.ps1'), 'utf8');
  assert.match(script, /self-contained true/);
  assert.match(script, /nodeDir/);
  assert.match(script, /node\.exe/);
  assert.match(script, /webview2/);
  assert.match(script, /StreamSprites-\$version-win64\.zip/);
});

test('dashboard preview fills its stage and keeps chat on the right', () => {
  const css = fs.readFileSync(UI_CSS, 'utf8');

  const previewSection = css.match(/body\[data-tab="dashboard"\] \.stage-panel \.preview-section \{([\s\S]*?)\}/);
  assert.ok(previewSection, 'dashboard preview section rule exists');
  assert.match(previewSection[1], /flex-direction:\s*row/);
  assert.match(previewSection[1], /gap:\s*18px/);

  const overlayFrame = css.match(/body\[data-tab="dashboard"\] \.stage-panel \.overlay-frame \{([\s\S]*?)\}/);
  assert.ok(overlayFrame, 'dashboard overlay frame rule exists');
  assert.match(overlayFrame[1], /flex:\s*1 1 auto/);
  assert.match(overlayFrame[1], /max-width:\s*none/);
  assert.match(overlayFrame[1], /max-height:\s*none/);
  assert.match(overlayFrame[1], /aspect-ratio:\s*auto/);

  const chatPanel = css.match(/body\[data-tab="dashboard"\] \.stage-panel \.chat-panel \{([\s\S]*?)\}/);
  assert.ok(chatPanel, 'dashboard chat panel rule exists');
  assert.match(chatPanel[1], /width:\s*clamp\(200px, 26%, 300px\)/);
  assert.match(chatPanel[1], /height:\s*100%/);
});

test('user-facing documentation and pages avoid em dashes', () => {
  const files = [
    README,
    path.join(ROOT, '..', 'CHANGELOG.md'),
    path.join(ROOT, '..', 'NOTICE'),
    path.join(ROOT, 'index.html'),
    path.join(ROOT, 'accounts', 'accounts.html'),
    path.join(ROOT, 'dashboard', 'login.html'),
    path.join(ROOT, 'dashboard', 'setup.html'),
    path.join(ROOT, 'overlay', 'overlay.html')
  ];
  for (const file of files) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\u2014/, path.basename(file));
  }
});

test('README documents the portable release and bundled runtimes', () => {
  const readme = fs.readFileSync(README, 'utf8');
  assert.match(readme, /## Release requirements/);
  assert.match(readme, /self-contained launcher/);
  assert.match(readme, /`node\/`/);
  assert.match(readme, /`webview2\/`/);
  assert.doesNotMatch(readme, /### Prerequisites/);
});

test('documentation screenshots exist at their documented sizes', () => {
  const readme = fs.readFileSync(README, 'utf8');
  const expected = {
    'dashboard.png': { width: 1920, height: 1030 },
    'account-chooser.png': { width: 1440, height: 1000 },
    'users.png': { width: 1440, height: 1000 },
    'assets.png': { width: 1440, height: 1000 }
  };

  for (const [name, size] of Object.entries(expected)) {
    const file = path.join(SCREENSHOTS, name);
    assert.equal(fs.existsSync(file), true, `${name} exists`);
    assert.deepEqual(pngSize(file), size, `${name} dimensions`);
    assert.match(readme, new RegExp(name.replace('.', '\\.')), `${name} is referenced by the README`);
  }
});
