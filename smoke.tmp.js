const { io } = require('socket.io-client');
const s = io('http://localhost:3000', { transports: ['websocket'] });
s.on('connect', async () => {
  const login = await s.emitWithAck('login', { name: 'Ferno', handle: 'Ferno' });
  console.log('login ack:', JSON.stringify(login).slice(0,120));
  const join = await s.emitWithAck('joinGame', { name: 'Ferno' });
  console.log('joinGame ack:', JSON.stringify(join));
  s.close();
  process.exit(login.ok && join.ok ? 0 : 1);
});
s.on('connect_error', (e) => { console.log('connect_error', e.message); process.exit(1); });
setTimeout(() => { console.log('timeout'); process.exit(1); }, 5000);
