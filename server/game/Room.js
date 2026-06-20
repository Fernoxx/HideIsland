'use strict';

const C = require('./constants');
const { generateMap, isOnLand, randomOceanSpawn, dist } = require('./Map');

// Match lifecycle states.
const STATE = {
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  ENDED: 'ended',
};

// A Room is one game lobby / match. It owns the authoritative simulation and
// emits state to its members through the injected `broadcast` function so it
// stays decoupled from socket.io.
class Room {
  constructor({ id, broadcast, economy, onEmpty }) {
    this.id = id;
    this.broadcast = broadcast; // (event, payload) => void  -> all members
    this.economy = economy; // virtual token / gems ledger
    this.onEmpty = onEmpty; // called when the last player leaves

    this.players = new Map(); // socketId -> Player
    this.state = STATE.LOBBY;
    this.map = null;
    this.bet = C.DEFAULT_BET;
    this.pot = 0;
    this.countdown = 0;
    this.matchTimeLeft = 0;
    this.winner = null;

    this._loop = null;
    this._lastTick = 0;
  }

  get count() {
    return this.players.size;
  }

  addPlayer(player) {
    this.players.set(player.id, player);
    // Latecomers joining a match in progress just wait in spectate-style lobby.
    this._emitLobby();
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);

    // Refund a wagered bet if the match never actually started.
    if (this.state === STATE.LOBBY && p.bet > 0) {
      this.economy.credit(id, p.bet);
      this.pot -= p.bet;
      p.bet = 0;
    }

    if (this.players.size === 0) {
      this._stopLoop();
      this.onEmpty && this.onEmpty(this.id);
      return;
    }

