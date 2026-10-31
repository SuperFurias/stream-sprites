const test = require('node:test');
const assert = require('node:assert/strict');

const PostgresDriver = require('../server/storage/postgres-driver');

const connectionString = process.env.TEST_POSTGRES_URL;

test('PostgreSQL driver round-trip', { skip: !connectionString }, async () => {
  const driver = new PostgresDriver(connectionString);
  await driver.init();

  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const userId = `ci_user_${suffix}`;
  const excludedId = `ci_excluded_${suffix}`;
  const assetPath = `ci/test_${suffix}.png`;
  const configKey = `ci_config_${suffix}`;

  try {
    await driver.upsertUser(userId, 'CI User');
    assert.equal((await driver.getUser(userId)).display_name, 'CI User');

    await driver.assignSkin(userId, 'ci_skin');
    assert.equal(await driver.getUserSkin(userId), 'ci_skin');
    await driver.clearSkinAssignments('ci_skin');
    assert.equal(await driver.getUserSkin(userId), 'default');

    await driver.excludeUser(excludedId, 'initial reason');
    assert.ok(await driver.getExcluded(excludedId));
    await driver.updateExclusionReason(excludedId, 'updated reason');
    const excluded = (await driver.listExcluded(5000)).find(row => row.id === excludedId);
    assert.equal(excluded.reason, 'updated reason');
    await driver.unexcludeUser(excludedId);
    assert.equal(await driver.getExcluded(excludedId), null);

    await driver.saveConfig('unused', { channel: configKey });
    assert.equal((await driver.loadConfig('unused')).channel, configKey);

    await driver.writeAsset(assetPath, Buffer.from('ci-asset'), 'image/png');
    assert.equal((await driver.readAsset(assetPath)).toString(), 'ci-asset');
    assert.ok((await driver.listAssets()).includes(assetPath));
    await driver.deleteAsset(assetPath);
    assert.equal(await driver.readAsset(assetPath), null);

    const stats = await driver.getStats();
    assert.ok(stats.total_users >= 1);
    assert.ok(stats.default_skins >= 1);
  } finally {
    await driver.deleteUser(userId);
    await driver.unexcludeUser(excludedId);
    await driver.deleteAsset(assetPath);
    await driver.close();
  }
});
