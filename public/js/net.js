// Thin wrapper around the socket.io connection. `io` is provided globally by
// /socket.io/socket.io.js (served by the Node server). If that script failed
// to load (e.g. the app was deployed somewhere that doesn't run the server,
// like a static-only host), we fall back to a stub so the page shows a clear
// error instead of crashing silently.

const hasIO = typeof io !== 'undefined';

if (!hasIO) {
  console.error(
    '[hide-island] socket.io client not found. The Node server must be ' +
      'running and serving /socket.io/socket.io.js. Static-only hosts ' +
      '(e.g. plain Vercel) will not work — use Render/Railway/Fly/a Node host.'
  );
}

// Minimal stand-in so imports/handlers don't throw when there is no server.
const stub = {
  connected: false,
  id: null,
  on() {},
  once() {},
  emit(_event, _payload, ack) { if (typeof ack === 'function') ack({ ok: false, message: 'No game server.' }); },
};

export const socket = hasIO ? io() : stub;

// Promise-based emit for events that expect an acknowledgement.
export function request(event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res) => resolve(res));
  });
}

// Register a handler for a server->client event.
export function on(event, handler) {
  socket.on(event, handler);
}

export function emit(event, payload) {
  socket.emit(event, payload);
}
