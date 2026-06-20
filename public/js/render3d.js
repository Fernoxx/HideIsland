// 3D renderer powered by three.js — PUBG-style third-person view.
//
// The authoritative server thinks in 2D and sends (x, y). We map that onto a
// 3D ground plane:  server.x -> world X,  server.y -> world Z,  world Y = up.
// No server changes are needed; we just present the simulation cinematically.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { COSTUME_COLORS } from './render.js';

let renderer, scene, camera, clock, sun, sky, pmrem, envRT;
let ocean, oceanBase;
let worldSize = { width: 3000, height: 3000 };

const sunVec = new THREE.Vector3();

const islandGroup = new THREE.Group();
const treasureGroup = new THREE.Group();
const playerGroup = new THREE.Group();

const playerMeshes = new Map(); // id -> entry
const treasureMeshes = new Map(); // key -> mesh

// Smoothed camera rig state (PUBG over-the-shoulder).
let camYaw = 0;
const camPosV = new THREE.Vector3(1500, 300, 1900);
const camLookV = new THREE.Vector3(1500, 40, 1500);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// Frame-rate independent smoothing factor.
const smooth = (dt, k) => 1 - Math.exp(-dt * k);
const lerpAngle = (a, b, t) =>
  Math.atan2(
    (1 - t) * Math.sin(a) + t * Math.sin(b),
    (1 - t) * Math.cos(a) + t * Math.cos(b)
  );

export function initRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Cinematic color: filmic tone mapping for rich highlights/shadows.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xaacbe0, 900, 3200);

  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 1, 60000);
  camera.position.copy(camPosV);

  clock = new THREE.Clock();
  pmrem = new THREE.PMREMGenerator(renderer);

  // --- Lighting ---
  scene.add(new THREE.HemisphereLight(0xcfeaff, 0x33484a, 0.55));

  sun = new THREE.DirectionalLight(0xfff2d6, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 520;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 50, far: 2000 });
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  scene.add(islandGroup, treasureGroup, playerGroup);

  buildSky();
  buildOcean();

  window.addEventListener('resize', onResize);
}

function onResize() {
  if (!renderer) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

// Atmospheric sky with physically-based scattering; drives the sun + reflections.
function buildSky() {
  sky = new Sky();
  sky.scale.setScalar(45000);
  scene.add(sky);

  const u = sky.material.uniforms;
  u.turbidity.value = 6;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.8;

  // Low golden sun for dramatic long shadows.
  const elevation = 14, azimuth = 150;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  sunVec.setFromSphericalCoords(1, phi, theta);
  u.sunPosition.value.copy(sunVec);

  // Generate an environment map from the sky for water/metal reflections.
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(sky);
  scene.environment = envRT.texture;
}

function buildOcean() {
  const size = 12000;
  const seg = 160;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  oceanBase = Float32Array.from(geo.attributes.position.array);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x114b63,
    roughness: 0.12,
    metalness: 0.55,
    envMapIntensity: 1.1,
    transparent: true,
    opacity: 0.96,
  });
  ocean = new THREE.Mesh(geo, mat);
  ocean.position.set(worldSize.width / 2, 0, worldSize.height / 2);
  ocean.receiveShadow = true;
  scene.add(ocean);
}

function animateOcean(t) {
  if (!ocean) return;
  const arr = ocean.geometry.attributes.position.array;
  for (let i = 0; i < arr.length; i += 3) {
    const x = oceanBase[i], z = oceanBase[i + 2];
    arr[i + 1] =
      Math.sin(x * 0.008 + t * 1.1) * 7 +
      Math.cos(z * 0.011 + t * 0.85) * 7 +
      Math.sin((x + z) * 0.02 + t * 1.7) * 2.5;
  }
  ocean.geometry.attributes.position.needsUpdate = true;
  ocean.geometry.computeVertexNormals();
}

