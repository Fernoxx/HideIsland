'use strict';

// Catalog of items players buy with gems collected from treasures.
// Weapons affect future combat features; costumes are cosmetic skins.
const WEAPONS = [
  { id: 'none', name: 'Bare Hands', price: 0, damage: 1 },
  { id: 'cutlass', name: 'Pirate Cutlass', price: 80, damage: 3 },
  { id: 'pistol', name: 'Flintlock Pistol', price: 200, damage: 5 },
  { id: 'cannon', name: 'Hand Cannon', price: 450, damage: 9 },
];

const COSTUMES = [
  { id: 'default', name: 'Castaway', price: 0, color: '#4fc3f7' },
  { id: 'captain', name: 'Captain', price: 60, color: '#e57373' },
  { id: 'ghost', name: 'Ghost Pirate', price: 150, color: '#b39ddb' },
  { id: 'golden', name: 'Golden Legend', price: 400, color: '#ffd54f' },
];

const catalog = {
  weapons: WEAPONS,
  costumes: COSTUMES,
};

function findItem(kind, itemId) {
  const list = kind === 'weapon' ? WEAPONS : kind === 'costume' ? COSTUMES : null;
  if (!list) return null;
  return list.find((i) => i.id === itemId) || null;
}

// Attempt a purchase. Returns { ok, message, item }.
function buy(economy, ownership, playerId, kind, itemId) {
  const item = findItem(kind, itemId);
  if (!item) return { ok: false, message: 'Unknown item.' };

  const owned = ownership.get(playerId) || { weapons: ['none'], costumes: ['default'] };
  const bucket = kind === 'weapon' ? owned.weapons : owned.costumes;
  if (bucket.includes(itemId)) {
    return { ok: false, message: 'You already own this.' };
  }
  if (!economy.spendGems(playerId, item.price)) {
    return { ok: false, message: 'Not enough gems.' };
  }
  bucket.push(itemId);
  ownership.set(playerId, owned);
  return { ok: true, message: `Purchased ${item.name}!`, item };
}

module.exports = { catalog, findItem, buy };
