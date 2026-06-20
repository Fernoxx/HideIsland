// Entry point: wires login, lobby, networking and the render/input loop.
import { socket, request, on, emit } from './net.js';
import { initInput, getMoveVector } from './input.js';
import { renderMinimap } from './render.js';
import { initRenderer, buildWorld, syncPlayers, syncTreasures, renderFrame } from './render3d.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const minimap = $('minimap');

// Central client state.
const state = {
  selfId: null,
  inMatch: false,
  world: { width: 3000, height: 3000 },
  islands: [],
  players: [],
  treasureMarkers: [],
  treasureCount: 0,
  pot: 0,
  gems: 0,
};

// ---- Boot ----
initInput();
ui.initModalCloses();
ui.initShopTabs();
initRenderer(canvas); // three.js scene (handles its own resize)
ui.showScreen('login');

socket.on('connect', () => { state.selfId = socket.id; });

// ===== Login =====
async function doLogin(authPayload) {
  $('login-hint').textContent = 'Connecting...';
  const res = await request('login', authPayload);
  if (!res.ok) { $('login-hint').textContent = res.message || 'Login failed.'; return; }
  state.gems = res.gems;
  // Immediately enter matchmaking with the chosen profile.
  const ownedCostume = (res.ownership?.costumes || []).slice(-1)[0] || 'default';
  const ownedWeapon = (res.ownership?.weapons || []).slice(-1)[0] || 'none';
  const join = await request('joinGame', {
    name: authPayload.name || res.displayName,
    costume: ownedCostume,
    weapon: ownedWeapon,
  });
  if (!join.ok) { $('login-hint').textContent = join.message; return; }
  ui.showScreen('lobby');
}

$('btn-login').onclick = () => {
  const name = $('login-name').value.trim() || 'Sailor';
  doLogin({ name, handle: name });
};

$('btn-login-x').onclick = async () => {
  // PRODUCTION: run the Privy login flow in the browser, then pass the access
  // token here. Without the Privy SDK configured we fall back to guest login.
  $('login-hint').textContent =
    'Privy/X login isn\'t configured in this build — joining as guest.';
  const name = $('login-name').value.trim() || 'Player';
  doLogin({ name, handle: name /*, privyAccessToken: <token> */ });
};

// ===== Lobby controls =====
$('btn-ready').onclick = () => {
  const me = state.players.find((p) => p.id === state.selfId);
  emit('ready', !(me && me.ready));
};
$('btn-leave').onclick = () => { emit('leaveRoom'); location.reload(); };
$('btn-shop').onclick = ui.openShop;
$('btn-wallet').onclick = ui.openWallet;
$('btn-back-lobby').onclick = () => ui.showScreen('lobby');

// ===== Server events =====
on('lobby', (data) => {
  state.players = data.players;
  state.pot = data.pot;
  if (!state.inMatch) ui.renderLobby(data, state.selfId);
});

on('countdown', (data) => {
  ui.showScreen('lobby');
  $('lobby-hint').textContent = `Starting in ${data.seconds}...`;
});

on('matchStart', (data) => {
  state.inMatch = true;
  state.world = data.world;
  state.islands = data.islands;
  state.treasureCount = data.treasureCount;
  state.pot = data.pot;
  state.players = data.players;
  state.treasureMarkers = [];
  buildWorld(state); // construct the 3D islands/ocean for this match
  ui.showScreen(null); // hide all screens, show HUD
  ui.setHud({ pot: data.pot, treasureCount: data.treasureCount, gems: state.gems });
  ui.logEvent('🚣 The hunt begins! Find the treasure first.');
});

on('state', (data) => {
  state.players = data.players;
  const me = data.players.find((p) => p.id === state.selfId);
  ui.setHud({ timeLeft: data.timeLeft, gems: me ? me.gems : 0 });
});

on('treasureFound', (data) => {
  state.treasureMarkers.push({ x: data.x, y: data.y, gems: data.gems });
  ui.logEvent(`💎 ${data.playerName} found treasure (+${data.gems} gems)!`);
});

on('matchEnd', (data) => {
  state.inMatch = false;
  const won = data.winnerId === state.selfId;
  if (data.balances && data.balances[state.selfId]) {
    state.gems = data.balances[state.selfId].gems;
  }
  $('result-title').textContent = data.refunded
    ? '⏱ Time Up — No Winner'
    : won ? '🏆 You Won!' : '🏝️ Match Over';
  $('result-body').innerHTML = data.refunded
    ? 'Nobody found the treasure in time. All bets were refunded.'
    : `<b>${data.winnerName}</b> grabbed the treasure first!<br>` +
      `Won the pot: 🪙 <b>${data.potWon}</b><br>` +
      `Gems collected: 💎 <b>${data.gemsWon}</b>` +
      (won ? '<br><br>The pot and gems are yours. 🎉' : '');
  ui.showScreen('result');
});

on('errorMsg', (data) => { $('lobby-hint').textContent = data.message; });

// ===== Game loop =====
let lastSent = 0;
function loop(ts) {
  if (state.inMatch) {
    // Send input ~20x/sec.
    if (ts - lastSent > 50) {
      emit('input', getMoveVector());
      lastSent = ts;
    }
    syncPlayers(state);
    syncTreasures(state);
    renderFrame(state);
    renderMinimap(minimap, state);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
