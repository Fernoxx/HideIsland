// Thin wrapper around the socket.io connection. `io` is provided globally by
// /socket.io/socket.io.js (served by the server).

export const socket = io();

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
