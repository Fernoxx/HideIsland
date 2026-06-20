// Unified input: WASD / arrow keys on desktop, on-screen joystick on touch.
// Produces a normalized {dx, dy} movement vector polled by the game loop.

const keys = new Set();
let touchVec = { dx: 0, dy: 0 };
let usingTouch = false;

export function initInput() {
  // --- Keyboard ---
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
      keys.add(k);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  // --- Touch joystick ---
  const joy = document.getElementById('joystick');
  const knob = document.getElementById('joystick-knob');
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch) {
    usingTouch = true;
    joy.classList.remove('hidden');
    bindJoystick(joy, knob);
  }
}

function bindJoystick(joy, knob) {
  let active = false;
  const radius = 44; // max knob travel

  function setFromEvent(clientX, clientY) {
    const rect = joy.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, radius);
    const nx = len ? (dx / len) : 0;
    const ny = len ? (dy / len) : 0;
    knob.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
    // Normalize to a unit-ish vector with a small dead zone.
    const mag = Math.min(1, len / radius);
    touchVec = mag < 0.15 ? { dx: 0, dy: 0 } : { dx: nx * mag, dy: ny * mag };
  }

  function reset() {
    active = false;
    touchVec = { dx: 0, dy: 0 };
    knob.style.transform = 'translate(0,0)';
  }

  joy.addEventListener('touchstart', (e) => {
    active = true;
    setFromEvent(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive: false });
  joy.addEventListener('touchmove', (e) => {
    if (active) setFromEvent(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive: false });
  joy.addEventListener('touchend', reset);
  joy.addEventListener('touchcancel', reset);
}

// Current movement vector from whichever input is active.
export function getMoveVector() {
  let dx = 0, dy = 0;
  if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
  if (keys.has('arrowright') || keys.has('d')) dx += 1;
  if (keys.has('arrowup') || keys.has('w')) dy -= 1;
  if (keys.has('arrowdown') || keys.has('s')) dy += 1;

  if (dx === 0 && dy === 0 && usingTouch) {
    return touchVec;
  }
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  return { dx, dy };
}
