const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');

const {
  deepMerge,
  stripRuntimeConfigKeys,
  hasModPermission
} = require('../server/lib/util');
const {
  sanitizeUploadFilename,
  resolveAssetPath,
  isSafeAssetName,
  normalizeAssetFolder,
  getAssetMimeType
} = require('../server/lib/asset-paths');
const {
  sanitizeConfigInput,
  sanitizeConfigForDisk
} = require('../server/lib/config-safety');

const ASSETS_ROOT = path.join(os.tmpdir(), 'stream-sprites-test-assets');

test('deepMerge ignores prototype-polluting keys', () => {
  const malicious = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"bad":true}},"safe":1}');
  const merged = deepMerge({}, malicious);
  assert.equal(merged.safe, 1);
  assert.equal({}.polluted, undefined);
  assert.equal({}.bad, undefined);
});

test('stripRuntimeConfigKeys removes generated fields only', () => {
  const cfg = {
    channel: 'demo',
    defaultOverlay: { gravity: 1 },
    hasOAuthToken: true,
    isLocalhost: true,
    skins: []
  };
  assert.equal(stripRuntimeConfigKeys(cfg), true);
  assert.deepEqual(cfg, { channel: 'demo' });
});

test('asset filenames are reduced to a safe basename', () => {
  assert.equal(sanitizeUploadFilename('..\\..\\server\\.env'), null);
  assert.equal(sanitizeUploadFilename('../../secret.png'), 'secret.png');
  assert.equal(sanitizeUploadFilename('bad.txt'), null);
  assert.equal(sanitizeUploadFilename('CON.png'), '_CON.png');
  assert.equal(sanitizeUploadFilename('my sprite.png'), 'my sprite.png');
});

test('asset paths cannot escape the assets root', () => {
  assert.ok(resolveAssetPath(ASSETS_ROOT, 'skins', 'default.gif'));
  assert.equal(resolveAssetPath(ASSETS_ROOT, 'skins', '../../server/.env'), null);
  assert.equal(resolveAssetPath(ASSETS_ROOT, '..', 'x.png'), null);
  assert.equal(resolveAssetPath(ASSETS_ROOT, 'skins', '..'), null);
  assert.equal(isSafeAssetName('a/b.png'), false);
  assert.equal(isSafeAssetName('a\\b.png'), false);
  assert.equal(normalizeAssetFolder('../../etc'), 'etc');
  assert.equal(getAssetMimeType('x.webm'), 'video/webm');
});

test('config input drops runtime and unknown fields', () => {
  const sanitized = sanitizeConfigInput({
    channel: ' demo ',
    serverPort: '9090',
    defaultOverlay: { gravity: 99 },
    hasOAuthToken: true,
    isLocalhost: true,
    twitch: {
      clientId: 'id',
      clientSecret: 'secret',
      botOAuthToken: 'should-not-be-accepted',
      refreshToken: 'also-not-accepted'
    },
    overlay: {
      gravity: '0.4',
      maxSprites: 2500,
      unknownSetting: 1
    },
    debug: {
      serverDebug: true,
      bogus: true
    },
    junk: 'ignored'
  });

  assert.equal(sanitized.channel, 'demo');
  assert.equal(sanitized.serverPort, 9090);
  assert.equal(sanitized.overlay.gravity, 0.4);
  assert.equal(sanitized.overlay.maxSprites, 2500);
  assert.equal(sanitized.overlay.unknownSetting, undefined);
  assert.equal(sanitized.debug.serverDebug, true);
  assert.equal(sanitized.debug.bogus, undefined);
  assert.equal(sanitized.junk, undefined);
  assert.equal(sanitized.defaultOverlay, undefined);
  assert.equal(sanitized.twitch.botOAuthToken, undefined);
  assert.equal(sanitized.twitch.refreshToken, undefined);
});

test('config written to disk never contains the access token', () => {
  const persisted = sanitizeConfigForDisk({
    channel: 'demo',
    defaultOverlay: { gravity: 1 },
    twitch: {
      clientId: 'id',
      clientSecret: 'secret',
      botOAuthToken: 'oauth:live-token',
      refreshToken: 'refresh-token'
    }
  });

  assert.equal(persisted.twitch.botOAuthToken, '');
  assert.equal(persisted.twitch.refreshToken, 'refresh-token');
  assert.equal(persisted.defaultOverlay, undefined);
  assert.equal(persisted.channel, 'demo');
});

test('bot permission check is case-insensitive', () => {
  const cfg = { channel: 'Streamer', botUsername: 'MyBot' };
  assert.equal(hasModPermission({}, 'mybot', cfg), true);
  assert.equal(hasModPermission({}, 'streamer', cfg), true);
  assert.equal(hasModPermission({}, 'random', cfg), false);
});
