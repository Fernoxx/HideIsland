// Live "attract mode" wallpaper: a self-contained, server-free simulation of
// the game (procedural islands + wandering bots + glowing treasure) that runs
// behind the homepage/login screen so the page feels alive.

const W = 3000, H = 3000;
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

const COSTUMES = ['default', 'captain', 'ghost', 'golden'];
const NAMES = ['Captain Reef', 'Salty Sam', 'Marina', 'Blackbeard Jr', 'Coral', 'Finn', 'Pearl', 'Drake'];

let demo = null;
let last = 0;

function generateIslands() {
  const islands = [];
  const count = 5 + Math.floor(rand(0, 2));
  let tries = 0;
  while (islands.length < count && tries++ < 400) {
    const radius = rand(220, 360);
    const x = rand(radius + 80, W - radius - 80);
    const y = rand(radius + 80, H - radius - 80);
    if (islands.some((i) => dist(x, y, i.x, i.y) < i.radius + radius + 220)) continue;
    islands.push({ id: islands.length, x, y, radius });
  }
  return islands;
}

function oceanSpawn(islands) {
  for (let i = 0; i < 200; i++) {
    const x = rand(120, W - 120), y = rand(120, H - 120);
    if (!islands.some((isl) => dist(x, y, isl.x, isl.y) <= isl.radius + 60)) return { x, y };
  }
  return { x: 150, y: 150 };
}

export function initDemo() {
  const islands = generateIslands();

  const bots = [];
  for (let i = 0; i < 7; i++) {
    const s = oceanSpawn(islands);
    bots.push({
      id: 'bot' + i,
      name: NAMES[i % NAMES.length],
      costume: COSTUMES[i % COSTUMES.length],
      weapon: 'none',
      x: s.x, y: s.y, gems: Math.floor(rand(0, 200)),
      target: oceanSpawn(islands),
      speed: rand(95, 150),
    });
  }

  // A couple of glowing chests resting on random islands.
  const chestIslands = [...islands].sort(() => Math.random() - 0.5).slice(0, 2);
  const treasureMarkers = chestIslands.map((isl) => {
    const a = rand(0, Math.PI * 2), r = rand(0, isl.radius * 0.5);
    return { x: Math.round(isl.x + Math.cos(a) * r), y: Math.round(isl.y + Math.sin(a) * r), gems: 0 };
  });

  demo = {
    selfId: 'bot0',
    world: { width: W, height: H },
    islands,
    players: bots.map(toNet),
    treasureMarkers,
    bots,
  };
  last = performance.now();
  return demo;
}

function toNet(b) {
  return { id: b.id, name: b.name, costume: b.costume, weapon: b.weapon, x: Math.round(b.x), y: Math.round(b.y), gems: b.gems };
}

export function tickDemo() {
  if (!demo) return null;
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  for (const b of demo.bots) {
    const dx = b.target.x - b.x, dy = b.target.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d < 50) {
      b.target = oceanSpawn(demo.islands); // pick a new wander point
    } else {
      b.x += (dx / d) * b.speed * dt;
      b.y += (dy / d) * b.speed * dt;
    }
  }
  demo.players = demo.bots.map(toNet);
  return demo;
}

export function getDemo() { return demo; }