// Build the static world (islands) for a new match.
export function buildWorld(state) {
  worldSize = state.world;
  if (ocean) ocean.position.set(worldSize.width / 2, 0, worldSize.height / 2);

  clearGroup(islandGroup);
  clearGroup(treasureGroup);
  treasureMeshes.clear();

  for (const isl of state.islands) islandGroup.add(buildIsland(isl));
}

function buildIsland(isl) {
  const g = new THREE.Group();
  g.position.set(isl.x, 0, isl.y);
  const R = isl.radius;

  // Shoreline foam ring lying flat on the water.
  const foam = new THREE.Mesh(
    new THREE.RingGeometry(R, R + 34, 64),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = 3;
  g.add(foam);

  // Sand base (cone rising from the water).
  const sand = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R * 1.1, 46, 48),
    new THREE.MeshStandardMaterial({ color: 0xe6cf90, roughness: 1 })
  );
  sand.position.y = 5;
  sand.receiveShadow = sand.castShadow = true;
  g.add(sand);

  // Grassy dome.
  const grass = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.74, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x5fa256, roughness: 0.95 })
  );
  grass.position.y = 24;
  grass.scale.y = 0.42;
  grass.receiveShadow = grass.castShadow = true;
  g.add(grass);

  // A scattering of rocks for texture.
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8d8f, roughness: 1 });
  for (let i = 0; i < 3 + (isl.id % 3); i++) {
    const a = isl.id * 1.7 + i * 2.1;
    const rr = R * (0.55 + (i % 2) * 0.18);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(8 + (i % 3) * 5), rockMat);
    rock.position.set(Math.cos(a) * rr, 14, Math.sin(a) * rr);
    rock.rotation.set(a, a * 2, a);
    rock.castShadow = true;
    g.add(rock);
  }

  // Palm trees.
  for (let i = 0, n = 3 + (isl.id % 3); i < n; i++) {
    const a = (i / n) * Math.PI * 2 + isl.id;
    const r = R * 0.42;
    g.add(buildPalm(Math.cos(a) * r, Math.sin(a) * r));
  }
  return g;
}

function buildPalm(x, z) {
  const palm = new THREE.Group();
  palm.position.set(x, 30, z);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 7, 78, 8),
    new THREE.MeshStandardMaterial({ color: 0x8d6748, roughness: 1 })
  );
  trunk.position.y = 39;
  trunk.rotation.z = 0.08;
  trunk.castShadow = true;
  palm.add(trunk);

  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3fa54f, roughness: 0.85, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(11, 52, 6), leafMat);
    leaf.position.y = 78;
    leaf.rotation.z = Math.PI / 2.5;
    leaf.rotation.y = (i / 6) * Math.PI * 2;
    leaf.castShadow = true;
    palm.add(leaf);
  }
  return palm;
}

// Treasure chests appear only once revealed.
export function syncTreasures(state) {
  for (const t of state.treasureMarkers) {
    const key = `${t.x},${t.y}`;
    if (treasureMeshes.has(key)) continue;
    const chest = buildChest();
    chest.position.set(t.x, 30, t.y);
    treasureGroup.add(chest);
    treasureMeshes.set(key, chest);
  }
}

