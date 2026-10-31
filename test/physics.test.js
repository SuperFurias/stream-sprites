const test = require('node:test');
const assert = require('node:assert/strict');

const physics = require('../server/physics');

function restoreDefaults() {
  physics.setPhysicsConfig({});
}

test('createServerSprite honors live physics settings', () => {
  physics.setPhysicsConfig({
    textWidthPadding: 100,
    massDivisor: 100,
    momentOfInertiaFactor: 2,
    wiggleRange: 0,
    initialVelocity: 0,
    spawnBoundsPadding: 10,
    spawnSizePadding: 10,
    spawnJitter: 0
  });

  const sprite = physics.createServerSprite('a'.repeat(20), 1000, 500, 10, 10);
  assert.equal(sprite.size, 10);
  assert.ok(sprite.boundaryRadius > 150, 'text padding should expand boundary radius');
  assert.ok(Math.abs(sprite.mass - (Math.PI * 25 / 100)) < 1e-9);
  assert.equal(sprite.wiggle, 0);
  assert.equal(sprite.vx, 0);
  assert.ok(sprite.x >= 10 && sprite.x <= 990);

  restoreDefaults();
});

test('createServerSprite is deterministic for the same username', () => {
  physics.setPhysicsConfig({});
  const a = physics.createServerSprite('deterministic', 1920, 1080, 30, 80);
  const b = physics.createServerSprite('deterministic', 1920, 1080, 30, 80);
  assert.equal(a.size, b.size);
  assert.equal(a.x, b.x);
  assert.equal(a.vx, b.vx);
  assert.equal(a.wiggle, b.wiggle);
});

test('setPhysicsConfig merges values over defaults', () => {
  physics.setPhysicsConfig({ numZones: 3, collisionForceMultiplier: 0.5 });
  const cfg = physics.getPhysicsConfig();
  assert.equal(cfg.numZones, 3);
  assert.equal(cfg.collisionForceMultiplier, 0.5);
  assert.equal(cfg.gravity, 0.6);
  restoreDefaults();
});

test('manageLifetime removes expired sprites and invokes callback', () => {
  const now = 1_000_000;
  const map = new Map();
  const oldSprite = { id: 'old', lastActivity: now - 20_000, opacity: 1 };
  const freshSprite = { id: 'fresh', lastActivity: now - 1_000, opacity: 1 };
  map.set('old', oldSprite);
  map.set('fresh', freshSprite);

  const removed = [];
  const result = physics.manageLifetime(map, [oldSprite, freshSprite], 10_000, 1_000, now, (sprite) => removed.push(sprite.id));

  assert.deepEqual(result.map(s => s.id), ['old']);
  assert.deepEqual(removed, ['old']);
  assert.equal(map.has('old'), false);
  assert.equal(map.has('fresh'), true);
});

test('perfectly overlapping sprites are separated', () => {
  physics.setPhysicsConfig({
    numZones: 1,
    spatialHashCellSize: 64,
    collisionProbabilityLow: 1,
    collisionProbabilityMedium: 1,
    collisionProbabilityHigh: 1,
    collisionCountThresholdLow: 1,
    collisionCountThresholdHigh: 100,
    collisionProbabilityScaling: 1,
    collisionForceMultiplier: 0.02,
    collisionPersonalSpaceThreshold: 0.1,
    safetyNudgeDistance: 0.5,
    avoidanceRadiusMultiplier: 0.001,
    groundYCenterOffset: 0.8,
    centerPushRadius: 1,
    centerPushForce: 0
  });

  const a = physics.createServerSprite('overlap-a', 1000, 1000, 10, 10);
  const b = physics.createServerSprite('overlap-b', 1000, 1000, 10, 10);
  a.x = 500; a.y = 500; a.vx = 0; a.vy = 0; a.state = 'sit';
  b.x = 500; b.y = 500; b.vx = 0; b.vy = 0; b.state = 'sit';

  physics.updatePhysics(1 / 60, [a, b], 1000, 1000, 2000, 0, 1, 1, 0, 0);
  const separated = Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(separated > 0.5, `expected separation, got ${separated}`);

  restoreDefaults();
});

test('serializeSpritePhysics rounds values for the wire', () => {
  const serialized = physics.serializeSpritePhysics({
    id: 'x', username: 'X', x: 1.23456, y: 2.34567, vx: 0.1234567, vy: -0.7654321,
    size: 30.129, angle: 1.234567, angularVelocity: 0.12345678, facingRight: true,
    skin: 'default', state: 'idle', opacity: 1, heightScale: 1,
    createdAt: 1, lastActivity: 2, collisionRadius: 15, boundaryRadius: 20
  });

  assert.equal(serialized.x, 1.23);
  assert.equal(serialized.y, 2.35);
  assert.equal(serialized.vx, 0.123);
  assert.equal(serialized.size, 30.13);
  assert.equal(serialized.angle, 1.235);
});
