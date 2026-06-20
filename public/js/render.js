// 2D helpers that complement the 3D scene: shared costume colors and the
// top-down minimap overlay (kept as a lightweight 2D canvas).

const COSTUME_COLORS = {
  default: '#4fc3f7',
  captain: '#e57373',
  ghost: '#b39ddb',
  golden: '#ffd54f',
};

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
