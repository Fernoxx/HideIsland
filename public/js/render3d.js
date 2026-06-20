// 3D renderer powered by three.js.
//
// The authoritative server thinks in 2D: it sends player/treasure/island
// coordinates as (x, y) on a flat world. We map that onto a 3D ground plane:
//     server.x -> world X
//     server.y -> world Z
//     world Y  -> up (height)
// so no server changes are needed — we just present the same simulation in 3D.

import * as THREE from 'three';
import { COSTUME_COLORS } from './render.js';

let renderer, scene, camera, clock, sun;
let ocean, oceanBase; // animated water
let worldSize = { width: 3000, height: 3000 };

const islandGroup = new THREE.Group();
const treasureGroup = new THREE.Group();
const playerGroup = new THREE.Group();

const playerMeshes = new Map(); // id -> { group, body, label, labelText, targetPos }
const treasureMeshes = new Map(); // key -> mesh

// Smoothed camera focus so the view glides instead of snapping.
const camFocus = new THREE.Vector3(1500, 0, 1500);

export function initRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a4d68);
  scene.fog = new THREE.Fog(0x0a4d68, 600, 2200);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 6000);
  camera.position.set(1500, 320, 1900);
  camera.lookAt(1500, 0, 1500);

  clock = new THREE.Clock();

  // --- Lighting ---
  const hemi = new THREE.HemisphereLight(0xbfe9ff, 0x2b5a4a, 0.9);
  scene.add(hemi);

  sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // Tight ortho frustum that we keep centered on the player for crisp shadows.
  const s = 500;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 1200;
  scene.add(sun);
  scene.add(sun.target);

  scene.add(islandGroup, treasureGroup, playerGroup);

  buildOcean();

  window.addEventListener('resize', onResize);
}

function onResize() {
  if (!renderer) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function buildOcean() {
  const size = 6000;
  const seg = 120;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  // Remember the flat baseline so we can animate waves around it.
  oceanBase = Float32Array.from(geo.attributes.position.array);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x0e6b8f,
    roughness: 0.35,
    metalness: 0.1,
    transparent: true,
    opacity: 0.95,
  });
  ocean = new THREE.Mesh(geo, mat);
  ocean.position.set(worldSize.width / 2, 0, worldSize.height / 2);
  ocean.receiveShadow = true;
  scene.add(ocean);
}

function animateOcean(t) {
  if (!ocean) return;
  const pos = ocean.geometry.attributes.position;
  const arr = pos.array;
  for (let i = 0; i < arr.length; i += 3) {
    const x = oceanBase[i];
    const z = oceanBase[i + 2];
    arr[i + 1] =
      Math.sin(x * 0.01 + t * 1.1) * 6 +
      Math.cos(z * 0.013 + t * 0.9) * 6;
  }
  pos.needsUpdate = true;
  ocean.geometry.computeVertexNormals();
}

// Build the static world (islands) for a new match.
export function buildWorld(state) {
  worldSize = state.world;
  if (ocean) ocean.position.set(worldSize.width / 2, 0, worldSize.height / 2);

  clearGroup(islandGroup);
  clearGroup(treasureGroup);
  treasureMeshes.clear();

  for (const isl of state.islands) {
    islandGroup.add(buildIsland(isl));
  }
}

function buildIsland(isl) {
  const g = new THREE.Group();
  g.position.set(isl.x, 0, isl.y);
  const R = isl.radius;

  // Sand base (a shallow cone so it rises out of the water).
  const sand = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R * 1.08, 40, 40),
    new THREE.MeshStandardMaterial({ color: 0xe0c984, roughness: 1 })
  );
  sand.position.y = 4;
  sand.receiveShadow = true;
  sand.castShadow = true;
  g.add(sand);

  // Grassy dome on top.
  const grass = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.72, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x5f9a52, roughness: 0.9 })
  );
  grass.position.y = 22;
  grass.scale.y = 0.4;
  grass.receiveShadow = true;
  grass.castShadow = true;
  g.add(grass);

  // A few palm trees, deterministic per island so they don't jump around.
  const trees = 3 + (isl.id % 3);
  for (let i = 0; i < trees; i++) {
    const a = (i / trees) * Math.PI * 2 + isl.id;
    const r = R * 0.45;
    g.add(buildPalm(Math.cos(a) * r, Math.sin(a) * r));
  }
  return g;
}

function buildPalm(x, z) {
  const palm = new THREE.Group();
  palm.position.set(x, 30, z);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 6, 70, 8),
    new THREE.MeshStandardMaterial({ color: 0x8d6748, roughness: 1 })
  );
  trunk.position.y = 35;
  trunk.castShadow = true;
  palm.add(trunk);

  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9d4f, roughness: 0.8 });
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(10, 46, 6), leafMat);
    leaf.position.y = 70;
    leaf.rotation.z = Math.PI / 2.6;
    leaf.rotation.y = (i / 5) * Math.PI * 2;
    leaf.castShadow = true;
    palm.add(leaf);
  }
  return palm;
}

