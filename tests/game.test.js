'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const C = require('../server/game/constants');
const { generateMap, isOnLand, randomOceanSpawn, dist } = require('../server/game/Map');
const Economy = require('../server/economy/economy');
const shop = require('../server/economy/shop');
const Room = require('../server/game/Room');
const Player = require('../server/game/Player');

test('map has 5-6 islands and 1-2 treasures placed on islands', () => {
  for (let i = 0; i < 30; i++) {
    const map = generateMap();
    assert.ok(map.islands.length >= C.MIN_ISLANDS && map.islands.length <= C.MAX_ISLANDS,
      `island count ${map.islands.length}`);
    assert.ok(map.treasures.length >= C.MIN_TREASURES && map.treasures.length <= C.MAX_TREASURES,
      `treasure count ${map.treasures.length}`);
    for (const t of map.treasures) {
      const island = map.islands.find((isl) => isl.id === t.islandId);
      assert.ok(island, 'treasure references a real island');
      assert.ok(dist(t.x, t.y, island.x, island.y) <= island.radius, 'treasure is on its island');
      assert.ok(t.gems >= C.TREASURE_MIN_GEMS && t.gems <= C.TREASURE_MAX_GEMS, 'gems in range');
    }
  }
});

test('ocean spawns are not on land', () => {
  const map = generateMap();
  for (let i = 0; i < 50; i++) {
    const s = randomOceanSpawn(map);
    assert.ok(!isOnLand(map, s.x, s.y), 'spawn point is in water');
  }
});

test('economy: bet, payout, gems', () => {
  const eco = new Economy();
  assert.strictEqual(eco.getBalance('a'), C.STARTING_BALANCE);
  assert.ok(eco.canAfford('a', 10));
  assert.ok(eco.debit('a', 10));
  assert.strictEqual(eco.getBalance('a'), C.STARTING_BALANCE - 10);
  eco.credit('a', 30);
  assert.strictEqual(eco.getBalance('a'), C.STARTING_BALANCE + 20);
  eco.addGems('a', 100);
  assert.strictEqual(eco.getGems('a'), 100);
  assert.ok(!eco.debit('a', 999999));
});

test('shop: buy success, insufficient gems, already owned', () => {
  const eco = new Economy();
  const ownership = new Map();
  eco.addGems('p', 100);

  let r = shop.buy(eco, ownership, 'p', 'costume', 'captain'); // costs 60
  assert.ok(r.ok, r.message);
  assert.strictEqual(eco.getGems('p'), 40);

  r = shop.buy(eco, ownership, 'p', 'costume', 'captain'); // already owned
  assert.ok(!r.ok);

  r = shop.buy(eco, ownership, 'p', 'weapon', 'cannon'); // costs 450, too expensive
  assert.ok(!r.ok);
  assert.strictEqual(eco.getGems('p'), 40, 'gems unchanged on failed buy');
});

test('full match: first to treasure wins pot + gems', () => {
  const eco = new Economy();
  const events = [];
  const room = new Room({
    id: 'test',
    economy: eco,
    broadcast: (e, p) => events.push({ e, p }),
    onEmpty: () => {},
  });

  const a = new Player({ id: 'A', name: 'Alice' });
  const b = new Player({ id: 'B', name: 'Bob' });
  room.addPlayer(a);
  room.addPlayer(b);

  // Place bets manually (mirrors what setReady does) and start the match
  // directly so the test doesn't depend on real-time countdown timers.
  for (const p of [a, b]) {
    eco.debit(p.id, room.bet);
    p.bet = room.bet;
    room.pot += room.bet;
  }
  room._startMatch();
  assert.strictEqual(room.state, Room.STATE.PLAYING);
  assert.strictEqual(room.pot, room.bet * 2);

  const treasure = room.map.treasures[0];
  const startBalA = eco.getBalance('A');

  // Teleport Alice onto the treasure and step the simulation.
  a.x = treasure.x;
  a.y = treasure.y;
  room._simulate(0.016);

  assert.strictEqual(room.state, Room.STATE.ENDED);
  const end = events.find((ev) => ev.e === 'matchEnd');
  assert.ok(end, 'matchEnd emitted');
  assert.strictEqual(end.p.winnerId, 'A');
  assert.strictEqual(end.p.potWon, room.bet * 2);
  assert.strictEqual(end.p.gemsWon, treasure.gems);

  // Alice gets the whole pot credited and banks the gems.
  assert.strictEqual(eco.getBalance('A'), startBalA + room.bet * 2);
  assert.strictEqual(eco.getGems('A'), treasure.gems);

  room._stopLoop();
});

test('no winner before timeout refunds all bets', () => {
  const eco = new Economy();
  const room = new Room({ id: 't2', economy: eco, broadcast: () => {}, onEmpty: () => {} });
  const a = new Player({ id: 'A' });
  const b = new Player({ id: 'B' });
  room.addPlayer(a);
  room.addPlayer(b);
  for (const p of [a, b]) {
    eco.debit(p.id, room.bet);
    p.bet = room.bet;
    room.pot += room.bet;
  }
  room._startMatch();
  room._endMatch(null); // simulate timeout

  assert.strictEqual(eco.getBalance('A'), C.STARTING_BALANCE);
  assert.strictEqual(eco.getBalance('B'), C.STARTING_BALANCE);
  room._stopLoop();
});
