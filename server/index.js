'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const C = require('./game/constants');
const Room = require('./game/Room');
const Player = require('./game/Player');
const Economy = require('./economy/economy');
const shop = require('./economy/shop');
const { createWalletService } = require('./wallet/walletService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ----- Services -----------------------------------------------------------
const economy = new Economy();
const wallet = createWalletService();
const ownership = new Map(); // socketId -> { weapons:[], costumes:[] }

// Persist token/gems against a wallet identity so balances survive reconnects.
const walletStore = new Map(); // walletId -> economy account snapshot
const ownershipStore = new Map(); // walletId -> ownership snapshot
const socketWallet = new Map(); // socketId -> walletId

// ----- Rooms / matchmaking ------------------------------------------------
const rooms = new Map(); // roomId -> Room
let roomSeq = 0;

function makeRoom() {
  const id = 'room-' + ++roomSeq;
  const room = new Room({
    id,
    economy,
    broadcast: (event, payload, onlyId) => {
      if (onlyId) io.to(onlyId).emit(event, payload);
      else io.to(id).emit(event, payload);
    },
    onEmpty: (rid) => rooms.delete(rid),
  });
  rooms.set(id, room);
  return room;
}

// Find an open lobby or spin up a new room.
function findOpenRoom() {
  for (const room of rooms.values()) {
    if (room.state === Room.STATE.LOBBY && room.count < C.MAX_PLAYERS) {
      return room;
    }
  }
  return makeRoom();
}

// ----- Static client ------------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

// ----- Socket handlers ----------------------------------------------------
io.on('connection', (socket) => {
  let room = null;

  const myWalletId = () => socketWallet.get(socket.id);

  function persist() {
    const wid = myWalletId();
    if (!wid) return;
    walletStore.set(wid, economy.export(socket.id));
    ownershipStore.set(wid, ownership.get(socket.id));
  }

  // 1) Login / wallet handshake. authPayload is { handle/name } in mock mode,
  //    or { privyAccessToken } in production.
  socket.on('login', async (authPayload, ack) => {
    try {
      const session = await wallet.verifyLogin(authPayload || {});
      socketWallet.set(socket.id, session.walletId);

      // Restore persisted balances/ownership for returning wallets.
      economy.linkWallet(socket.id, session.walletId, walletStore.get(session.walletId));
      ownership.set(
        socket.id,
        ownershipStore.get(session.walletId) || { weapons: ['none'], costumes: ['default'] }
      );

      let onchain = null;
      try {
        onchain = await wallet.getOnchainBalance(session.walletId, session.address);
      } catch (_) {
        onchain = null;
      }

      ack &&
        ack({
          ok: true,
          walletId: session.walletId,
          address: session.address,
          displayName: session.displayName,
          token: economy.getBalance(socket.id),
          gems: economy.getGems(socket.id),
          onchain,
          ownership: ownership.get(socket.id),
        });
    } catch (err) {
      ack && ack({ ok: false, message: err.message });
    }
  });

  // 2) Join matchmaking with a chosen profile.
  socket.on('joinGame', (profile = {}, ack) => {
    if (room) return ack && ack({ ok: false, message: 'Already in a room.' });
    room = findOpenRoom();
    socket.join(room.id);

    const owned = ownership.get(socket.id) || { weapons: ['none'], costumes: ['default'] };
    const player = new Player({
      id: socket.id,
      name: (profile.name || '').slice(0, 16) || 'Sailor',
      costume: owned.costumes.includes(profile.costume) ? profile.costume : 'default',
      weapon: owned.weapons.includes(profile.weapon) ? profile.weapon : 'none',
    });
    room.addPlayer(player);
    ack && ack({ ok: true, roomId: room.id });
  });

  socket.on('ready', (isReady) => {
    if (room) room.setReady(socket.id, !!isReady);
  });

  socket.on('input', (vec) => {
    if (room && vec) room.setInput(socket.id, Number(vec.dx) || 0, Number(vec.dy) || 0);
  });

  // 3) Shop.
  socket.on('getShop', (ack) => {
    ack &&
      ack({
        catalog: shop.catalog,
        gems: economy.getGems(socket.id),
        ownership: ownership.get(socket.id),
      });
  });

  socket.on('buy', ({ kind, itemId } = {}, ack) => {
    const result = shop.buy(economy, ownership, socket.id, kind, itemId);
    if (result.ok) persist();
    ack &&
      ack({
        ...result,
        gems: economy.getGems(socket.id),
        ownership: ownership.get(socket.id),
      });
  });

  socket.on('getWallet', async (ack) => {
    const wid = myWalletId();
    let deposit = null;
    try {
      deposit = wid ? await wallet.getDepositInfo(wid) : null;
    } catch (_) {}
    ack &&
      ack({
        token: economy.getBalance(socket.id),
        gems: economy.getGems(socket.id),
        deposit,
      });
  });

  socket.on('leaveRoom', () => {
    if (room) {
      socket.leave(room.id);
      room.removePlayer(socket.id);
      room = null;
    }
  });

  socket.on('disconnect', () => {
    persist();
    if (room) room.removePlayer(socket.id);
    socketWallet.delete(socket.id);
    ownership.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🏝️  Hide Island server listening on http://localhost:${PORT}`);
  console.log(`    Open it in 2+ browser tabs to test multiplayer.\n`);
});

module.exports = { app, server, io };
