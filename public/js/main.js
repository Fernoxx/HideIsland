// Entry point: wires login, lobby, networking and the render/input loop.
// The 3D renderer (three.js) is loaded LAZILY and guarded so that even if the
// 3D layer fails to load, the UI (login, lobby, betting, shop) still works.
import { socket, request, on, emit } from './net.js';
import { initInput, getMoveVector } from './input.js';
import { renderMinimap } from './render.js';
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

// ---- Lazy 3D renderer ----
// Dynamically imported so a three.js load error can't break the core UI.
let r3d = null;
let r3dTried = false;
async function ensureRenderer() {
  if (r3d || r3dTried) return r3d;
  r3dTried = true;
  try {
    r3d = await import('./render3d.js');
    r3d.initRenderer(canvas);
    console.log('[hide-island] 3D renderer ready');
  } catch (e) {
    console.error('[hide-island] 3D renderer failed to load:', e);
    r3d = null; // game still runs with the 2D minimap only
  }
  return r3d;
}

// ---- Boot ----
// Attach all UI handlers FIRST so the buttons always respond, then warm up the
// renderer in the background.
initInput();
ui.initModalCloses();
ui.initShopTabs();
wireHandlers();
wireServerEvents();
ui.showScreen('login');
ensureRenderer(); // non-blocking preload

socket.on('connect', () => { state.selfId = socket.id; });
socket.on('connect_error', (err) => {
  $('login-hint').textContent = 'Cannot reach the game server. Is it running?';
  console.error('[hide-island] socket connect_error:', err.message);
});

// ===== Login =====
async function doLogin(authPayload) {
  $('login-hint').textContent = 'Connecting...';
  if (!socket.connected) {
    // Give the socket a moment if the page just loaded.
    await new Promise((r) => {
      if (socket.connected) return r();
      socket.once('connect', r);
      setTimeout(r, 3000);
    });
  }
  if (!socket.connected) {
    $('login-hint').textContent = 'Cannot reach the game server. Is it running?';
    return;
  }
  let res;
  try {
    res = await request('login', authPayload);
  } catch (e) {
    $('login-hint').textContent = 'Login failed: ' + e.message;
    return;
  }
  if (!res || !res.ok) { $('login-hint').textContent = (res && res.message) || 'Login failed.'; return; }
  state.gems = res.gems;
  const ownedCostume = (res.ownership?.costumes || []).slice(-1)[0] || 'default';
  const ownedWeapon = (res.ownership?.weapons || []).slice(-1)[0] || 'none';
  const join = await request('joinGame', {
    name: authPayload.name || res.displayName,
    costume: ownedCostume,
    weapon: ownedWeapon,
  });
  if (!join || !join.ok) { $('login-hint').textContent = (join && join.message) || 'Could not join.'; return; }
  ui.showScreen('lobby');
}

function wireHandlers() {
  $('btn-login').onclick = () => {
    const name = $('login-name').value.trim() || 'Sailor';
    doLogin({ name, handle: name });
  };

  $('btn-login-x').onclick = () => {
    // PRODUCTION: run the Privy login flow in the browser, then pass the access
    // token here. Without Privy configured we fall back to guest login.
    $('login-hint').textContent = "Privy/X login isn't configured yet — joining as guest.";
    const name = $('login-name').value.trim() || 'Player';
    doLogin({ name, handle: name /*, privyAccessToken: <token> */ });
  };

  // Lobby controls.
  $('btn-ready').onclick = () => {
    const me = state.players.find((p) => p.id === state.selfId);
    emit('ready', !(me && me.ready));
  };
  $('btn-leave').onclick = () => { emit('leaveRoom'); location.reload(); };
  $('btn-shop').onclick = ui.openShop;
  $('btn-wallet').onclick = ui.openWallet;
  $('btn-back-lobby').onclick = () => ui.showScreen('lobby');
}

// ===== Server events =====
function wireServerEvents() {
  on('lobby', (data) => {
    state.players = data.players;
    state.pot = data.pot;
    if (!state.inMatch) ui.renderLobby(data, state.selfId);
  });

  on('countdown', (data) => {
    ui.showScreen('lobby');
    $('lobby-hint').textContent = `Starting in ${data.seconds}...`;
  });

  on('matchStart', async (data) => {
    state.inMatch = true;
    state.world = data.world;
    state.islands = data.islands;
    state.treasureCount = data.treasureCount;
    state.pot = data.pot;
    state.players = data.players;
    state.treasureMarkers = [];
    const renderer = await ensureRenderer();
    if (renderer) renderer.buildWorld(state);
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
}

// ===== Game loop =====
let lastSent = 0;
function loop(ts) {
  if (state.inMatch) {
    if (ts - lastSent > 50) {
      emit('input', getMoveVector());
      lastSent = ts;
    }
    if (r3d) {
      r3d.syncPlayers(state);
      r3d.syncTreasures(state);
      r3d.renderFrame(state);
    }
    renderMinimap(minimap, state);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