function buildChest() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a1e, roughness: 0.7, metalness: 0.1 });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xffd54f, emissive: 0xffaa00, emissiveIntensity: 0.8, metalness: 0.9, roughness: 0.2,
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(48, 30, 34), wood);
  base.castShadow = true;
  g.add(base);

  const lid = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 48, 18, 1, false, 0, Math.PI), gold);
  lid.rotation.z = Math.PI / 2;
  lid.position.y = 15;
  lid.castShadow = true;
  g.add(lid);

  g.add(new THREE.PointLight(0xffcc55, 3, 320, 2));
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
    entry.targetPos.set(p.x, 0, p.y);
    updateLabel(entry, `${p.name}${p.gems ? ' 💎' + p.gems : ''}`);
    setCostume(entry, p.costume);
  }
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

  const pivot = new THREE.Group(); // lets us bob/lean without losing yaw
  group.add(pivot);

  const color = new THREE.Color(COSTUME_COLORS[p.costume] || COSTUME_COLORS.default);
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(14, 24, 8, 16),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15, envMapIntensity: 0.8 })
  );
  body.position.y = 27;
  body.castShadow = true;
  pivot.add(body);

  // Sailor hat.
  const hat = new THREE.Mesh(
    new THREE.ConeGeometry(13, 15, 14),
    new THREE.MeshStandardMaterial({ color: 0x222b33, roughness: 0.7 })
  );
  hat.position.y = 52;
  hat.castShadow = true;
  pivot.add(hat);

  // Face marker on the +Z (forward) side so facing direction is visible.
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(4.5, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffe0b2, roughness: 0.6 })
  );
  face.position.set(0, 34, 13);
  pivot.add(face);

  const label = makeLabel(p.name);
  label.position.y = 82;
  group.add(label);

  return {
    group, pivot, body, hat, label,
    labelText: p.name, costume: p.costume,
    targetPos: new THREE.Vector3(p.x, 0, p.y),
    yaw: 0, targetYaw: 0,
  };
}

function setCostume(entry, costume) {
  if (entry.costume === costume) return;
  entry.costume = costume;
  entry.body.material.color.set(COSTUME_COLORS[costume] || COSTUME_COLORS.default);
}

// --- Text labels rendered to a canvas-texture sprite ---
function makeLabel(text) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
  sprite.scale.set(130, 32, 1);
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
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 28;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 128 - w / 2, 12, w, 40, 10); ctx.fill();
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

// Per-frame: interpolate avatars, face travel direction, run the PUBG camera.
export function renderFrame(state) {
  if (!renderer) return;
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  for (const entry of playerMeshes.values()) {
    _v1.copy(entry.group.position);
    entry.group.position.lerp(entry.targetPos, smooth(dt, 12));
    _v2.subVectors(entry.group.position, _v1); // velocity this frame
    const speed = _v2.length();

    // Face the direction of travel (PUBG-like body turn).
    if (speed > 0.4) entry.targetYaw = Math.atan2(_v2.x, _v2.z);
    entry.yaw = lerpAngle(entry.yaw, entry.targetYaw, smooth(dt, 9));
    entry.group.rotation.y = entry.yaw;

    // Walk bob + a slight forward lean while moving.
    const moving = Math.min(1, speed * 6);
    entry.pivot.position.y = Math.abs(Math.sin(t * 9 + entry.group.position.x)) * 3 * moving;
    entry.pivot.rotation.x = moving * 0.12;
  }

  for (const chest of treasureMeshes.values()) {
    if (chest.userData.spin) chest.userData.spin.rotation.x += dt * 1.6;
  }

  // ---- PUBG over-the-shoulder camera ----
  const me = playerMeshes.get(state.selfId);
  if (me) {
    camYaw = lerpAngle(camYaw, me.yaw, smooth(dt, 6));
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw); // forward
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw); // right
    const p = me.group.position;

    const DIST = 240, HEIGHT = 135, SIDE = 55, AHEAD = 160, LOOK_H = 48;
    _v1.set(
      p.x - fx * DIST + rx * SIDE,
      HEIGHT,
      p.z - fz * DIST + rz * SIDE
    );
    camPosV.lerp(_v1, smooth(dt, 8));
    camPosV.y = Math.max(camPosV.y, 36); // never dip under the water
    camera.position.copy(camPosV);

    _v2.set(p.x + fx * AHEAD + rx * SIDE * 0.4, LOOK_H, p.z + fz * AHEAD + rz * SIDE * 0.4);
    camLookV.lerp(_v2, smooth(dt, 8));
    camera.lookAt(camLookV);

    // Keep sun + shadow frustum centered on the player.
    sun.position.copy(p).addScaledVector(sunVec, 900);
    sun.target.position.copy(p);
  }

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
