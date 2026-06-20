'use strict';

// Wallet abstraction. The game only depends on this interface, so the same
// gameplay/economy code runs on top of either a local mock (for development
// and demos) or a real Privy + Solana integration (production).
//
// Interface:
//   verifyLogin(authPayload) -> { walletId, address, displayName }
//   getOnchainBalance(walletId) -> { sol, token }   (numbers)
//   getDepositInfo(walletId)    -> { depositAddress, tokenMint, ... }
//   (real impl additionally handles deposits / token buys off the hot path)

const MockWallet = require('./mockWallet');

let PrivySolanaWallet = null;
try {
  // Only loaded when configured; keeps optional deps from breaking dev.
  PrivySolanaWallet = require('./privySolanaWallet');
} catch (_) {
  PrivySolanaWallet = null;
}

function createWalletService() {
  const useReal =
    process.env.WALLET_MODE === 'privy' &&
    process.env.PRIVY_APP_ID &&
    PrivySolanaWallet;

  if (useReal) {
    console.log('[wallet] Using Privy + Solana wallet service.');
    return new PrivySolanaWallet({
      privyAppId: process.env.PRIVY_APP_ID,
      privyAppSecret: process.env.PRIVY_APP_SECRET,
      solanaRpcUrl: process.env.SOLANA_RPC_URL,
      tokenMint: process.env.GAME_TOKEN_MINT,
    });
  }

  console.log('[wallet] Using MOCK wallet service (no real funds).');
  return new MockWallet();
}

module.exports = { createWalletService };
