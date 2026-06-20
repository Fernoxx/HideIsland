'use strict';

// In-match player state. One per connected socket that has joined a room.
class Player {
  constructor({ id, name, costume, weapon }) {
    this.id = id; // socket id
    this.name = name || 'Sailor';
    this.costume = costume || 'default';
    this.weapon = weapon || 'none';

    this.x = 0;
    this.y = 0;
    // Latest input from the client: a normalized movement vector.
    this.input = { dx: 0, dy: 0 };

    this.ready = false;
    this.alive = true;
    this.gemsThisMatch = 0;
    this.bet = 0; // tokens wagered into the current match pot
  }

  setInput(dx, dy) {
    // Clamp to a unit vector so diagonal movement isn't faster.
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    this.input.dx = dx;
    this.input.dy = dy;
  }

  // Snapshot sent to clients each tick (kept small).
  toNet() {
    return {
      id: this.id,
      name: this.name,
      costume: this.costume,
      weapon: this.weapon,
      x: Math.round(this.x),
      y: Math.round(this.y),
      ready: this.ready,
      gems: this.gemsThisMatch,
    };
  }
}

module.exports = Player;
