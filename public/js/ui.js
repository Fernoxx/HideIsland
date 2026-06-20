// DOM/UI helpers: screen switching, lobby list, shop, wallet, HUD log.
import { request, emit } from './net.js';
import { COSTUME_COLORS } from './render.js';

const $ = (id) => document.getElementById(id);

export function showScreen(name) {
  for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
  if (name) $('screen-' + name).classList.remove('hidden');
  $('hud').classList.toggle('hidden', name !== null);
}

export function setHud({ timeLeft, pot, treasureCount, gems }) {
  if (timeLeft != null) $('hud-timer').textContent = '⏱ ' + timeLeft + 's';
  if (pot != null) $('hud-pot').textContent = '🪙 Pot: ' + pot;
  if (treasureCount != null) $('hud-treasures').textContent = '🗺️ Treasures: ' + treasureCount;
  if (gems != null) $('hud-gems').textContent = '💎 ' + gems;
}

export function logEvent(text) {
  const log = $('hud-log');
  const div = document.createElement('div');
  div.textContent = text;
  log.appendChild(div);
  while (log.children.length > 4) log.removeChild(log.firstChild);
  setTimeout(() => div.remove(), 6000);
}

export function renderLobby(data, selfId) {
  $('lobby-bet').textContent = data.bet;
  $('lobby-pot').textContent = data.pot;
  $('lobby-min').textContent = data.minPlayers;

  const me = data.players.find((p) => p.id === selfId);
  if (me) {
    $('lobby-token').textContent = '🪙 ' + me.token;
    $('lobby-gems').textContent = '💎 ' + me.gems;
    $('btn-ready').textContent = me.ready ? '✓ Ready (cancel)' : 'Ready & Bet';
    $('btn-ready').classList.toggle('ghost', me.ready);
  }

  const list = $('player-list');
  list.innerHTML = '';
  for (const p of data.players) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = COSTUME_COLORS[p.costume] || COSTUME_COLORS.default;
    const name = document.createElement('span');
    name.className = 'pname';
    name.textContent = p.name + (p.id === selfId ? ' (you)' : '');
    const status = document.createElement('span');
    status.className = 'pstatus' + (p.ready ? ' ready' : '');
    status.textContent = p.ready ? '✓ Ready' : 'Waiting';
    li.append(dot, name, status);
    list.appendChild(li);
  }

  const enough = data.players.length >= data.minPlayers;
  $('lobby-hint').textContent = enough
    ? 'All players must ready up to start.'
    : `Waiting for more players (${data.players.length}/${data.minPlayers})...`;
}

// ===== Modals =====
export function openModal(id) { $(id).classList.remove('hidden'); }
export function closeModal(id) { $(id).classList.add('hidden'); }

export async function openShop() {
  const data = await request('getShop');
  renderShop(data, 'weapons');
  openModal('modal-shop');
}

let shopData = null;
function renderShop(data, tab) {
  shopData = data;
  $('shop-gems').textContent = '💎 ' + data.gems;
  for (const t of document.querySelectorAll('.shop-tabs .tab')) {
    t.classList.toggle('active', t.dataset.tab === tab);
  }
  const items = tab === 'weapons' ? data.catalog.weapons : data.catalog.costumes;
  const owned = tab === 'weapons' ? data.ownership.weapons : data.ownership.costumes;
  const kind = tab === 'weapons' ? 'weapon' : 'costume';

  const container = $('shop-items');
  container.innerHTML = '';
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'shop-item';

    const swatch = document.createElement('div');
    swatch.className = 'si-swatch';
    swatch.style.background = item.color || '#2c5364';
    if (!item.color) swatch.textContent = '⚔️';

    const info = document.createElement('div');
    info.className = 'si-info';
    info.innerHTML = `<div class="si-name">${item.name}</div>
      <div class="si-meta">${item.damage ? 'DMG ' + item.damage + ' • ' : ''}${item.price ? '💎 ' + item.price : 'Free'}</div>`;

    row.append(swatch, info);

    if (owned.includes(item.id)) {
      const tag = document.createElement('span');
      tag.className = 'owned';
      tag.textContent = '✓ Owned';
      row.appendChild(tag);
    } else {
      const btn = document.createElement('button');
      btn.className = 'primary';
      btn.textContent = 'Buy';
      btn.onclick = async () => {
        const res = await request('buy', { kind, itemId: item.id });
        if (!res.ok) { alert(res.message); return; }
        renderShop({ ...shopData, gems: res.gems, ownership: res.ownership }, tab);
      };
      row.appendChild(btn);
    }
    container.appendChild(row);
  }
}

export function initShopTabs() {
  for (const t of document.querySelectorAll('.shop-tabs .tab')) {
    t.onclick = () => renderShop(shopData, t.dataset.tab);
  }
}

export async function openWallet() {
  const data = await request('getWallet');
  const body = $('wallet-body');
  const dep = data.deposit || {};
  body.innerHTML = `
    <div class="wallet-row"><span>Betting token</span><b>🪙 ${data.token}</b></div>
    <div class="wallet-row"><span>Gems</span><b>💎 ${data.gems}</b></div>
    <div class="wallet-row" style="flex-direction:column;align-items:flex-start;gap:6px">
      <span>Deposit address (Solana)</span>
      <span class="wallet-addr">${dep.depositAddress || '—'}</span>
    </div>
    ${dep.buyTokenUrl ? `<a href="${dep.buyTokenUrl}" target="_blank" rel="noopener"><button class="primary" style="width:100%">Buy game token</button></a>` : ''}
    <p class="hint">${dep.note || 'Fund your embedded wallet with SOL or the game token to bet on-chain.'}</p>
  `;
  openModal('modal-wallet');
}

export function initModalCloses() {
  for (const btn of document.querySelectorAll('[data-close]')) {
    btn.onclick = () => closeModal(btn.dataset.close);
  }
}