// Treasure chests appear only once revealed (someone found one).
export function syncTreasures(state) {
  for (const t of state.treasureMarkers) {
    const key = `${t.x},${t.y}`;
    if (treasureMeshes.has(key)) continue;
    const chest = buildChest();
    chest.position.set(t.x, 28, t.y);
    treasureGroup.add(chest);
    treasureMeshes.set(key, chest);
  }
}

function buildChest() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a1e, roughness: 0.8 });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xffd54f, emissive: 0xffaa00, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.3,
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(46, 28, 32), wood);
  base.castShadow = true;
  g.add(base);

  const lid = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 46, 16, 1, false, 0, Math.PI), gold);
  lid.rotation.z = Math.PI / 2;
  lid.position.y = 14;
  lid.castShadow = true;
  g.add(lid);

  // Glow so it pops on the island.
  const light = new THREE.PointLight(0xffcc55, 2, 260, 2);
  light.position.set(0, 40, 0);
  g.add(light);

  g.userData.spin = lid;
  return g;
}

// Create/update/remove player avatars to match the latest snapshot.
export function syncPlayers(state) {
  const seen = new Set();
  for (const p of state.players) {
    seen.add(p.id);
    let entry = playerMeshes.get(p.id);
    if (!entry) {
      entry = buildPlayer(p);
      playerMeshes.set(p.id, entry);
      playerGroup.add(entry.group);
    }
    // Smoothly move toward the authoritative position (set each tick).
    entry.targetPos.set(p.x, 0, p.y);
    updateLabel(entry, `${p.name}${p.gems ? ' 💎' + p.gems : ''}`);
    setCostume(entry, p.costume);
  }
  // Remove avatars for players who left.
  for (const [id, entry] of playerMeshes) {
    if (!seen.has(id)) {
      playerGroup.remove(entry.group);
      entry.label.material.map?.dispose();
      playerMeshes.delete(id);
    }
  }
}

function buildPlayer(p) {
  const group = new THREE.Group();
  group.position.set(p.x, 0, p.y);

  const color = new THREE.Color(COSTUME_COLORS[p.costume] || COSTUME_COLORS.default);
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(14, 22, 6, 14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 })
  );
  body.position.y = 26;
  body.castShadow = true;
  group.add(body);

  // A little sailor hat.
  const hat = new THREE.Mesh(
    new THREE.ConeGeometry(12, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0x222b33, roughness: 0.7 })
  );
  hat.position.y = 50;
  hat.castShadow = true;
  group.add(hat);

  const label = makeLabel(p.name);
  label.position.y = 78;
  group.add(label);

  return {
    group, body, hat, label,
    labelText: p.name, costume: p.costume,
    targetPos: new THREE.Vector3(p.x, 0, p.y),
  };
}

function setCostume(entry, costume) {
  if (entry.costume === costume) return;
  entry.costume = costume;
  entry.body.material.color.set(COSTUME_COLORS[costume] || COSTUME_COLORS.default);
}

// --- Text labels rendered to a canvas texture sprite ---
function makeLabel(text) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ depthTest: false, transparent: true })
  );
  sprite.scale.set(120, 30, 1);
  drawLabel(sprite, text);
  return sprite;
}

function updateLabel(entry, text) {
  if (entry.labelText === text) return;
  entry.labelText = text;
  drawLabel(entry.label, text);
}

function drawLabel(sprite, text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  const w = ctx.measureText(text).width + 28;
  roundRect(ctx, 128 - w / 2, 12, w, 40, 10);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 128, 33);

  sprite.material.map?.dispose();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  sprite.material.map = tex;
  sprite.material.needsUpdate = true;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Per-frame update: interpolate avatars, follow camera, animate water.
export function renderFrame(state) {
  if (!renderer) return;
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  // Interpolate avatars toward their server target for smooth motion.
  for (const entry of playerMeshes.values()) {
    entry.group.position.lerp(entry.targetPos, Math.min(1, dt * 12));
    // Bob slightly on the waves.
    entry.body.position.y = 26 + Math.sin(t * 3 + entry.group.position.x) * 1.5;
  }

  // Spin treasure lids for a bit of life.
  for (const chest of treasureMeshes.values()) {
    if (chest.userData.spin) chest.userData.spin.rotation.x += dt * 1.5;
  }

  // Camera follows the local player from behind/above.
  const me = playerMeshes.get(state.selfId);
  if (me) camFocus.lerp(me.group.position, Math.min(1, dt * 6));
  const desired = new THREE.Vector3(camFocus.x, 360, camFocus.z + 460);
  camera.position.lerp(desired, Math.min(1, dt * 4));
  camera.lookAt(camFocus.x, 20, camFocus.z);

  // Keep the sun + shadow frustum centered on the action.
  sun.position.set(camFocus.x + 300, 700, camFocus.z + 200);
  sun.target.position.set(camFocus.x, 0, camFocus.z);

  animateOcean(t);
  renderer.render(scene, camera);
}

function clearGroup(group) {
  for (let i = group.children.length - 1; i >= 0; i--) {
    const c = group.children[i];
    group.remove(c);
    c.traverse?.((o) => {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material?.dispose?.();
    });
  }
}
