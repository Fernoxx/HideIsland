'use strict';

const crypto = require('crypto');

// A fully working stand-in for the real wallet so the game is playable with
// zero credentials. It mints a deterministic-looking fake address per guest
// and reports a fake on-chain balance.
class MockWallet {
  constructor() {
    this.sessions = new Map(); // walletId -> { address, displayName }
  }

  async verifyLogin(authPayload = {}) {
    // In mock mode we trust whatever the client sent (guest name / handle).
    const displayName = (authPayload.handle || authPayload.name || 'Guest').slice(0, 24);
    const walletId =
      authPayload.walletId ||
      'mock_' + crypto.createHash('sha1').update(displayName + Math.random()).digest('hex').slice(0, 12);
    const address = 'So1' + crypto.createHash('sha1').update(walletId).digest('hex').slice(0, 28);
    this.sessions.set(walletId, { address, displayName });
    return { walletId, address, displayName };
  }

  async getOnchainBalance() {
    // Pretend the player has a tiny SOL balance and some game token.
    return { sol: 0.05, token: 100 };
  }

  async getDepositInfo(walletId) {
    const s = this.sessions.get(walletId) || {};
    return {
      depositAddress: s.address || 'So1MockDepositAddress00000000000000000000',
      tokenMint: 'MockTokenMint1111111111111111111111111111',
      note: 'Mock mode: deposits are simulated and not real.',
    };
  }
}

module.exports = MockWallet;
