const assert = require('node:assert/strict');
const test = require('node:test');
const {
  BASE_STANDS,
  STATIC_OBSTACLES,
  canOccupy,
  getMarketBirdPositions,
  getSpawnPosition,
  getStandPosition,
  getWorldSize
} = require('../market-world');

test('players cannot occupy stalls or static market objects', () => {
  assert.equal(canOccupy(BASE_STANDS[0].x + 90, BASE_STANDS[0].y + 60, BASE_STANDS.length), false);
  assert.equal(canOccupy(STATIC_OBSTACLES[1].x + 30, STATIC_OBSTACLES[1].y + 30, BASE_STANDS.length), false);
  assert.equal(canOccupy(790, 520, BASE_STANDS.length), true);
});

test('seller spawn points remain outside their stands, including new rows', () => {
  for (const standIndex of [0, 5, 6, 9]) {
    const standCount = Math.max(BASE_STANDS.length, standIndex + 1);
    const spawn = getSpawnPosition('seller', standIndex);
    assert.equal(canOccupy(spawn.x, spawn.y, standCount), true);
  }
});

test('overflow stands expand the walkable market and occupy distinct spots', () => {
  const firstOverflow = getStandPosition(BASE_STANDS.length);
  const nextRow = getStandPosition(BASE_STANDS.length + 4);
  const baseSize = getWorldSize(BASE_STANDS.length);
  const expandedSize = getWorldSize(BASE_STANDS.length + 5);

  assert.notDeepEqual(firstOverflow, nextRow);
  assert.ok(expandedSize.height > baseSize.height);
});

test('market birds walk around the map without entering stands or obstacles', () => {
  const firstPositions = getMarketBirdPositions(0);
  const laterPositions = getMarketBirdPositions(8);

  assert.deepEqual(firstPositions.map((bird) => bird.type), ['hen', 'rooster', 'hen', 'chick']);
  assert.ok(firstPositions.some((bird, index) => (
    Math.hypot(bird.x - laterPositions[index].x, bird.y - laterPositions[index].y) > 1
  )));

  for (let elapsed = 0; elapsed <= 120; elapsed += 0.5) {
    for (const bird of getMarketBirdPositions(elapsed)) {
      assert.equal(canOccupy(bird.x, bird.y, BASE_STANDS.length), true);
    }
  }
});