    if (this.state === STATE.LOBBY) this._emitLobby();
    // If the player who left was the only one able to win, end gracefully.
    if (this.state === STATE.PLAYING && this.players.size < 1) {
      this._endMatch(null);
    }
  }

  setReady(id, ready) {
    const p = this.players.get(id);
    if (!p || this.state !== STATE.LOBBY) return;

    // Placing your bet happens when you ready up.
    if (ready && p.bet === 0) {
      if (!this.economy.canAfford(id, this.bet)) {
        this.broadcast('errorMsg', { id, message: 'Not enough token balance to bet.' }, id);
        return;
      }
      this.economy.debit(id, this.bet);
      p.bet = this.bet;
      this.pot += this.bet;
    }
    if (!ready && p.bet > 0) {
      this.economy.credit(id, p.bet);
      this.pot -= p.bet;
      p.bet = 0;
    }

    p.ready = ready;
    this._emitLobby();
    this._maybeStartCountdown();
  }

  setInput(id, dx, dy) {
    if (this.state !== STATE.PLAYING) return;
    const p = this.players.get(id);
    if (p && p.alive) p.setInput(dx, dy);
  }

  _maybeStartCountdown() {
    if (this.state !== STATE.LOBBY) return;
    const players = [...this.players.values()];
    const enough = players.length >= C.MIN_PLAYERS_TO_START;
    const allReady = players.every((p) => p.ready);
    if (enough && allReady) this._startCountdown();
  }

  _startCountdown() {
    this.state = STATE.COUNTDOWN;
    this.countdown = C.COUNTDOWN_SECONDS;
    this._lastCountdownSec = C.COUNTDOWN_SECONDS;
    this.broadcast('countdown', { seconds: this.countdown });
    this._startLoop();
  }

  _startMatch() {
    this.state = STATE.PLAYING;
    this.map = generateMap();
    this.winner = null;
    this.matchTimeLeft = C.MATCH_TIME_LIMIT_SECONDS;

    for (const p of this.players.values()) {
      const spawn = randomOceanSpawn(this.map);
      p.x = spawn.x;
      p.y = spawn.y;
      p.alive = true;
      p.gemsThisMatch = 0;
      p.setInput(0, 0);
    }

    // Send the map once; treasures are sent WITHOUT positions so players must
    // actually explore to find them (only island/count hints go out).
    this.broadcast('matchStart', {
      world: { width: C.WORLD_WIDTH, height: C.WORLD_HEIGHT },
      islands: this.map.islands,
      treasureCount: this.map.treasures.length,
      pot: this.pot,
      constants: {
        PLAYER_RADIUS: C.PLAYER_RADIUS,
        PLAYER_SPEED: C.PLAYER_SPEED,
        TREASURE_RADIUS: C.TREASURE_RADIUS,
      },
      players: [...this.players.values()].map((p) => p.toNet()),
    });
  }

  _startLoop() {
    if (this._loop) return;
    this._lastTick = Date.now();
    const interval = 1000 / C.TICK_RATE;
    this._loop = setInterval(() => this._tick(), interval);
  }

  _stopLoop() {
    if (this._loop) {
      clearInterval(this._loop);
      this._loop = null;
    }
  }

  _tick() {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this._lastTick) / 1000);
    this._lastTick = now;

    if (this.state === STATE.COUNTDOWN) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this._startMatch();
      } else {
        // Only emit when the displayed second actually changes (not every tick).
        const sec = Math.ceil(this.countdown);
        if (sec !== this._lastCountdownSec) {
          this._lastCountdownSec = sec;
          this.broadcast('countdown', { seconds: sec });
        }
      }
      return;
    }

    if (this.state !== STATE.PLAYING) return;

    this._simulate(dt);
    this._broadcastState();

    this.matchTimeLeft -= dt;
    if (this.matchTimeLeft <= 0 && !this.winner) {
      this._endMatch(null); // time up, no winner -> pot is refunded
    }
  }

  _simulate(dt) {
    for (const p of this.players.values()) {
      if (!p.alive) continue;

      const onLand = isOnLand(this.map, p.x, p.y);
      const speed = C.PLAYER_SPEED * (onLand ? C.LAND_SPEED_MULT : 1);
      let nx = p.x + p.input.dx * speed * dt;
      let ny = p.y + p.input.dy * speed * dt;

      // Keep players inside the world bounds.
      nx = Math.max(C.PLAYER_RADIUS, Math.min(C.WORLD_WIDTH - C.PLAYER_RADIUS, nx));
      ny = Math.max(C.PLAYER_RADIUS, Math.min(C.WORLD_HEIGHT - C.PLAYER_RADIUS, ny));
      p.x = nx;
      p.y = ny;

      // Treasure pickup: first to reach an unclaimed treasure wins the match.
      for (const t of this.map.treasures) {
        if (t.claimedBy) continue;
        if (dist(p.x, p.y, t.x, t.y) <= C.TREASURE_PICKUP_DIST) {
          t.claimedBy = p.id;
          p.gemsThisMatch += t.gems;
          this.broadcast('treasureFound', {
            playerId: p.id,
            playerName: p.name,
            x: Math.round(t.x),
            y: Math.round(t.y),
            gems: t.gems,
          });
          this._endMatch(p);
          return;
        }
      }
    }
  }

  _broadcastState() {
    this.broadcast('state', {
      players: [...this.players.values()].map((p) => p.toNet()),
      timeLeft: Math.ceil(this.matchTimeLeft),
    });
  }

  _endMatch(winner) {
    if (this.state === STATE.ENDED) return;
    this.state = STATE.ENDED;
    this.winner = winner;

    if (winner) {
      // Winner takes the whole pot plus banks the gems they collected.
      this.economy.credit(winner.id, this.pot);
      this.economy.addGems(winner.id, winner.gemsThisMatch);
      this.broadcast('matchEnd', {
        winnerId: winner.id,
        winnerName: winner.name,
        potWon: this.pot,
        gemsWon: winner.gemsThisMatch,
        balances: this._balancesSnapshot(),
      });
    } else {
      // No winner: refund every bet.
      for (const p of this.players.values()) {
        if (p.bet > 0) this.economy.credit(p.id, p.bet);
      }
      this.broadcast('matchEnd', {
        winnerId: null,
        winnerName: null,
        potWon: 0,
        gemsWon: 0,
        refunded: true,
        balances: this._balancesSnapshot(),
      });
    }

    // Reset back to lobby for the next round after a short delay.
    setTimeout(() => this._resetToLobby(), 6000);
  }

  _balancesSnapshot() {
    const out = {};
    for (const id of this.players.keys()) {
      out[id] = {
        token: this.economy.getBalance(id),
        gems: this.economy.getGems(id),
      };
    }
    return out;
  }

  _resetToLobby() {
    this.state = STATE.LOBBY;
    this.pot = 0;
    this.winner = null;
    this.map = null;
    for (const p of this.players.values()) {
      p.ready = false;
      p.bet = 0;
      p.gemsThisMatch = 0;
    }
    this._stopLoop();
    this._emitLobby();
  }

  _emitLobby() {
    this.broadcast('lobby', {
      roomId: this.id,
      state: this.state,
      bet: this.bet,
      pot: this.pot,
      minPlayers: C.MIN_PLAYERS_TO_START,
      maxPlayers: C.MAX_PLAYERS,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        ready: p.ready,
        costume: p.costume,
        token: this.economy.getBalance(p.id),
        gems: this.economy.getGems(p.id),
      })),
    });
  }
}

Room.STATE = STATE;
module.exports = Room;
