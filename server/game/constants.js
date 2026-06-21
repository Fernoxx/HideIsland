'use strict';

// Shared game constants. Some of these are also sent to the client at runtime
// so rendering stays in sync with the authoritative simulation.
module.exports = {
  // World size in game units (the playable ocean square).
  WORLD_WIDTH: 3000,
  WORLD_HEIGHT: 3000,

  // Simulation tick rate (server steps per second).
  TICK_RATE: 30,

  // Player movement.
  PLAYER_RADIUS: 18,
  PLAYER_SPEED: 230, // units per second in open water
  LAND_SPEED_MULT: 0.78, // players slow down a bit on land

  // Islands.
  MIN_ISLANDS: 5,
  MAX_ISLANDS: 6,
  ISLAND_MIN_RADIUS: 220,
  ISLAND_MAX_RADIUS: 360,

  // Treasure.
  MIN_TREASURES: 1,
  MAX_TREASURES: 2,
  TREASURE_RADIUS: 22,
  TREASURE_PICKUP_DIST: 38, // how close you must be to grab it
  TREASURE_MIN_GEMS: 50,
  TREASURE_MAX_GEMS: 250,

  // Match flow.
  // Minimum players before a match can start. Override with the MIN_PLAYERS env
  // var (e.g. set MIN_PLAYERS=1 on your host to test solo in a single tab).
  MIN_PLAYERS_TO_START: Math.max(1, parseInt(process.env.MIN_PLAYERS, 10) || 2),
  MAX_PLAYERS: 10,
  COUNTDOWN_SECONDS: 5,
  MATCH_TIME_LIMIT_SECONDS: 240, // safety: end match if nobody finds treasure

  // Betting / economy.
  DEFAULT_BET: 10, // virtual token units wagered to join a match
  STARTING_BALANCE: 100, // virtual token balance granted to new mock wallets
};
