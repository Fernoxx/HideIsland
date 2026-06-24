// 2D top-down PIXEL renderer (kintara.com-style). Replaces the 3D renderer.
// Same export surface as the old render3d.js so main.js needs no rework:
//   initRenderer, buildWorld, syncPlayers, syncTreasures, renderFrame, setCinematic
//
// The server still sends (x, y) on a flat 2000-3000 unit world; we draw it
// top-down with a tile grid for water/sand/grass and hand-drawn pixel sailors.

import { COSTUME_COLORS } from './render.js';

const TILE = 40;          // world units per terrain tile
const ZOOM = 1.7;         // world->screen scale
const PX = 3;             // screen px per character "sprite pixel"

let canvas, ctx, W = 0, H = 0;
let world = { width: 3000, height: 3000 };
let islands = [];
let trees = [];           // decorative trees per island
let cinematic = false;

const pstate = new Map();   // id -> render state {x,y,tx,ty,facing,flip,phase}
const revealed = [];        // treasures that have been found
let cam = { x: 1500, y: 1500 };
let lastT = performance.now();

// Distinct, friendly colors so every user is visually different.
const PALETTE = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6',
  '#e67e22', '#1abc9c', '#ff6fae', '#16a085', '#fd79a8'];

const SKIN = '#f3c98b', SKIN_D = '#d9a96a';
const PANTS = '#37475a', AXE_H = '#7a4a1e', AXE_B = '#cfd4d8', AXE_BD = '#9aa0a6';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (dt, k) => 1 - Math.exp(-dt * k);
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function hash2(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }

export function initRenderer(c) {
  canvas = c;
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false; // crisp pixels
}

export function setCinematic(v) { cinematic = v; }

export function buildWorld(state) {
  world = state.world;
  islands = state.islands || [];
  revealed.length = 0;
  pstate.clear();

  // Decorative trees scattered on each island (deterministic).
  trees = [];
  for (const isl of islands) {
    const n = 3 + (isl.id % 4);
    for (let i = 0; i < n; i++) {
      const a = isl.id * 1.3 + i * 2.39;
      const r = isl.radius * (0.25 + hash2(isl.id, i) * 0.4);
      trees.push({ x: isl.x + Math.cos(a) * r, y: isl.y + Math.sin(a) * r, kind: i % 2 });
    }
  }
  trees.sort((a, b) => a.y - b.y);
  cam.x = world.width / 2; cam.y = world.height / 2;
}

// ----- terrain -----
function terrainAt(wx, wy) {
  for (const isl of islands) {
    const d = Math.hypot(wx - isl.x, wy - isl.y);
    if (d <= isl.radius + 10) {
      if (d > isl.radius - 6) return 'shore';
      if (d > isl.radius * 0.6) return 'sand';
      return 'grass';
    }
  }
  return 'water';
}

function s2(wx, wy) { return { x: (wx - cam.x) * ZOOM + W / 2, y: (wy - cam.y) * ZOOM + H / 2 }; }

function drawTerrain(t) {
  const half = TILE * ZOOM;
  const left = cam.x - (W / 2) / ZOOM, right = cam.x + (W / 2) / ZOOM;
  const top = cam.y - (H / 2) / ZOOM, bottom = cam.y + (H / 2) / ZOOM;
  const tx0 = Math.floor(left / TILE) - 1, tx1 = Math.ceil(right / TILE) + 1;
  const ty0 = Math.floor(top / TILE) - 1, ty1 = Math.ceil(bottom / TILE) + 1;

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const wx = tx * TILE + TILE / 2, wy = ty * TILE + TILE / 2;
      const kind = terrainAt(wx, wy);
      const v = hash2(tx, ty);
      let col;
      if (kind === 'water') {
        // animated pixel sea: shifting light bands
        const wave = Math.sin((tx + ty) * 0.7 + t * 1.6) * 0.5 + 0.5;
        col = wave > 0.78 ? '#2a86a6' : (v > 0.85 ? '#1a6b89' : '#176079');
      } else if (kind === 'shore') {
        col = '#efe1a6';
      } else if (kind === 'sand') {
        col = v > 0.8 ? '#e9d28b' : '#e3c878';
      } else {
        col = v > 0.82 ? '#4f9046' : (v > 0.5 ? '#5aa050' : '#54994c');
      }
      const p = s2(tx * TILE, ty * TILE);
      ctx.fillStyle = col;
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), Math.ceil(half) + 1, Math.ceil(half) + 1);
    }
  }
}

