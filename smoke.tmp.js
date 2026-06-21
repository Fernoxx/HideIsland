const { io } = require('socket.io-client');
const URL = 'http://localhost:3000';
const mk = (name) => new Promise((res) => {
  const s = io(URL, { transports: ['websocket'] });
  const st = { s, name, room: null, players: 0, started: false, cancelled: false };
  s.on('connect', async () => {
    await s.emitWithAck('login', { name, handle: name });
    const j = await s.emitWithAck('joinGame', { name });
    st.room = j.roomId;
    res(st);
  });
  s.on('lobby', (d) => { st.players = d.players.length; });
  s.on('countdownCancelled', () => { st.cancelled = true; });
  s.on('matchStart', (d) => { st.started = true; st.matchPlayers = d.players.length; });
});
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const a = await mk('Alice');
  await wait(200);
  a.s.emit('ready', true);          // MIN_PLAYERS=1 -> countdown starts
  await wait(1500);                  // mid-countdown
  const b = await mk('Bob');         // Bob joins during countdown
  await wait(800);
  console.log('After Bob joins:', { aRoom: a.room, bRoom: b.room, sameRoom: a.room === b.room, aCancelled: a.cancelled, aPlayers: a.players, bPlayers: b.players });
  a.s.emit('ready', true);
  b.s.emit('ready', true);
  await wait(6500);                  // let countdown complete
  console.log('Match started together:', { aStarted: a.started, bStarted: b.started, matchPlayers: a.matchPlayers });
  const ok = a.room === b.room && a.cancelled && a.started && b.started && a.matchPlayers === 2;
  console.log('RESULT:', ok ? 'PASS' : 'FAIL');
  a.s.close(); b.s.close();
  process.exit(ok ? 0 : 1);
})();
