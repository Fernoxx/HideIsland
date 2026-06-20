'use strict';

const C = require('./constants');

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// Generates a fresh map: a set of non-overlapping islands plus 1-2 treasures
// hidden somewhere on a subset of those islands.
function generateMap() {
  const islands = [];
  const islandCount = Math.round(rand(C.MIN_ISLANDS, C.MAX_ISLANDS));
  const margin = C.ISLAND_MAX_RADIUS + 80;

  let attempts = 0;
  while (islands.length < islandCount && attempts < 500) {
    attempts++;
    const radius = rand(C.ISLAND_MIN_RADIUS, C.ISLAND_MAX_RADIUS);
    const x = rand(margin, C.WORLD_WIDTH - margin);
    const y = rand(margin, C.WORLD_HEIGHT - margin);

    // Keep islands apart so there is always open ocean to swim through.
    const overlaps = islands.some(
      (i) => dist(x, y, i.x, i.y) < i.radius + radius + 220
    );
    if (overlaps) continue;

    islands.push({ id: islands.length, x, y, radius });
  }

  // Pick which islands hold treasure.
  const treasureCount = Math.round(rand(C.MIN_TREASURES, C.MAX_TREASURES));
  const shuffled = [...islands].sort(() => Math.random() - 0.5);
  const treasures = shuffled.slice(0, treasureCount).map((island, idx) => {
    // Place treasure at a random spot well inside the island.
    const angle = rand(0, Math.PI * 2);
    const r = rand(0, island.radius * 0.6);
    return {
      id: idx,
      islandId: island.id,
      x: island.x + Math.cos(angle) * r,
      y: island.y + Math.sin(angle) * r,
      gems: Math.round(rand(C.TREASURE_MIN_GEMS, C.TREASURE_MAX_GEMS)),
      claimedBy: null,
    };
  });

  return { islands, treasures };
}

// True if a point lies on land (inside any island).
function isOnLand(map, x, y) {
  return map.islands.some((i) => dist(x, y, i.x, i.y) <= i.radius);
}

// Returns a random spawn point in open ocean (not on any island).
function randomOceanSpawn(map) {
  const margin = 120;
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = rand(margin, C.WORLD_WIDTH - margin);
    const y = rand(margin, C.WORLD_HEIGHT - margin);
    // Stay clear of island shores so nobody spawns mid-beach.
    const tooClose = map.islands.some(
      (i) => dist(x, y, i.x, i.y) <= i.radius + 60
    );
    if (!tooClose) return { x, y };
  }
  // Fallback: a corner of the ocean.
  return { x: margin, y: margin };
}

module.exports = { generateMap, isOnLand, randomOceanSpawn, dist };