function drawTrees() {
  for (const tr of trees) {
    const p = s2(tr.x, tr.y);
    if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) continue;
    const u = PX;
    // trunk
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(Math.floor(p.x - u), Math.floor(p.y - u), u * 2, u * 3);
    // canopy (palm vs bush)
    if (tr.kind === 0) {
      ctx.fillStyle = '#2f8a3e';
      ctx.fillRect(Math.floor(p.x - u * 4), Math.floor(p.y - u * 5), u * 8, u * 3);
      ctx.fillRect(Math.floor(p.x - u * 2), Math.floor(p.y - u * 7), u * 4, u * 3);
    } else {
      ctx.fillStyle = '#3aa14b';
      ctx.fillRect(Math.floor(p.x - u * 3), Math.floor(p.y - u * 6), u * 6, u * 5);
      ctx.fillStyle = '#2f8a3e';
      ctx.fillRect(Math.floor(p.x - u * 3), Math.floor(p.y - u * 2), u * 6, u * 2);
    }
  }
}

// ----- treasures -----
export function syncTreasures(state) {
  for (const tmk of state.treasureMarkers || []) {
    const key = tmk.x + ',' + tmk.y;
    if (!revealed.find((r) => r.key === key)) revealed.push({ key, x: tmk.x, y: tmk.y });
  }
}

function drawChest(p, t) {
  const u = PX;
  const bob = Math.sin(t * 3 + p.x) * 2;
  const x = Math.floor(p.x - u * 5), y = Math.floor(p.y - u * 4 + bob);
  // glow
  ctx.fillStyle = 'rgba(255,210,90,0.25)';
  ctx.beginPath(); ctx.arc(p.x, p.y + bob, u * 8, 0, Math.PI * 2); ctx.fill();
  // body
  ctx.fillStyle = '#7a4a1e'; ctx.fillRect(x, y + u * 3, u * 10, u * 5);
  // lid
  ctx.fillStyle = '#955a26'; ctx.fillRect(x, y, u * 10, u * 3);
  // gold band + lock
  ctx.fillStyle = '#ffd54f'; ctx.fillRect(x, y + u * 2, u * 10, u);
  ctx.fillRect(x + u * 4, y + u * 1, u * 2, u * 4);
}

// ----- players -----
export function syncPlayers(state) {
  const seen = new Set();
  for (const p of state.players || []) {
    seen.add(p.id);
    let st = pstate.get(p.id);
    if (!st) {
      st = { x: p.x, y: p.y, tx: p.x, ty: p.y, facing: 'down', flip: false, phase: 0, color: colorFor(p) };
      pstate.set(p.id, st);
    }
    st.tx = p.x; st.ty = p.y;
    st.name = p.name; st.gems = p.gems; st.costume = p.costume;
    st.color = colorFor(p);
  }
  for (const id of [...pstate.keys()]) if (!seen.has(id)) pstate.delete(id);
}

function colorFor(p) {
  if (p.costume && p.costume !== 'default' && COSTUME_COLORS[p.costume]) return COSTUME_COLORS[p.costume];
  return PALETTE[hashStr(p.id) % PALETTE.length];
}

