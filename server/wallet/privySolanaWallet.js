'use strict';

// Production wallet service: Privy embedded wallets (login with X) + Solana for
// SOL / game-token balances and deposits.
//
// SCAFFOLD: the integration points are laid out and documented, but the live
// calls require credentials and the optional dependencies:
//   npm i @privy-io/server-auth @solana/web3.js @solana/spl-token
// and these environment variables (see .env.example):
//   WALLET_MODE=privy
//   PRIVY_APP_ID, PRIVY_APP_SECRET
//   SOLANA_RPC_URL          (e.g. a mainnet/devnet RPC endpoint)
//   GAME_TOKEN_MINT         (your pump.fun / bags.app token mint address)
//
// Flow overview:
//   1. Client authenticates with Privy in the browser (login with X). Privy
//      provisions an embedded Solana wallet for the user.
//   2. Client sends its Privy access token to the server.
//   3. verifyLogin() validates that token with the Privy server SDK and reads
//      the user's embedded wallet address.
//   4. getOnchainBalance() queries Solana for SOL + SPL token balance.
//   5. Deposits: the user funds their embedded wallet with SOL or buys the
//      game token (via pump.fun / bags.app / a swap) directly from the wallet.

class PrivySolanaWallet {
  constructor(cfg) {
    this.cfg = cfg;

    // Lazy-require optional deps so the file can be imported even when they
    // aren't installed (createWalletService only picks this class when
    // WALLET_MODE=privy and PRIVY_APP_ID are set).
    const { PrivyClient } = require('@privy-io/server-auth');
    const { Connection, PublicKey } = require('@solana/web3.js');

    this.PublicKey = PublicKey;
    this.privy = new PrivyClient(cfg.privyAppId, cfg.privyAppSecret);
    this.connection = new Connection(cfg.solanaRpcUrl, 'confirmed');
    this.tokenMint = cfg.tokenMint ? new PublicKey(cfg.tokenMint) : null;
  }

  // authPayload: { privyAccessToken }
  async verifyLogin(authPayload = {}) {
    const token = authPayload.privyAccessToken;
    if (!token) throw new Error('Missing Privy access token.');

    // Verify the access token and resolve the user + embedded Solana wallet.
    const claims = await this.privy.verifyAuthToken(token);
    const user = await this.privy.getUser(claims.userId);

    const solanaAccount = (user.linkedAccounts || []).find(
      (a) => a.type === 'wallet' && a.chainType === 'solana'
    );
    if (!solanaAccount) throw new Error('No Solana wallet on this Privy account.');

    const twitter = (user.linkedAccounts || []).find((a) => a.type === 'twitter_oauth');
    const displayName = twitter?.username ? '@' + twitter.username : 'Player';

    return {
      walletId: claims.userId,
      address: solanaAccount.address,
      displayName,
    };
  }

  async getOnchainBalance(walletId, address) {
    const owner = new this.PublicKey(address);
    const lamports = await this.connection.getBalance(owner);
    const sol = lamports / 1e9;

    let token = 0;
    if (this.tokenMint) {
      const resp = await this.connection.getParsedTokenAccountsByOwner(owner, {
        mint: this.tokenMint,
      });
      for (const { account } of resp.value) {
        token += account.data.parsed.info.tokenAmount.uiAmount || 0;
      }
    }
    return { sol, token };
  }

  async getDepositInfo(walletId, address) {
    return {
      depositAddress: address, // the user's own embedded Solana wallet
      tokenMint: this.cfg.tokenMint,
      // Front-end can open pump.fun / bags.app / a swap widget to buy the token
      // straight into this address.
      buyTokenUrl: this.cfg.tokenMint
        ? `https://pump.fun/coin/${this.cfg.tokenMint}`
        : null,
    };
  }
}

module.exports = PrivySolanaWallet;
