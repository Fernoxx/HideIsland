'use strict';

const C = require('../game/constants');

// In-memory ledger for the virtual betting token and in-game gems, keyed by
// player id. This is intentionally swappable: when the Privy/Solana wallet
// layer goes live, `token` balance becomes the player's deposited on-chain
// balance and these methods proxy to the wallet service instead.
class Economy {
  constructor() {
    this.accounts = new Map(); // id -> { token, gems }
  }

  ensure(id) {
    if (!this.accounts.has(id)) {
      this.accounts.set(id, { token: C.STARTING_BALANCE, gems: 0 });
    }
    return this.accounts.get(id);
  }

  getBalance(id) {
    return this.ensure(id).token;
  }

  getGems(id) {
    return this.ensure(id).gems;
  }

  canAfford(id, amount) {
    return this.ensure(id).token >= amount;
  }

  debit(id, amount) {
    const acc = this.ensure(id);
    if (acc.token < amount) return false;
    acc.token -= amount;
    return true;
  }

  credit(id, amount) {
    this.ensure(id).token += amount;
  }

  addGems(id, amount) {
    this.ensure(id).gems += amount;
  }

  spendGems(id, amount) {
    const acc = this.ensure(id);
    if (acc.gems < amount) return false;
    acc.gems -= amount;
    return true;
  }

  // Map a fresh socket connection onto a persistent wallet identity so a
  // player's balance/gems survive reconnects. `walletId` comes from the
  // (mock or real) wallet service.
  linkWallet(socketId, walletId, persisted) {
    if (persisted) {
      this.accounts.set(socketId, persisted);
    } else {
      this.ensure(socketId);
    }
  }

  // Export an account so it can be persisted against a wallet identity.
  export(id) {
    return { ...this.ensure(id) };
  }
}

module.exports = Economy;