// Draw one pixel sailor at screen (cx, feetY). Faces `facing`, walks via phase.
function drawCharacter(cx, feetY, st, isSelf) {
  const u = PX;
  const swing = Math.sin(st.phase) * u; // limb swing
  const moving = st.moving;
  // pixel helper relative to sprite top-left; sprite is 16 wide x 22 tall
  const ox = Math.floor(cx - 8 * u);
  const oy = Math.floor(feetY - 22 * u);
  const flip = st.flip;
  const rp = (px, py, pw, ph, color) => {
    const fx = flip ? (16 - px - pw) : px;
    ctx.fillStyle = color;
    ctx.fillRect(ox + fx * u, oy + py * u, pw * u, ph * u);
  };

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx, feetY, 7 * u, 2.4 * u, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs (pants) — alternate stride read from the top: legs spread/close
  const stride = moving ? Math.round(Math.sin(st.phase)) : 0; // -1,0,1
  const lLeg = 4 - stride, rLeg = 9 + stride;
  rp(lLeg, 18, 3, 4, PANTS);
  rp(rLeg, 18, 3, 4, PANTS);
  // boots
  rp(lLeg, 21, 3, 1, '#222');
  rp(rLeg, 21, 3, 1, '#222');

  // body / tunic (player color)
  rp(3, 10, 10, 9, st.color);
  // belt
  rp(3, 16, 10, 1, '#2a2a2a');
  // tunic shading
  rp(3, 10, 2, 9, shade(st.color, -18));

  // arms (skin) with swing
  const armOff = moving ? Math.round(swing) : 0;
  rp(1, 10 + armOff, 3, 7, SKIN);   // back/left arm
  rp(12, 10 - armOff, 3, 7, SKIN);  // front/right arm (holds axe)

  // head
  rp(5, 3, 6, 7, SKIN);
  rp(5, 3, 6, 1, SKIN_D);
  // hair / bandana (use a darkened player color as a hat to vary per user)
  rp(5, 2, 6, 2, shade(st.color, -35));
  rp(4, 3, 1, 2, shade(st.color, -35));
  rp(11, 3, 1, 2, shade(st.color, -35));

  // face (only when facing down or sideways)
  if (st.facing !== 'up') {
    rp(6, 6, 1, 1, '#222');
    rp(9, 6, 1, 1, '#222');
  }

  // AXE in the front hand
  drawAxe(ox, oy, u, flip, moving ? -armOff : 0);

  // name + gems label
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  const label = st.name + (st.gems ? '  💎' + st.gems : '');
  const tw = ctx.measureText(label).width + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(cx - tw / 2, oy - 18, tw, 16);
  ctx.fillStyle = isSelf ? '#ffe66d' : '#fff';
  ctx.fillText(label, cx, oy - 6);
}

function drawAxe(ox, oy, u, flip, off) {
  const fx = (px, pw) => flip ? (16 - px - pw) : px;
  // handle
  ctx.fillStyle = AXE_H;
  ctx.fillRect(ox + fx(13, 2) * u, oy + (6 + off) * u, 2 * u, 11 * u);
  // blade
  ctx.fillStyle = AXE_B;
  ctx.fillRect(ox + fx(flip ? 11 : 15, 3) * u, oy + (5 + off) * u, 3 * u, 4 * u);
  ctx.fillStyle = AXE_BD;
  ctx.fillRect(ox + fx(flip ? 11 : 15, 3) * u, oy + (8 + off) * u, 3 * u, 1 * u);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
  return `rgb(${r},${g},${b})`;
}

// ----- main frame -----
export function renderFrame(state) {
  if (!ctx) return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const t = now / 1000;

  // advance player interpolation + animation
  for (const st of pstate.values()) {
    const px = st.x, py = st.y;
    st.x += (st.tx - st.x) * smooth(dt, 12);
    st.y += (st.ty - st.y) * smooth(dt, 12);
    const vx = st.x - px, vy = st.y - py;
    const sp = Math.hypot(vx, vy);
    st.moving = sp > 0.3;
    if (st.moving) {
      st.phase += dt * 12;
      if (Math.abs(vx) > Math.abs(vy)) { st.facing = 'side'; st.flip = vx < 0; }
      else st.facing = vy < 0 ? 'up' : 'down';
    }
  }

  // camera target
  let target = pstate.get(state.selfId);
  if (!target) target = pstate.values().next().value;
  if (target) {
    cam.x += (target.x - cam.x) * smooth(dt, cinematic ? 1.5 : 7);
    cam.y += (target.y - cam.y) * smooth(dt, cinematic ? 1.5 : 7);
  }
  // keep camera inside the world a bit
  cam.x = clamp(cam.x, 0, world.width);
  cam.y = clamp(cam.y, 0, world.height);

  // draw
  drawTerrain(t);
  drawTrees();
  for (const r of revealed) {
    const p = s2(r.x, r.y);
    if (p.x > -60 && p.x < W + 60 && p.y > -60 && p.y < H + 60) drawChest(p, t);
  }
  // players sorted by y (painter's algorithm)
  const ordered = [...pstate.values()].sort((a, b) => a.y - b.y);
  for (const st of ordered) {
    const p = s2(st.x, st.y);
    if (p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 120) continue;
    drawCharacter(p.x, p.y, st, st === pstate.get(state.selfId));
  }
}
