// Canvas renderer: a top-down camera that follows the local player across the
// ocean world, drawing islands, other players and any revealed treasures.

const COSTUME_COLORS = {
  default: '#4fc3f7',
  captain: '#e57373',
  ghost: '#b39ddb',
  golden: '#ffd54f',
};

const WEAPON_ICON = { none: '', cutlass: '🗡️', pistol: '🔫', cannon: '💣' };

export function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function render(canvas, state) {
  const ctx = canvas.getContext('2d');
  const W = window.innerWidth;
  const H = window.innerHeight;

  ctx.clearRect(0, 0, W, H);

  const me = state.players.find((p) => p.id === state.selfId);
  const camX = me ? me.x : state.world.width / 2;
  const camY = me ? me.y : state.world.height / 2;

  // Camera transform: center on the player.
  const ox = W / 2 - camX;
  const oy = H / 2 - camY;

  // --- Ocean background with subtle moving texture ---
  drawOcean(ctx, W, H, camX, camY);

  ctx.save();
  ctx.translate(ox, oy);

  // World border.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, state.world.width, state.world.height);

  // --- Islands ---
  for (const isl of state.islands) {
    drawIsland(ctx, isl);
  }

  // --- Revealed treasures (only those someone has found) ---
  for (const t of state.treasureMarkers) {
    drawTreasure(ctx, t);
  }

  // --- Players ---
  for (const p of state.players) {
    drawPlayer(ctx, p, p.id === state.selfId);
  }

  ctx.restore();
}

function drawOcean(ctx, W, H, camX, camY) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a4d68');
  g.addColorStop(1, '#053246');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Faint wave dots that scroll opposite the camera for a sense of motion.
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  const spacing = 60;
  const sx = -((camX) % spacing);
  const sy = -((camY) % spacing);
  for (let x = sx; x < W; x += spacing) {
    for (let y = sy; y < H; y += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawIsland(ctx, isl) {
  // Shallow water ring.
  ctx.beginPath();
  ctx.arc(isl.x, isl.y, isl.radius + 26, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(79,195,247,0.18)';
  ctx.fill();

  // Sand.
  ctx.beginPath();
  ctx.arc(isl.x, isl.y, isl.radius, 0, Math.PI * 2);
  ctx.fillStyle = '#e0c984';
  ctx.fill();

  // Grass core.
  ctx.beginPath();
  ctx.arc(isl.x, isl.y, isl.radius * 0.7, 0, Math.PI * 2);
  ctx.fillStyle = '#5f9a52';
  ctx.fill();

  // A couple of palm trees for flavor (deterministic by island id).
  const trees = 3 + (isl.id % 3);
  for (let i = 0; i < trees; i++) {
    const a = (i / trees) * Math.PI * 2 + isl.id;
    const r = isl.radius * 0.45;
    const tx = isl.x + Math.cos(a) * r;
    const ty = isl.y + Math.sin(a) * r;
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🌴', tx, ty);
  }
}

function drawTreasure(ctx, t) {
  ctx.save();
  const pulse = 1 + 0.12 * Math.sin(Date.now() / 200);
  ctx.font = `${28 * pulse}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('💎', t.x, t.y);
  ctx.restore();
}

function drawPlayer(ctx, p, isSelf) {
  const color = COSTUME_COLORS[p.costume] || COSTUME_COLORS.default;
  const r = 18;

  // Body.
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = isSelf ? 4 : 2;
  ctx.strokeStyle = isSelf ? '#fff' : 'rgba(0,0,0,0.4)';
  ctx.stroke();

  // Weapon icon.
  const icon = WEAPON_ICON[p.weapon];
  if (icon) {
    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.fillText(icon, p.x + r, p.y - r);
  }

  // Name tag.
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(p.name + (p.gems ? ` 💎${p.gems}` : ''), p.x, p.y - r - 6);
}

// Minimap: islands + all players on a compact overview.
export function renderMinimap(canvas, state) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const sx = w / state.world.width;
  const sy = h / state.world.height;

  for (const isl of state.islands) {
    ctx.beginPath();
    ctx.arc(isl.x * sx, isl.y * sy, Math.max(2, isl.radius * sx), 0, Math.PI * 2);
    ctx.fillStyle = '#5f9a52';
    ctx.fill();
  }
  for (const t of state.treasureMarkers) {
    ctx.fillStyle = '#ffd54f';
    ctx.fillRect(t.x * sx - 2, t.y * sy - 2, 4, 4);
  }
  for (const p of state.players) {
    ctx.beginPath();
    ctx.arc(p.x * sx, p.y * sy, p.id === state.selfId ? 3 : 2, 0, Math.PI * 2);
    ctx.fillStyle = p.id === state.selfId ? '#fff' : '#4fc3f7';
    ctx.fill();
  }
}

export { COSTUME_COLORS };
