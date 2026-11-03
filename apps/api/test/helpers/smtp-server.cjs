const { once } = require('node:events');
const { createServer } = require('node:net');

// Small loopback-only SMTP peer. It never forwards mail or writes message bodies
// to logs/disk; tests exercise the real Nodemailer client over TCP.
async function smtpServer(t, initialMode = 'ready', port = 0) {
  const sockets = new Set();
  const held = new Set();
  const state = { mode: initialMode, connections: 0, accepted: 0, data: 0 };
  const server = createServer((socket) => {
    state.connections++;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    socket.setEncoding('utf8');
    let buffer = '';
    let inData = false;
    if (state.mode !== 'greeting-stall')
      socket.write('220 local.test ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData) {
          if (line !== '.') continue;
          inData = false;
          state.data++;
          if (state.mode === 'data-stall') continue;
          if (state.mode === 'data-hold') {
            held.add(socket);
            continue;
          }
          state.accepted++;
          socket.write('250 Message accepted\r\n');
        } else if (/^EHLO |^HELO /i.test(line)) {
          if (state.mode === 'command-stall') continue;
          socket.write('250-local.test\r\n250 AUTH PLAIN\r\n');
        } else if (/^AUTH /i.test(line)) {
          if (state.mode === 'auth-stall') continue;
          socket.write(
            state.mode === 'auth-reject'
              ? '535 private-server-diagnostic-do-not-log\r\n'
              : '235 Authentication accepted\r\n',
          );
        } else if (/^MAIL FROM:|^RCPT TO:/i.test(line)) {
          socket.write('250 OK\r\n');
        } else if (line === 'DATA') {
          inData = true;
          socket.write('354 End with dot\r\n');
        } else if (line === 'QUIT') {
          socket.end('221 Bye\r\n');
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });
  });
  state.acceptPending = () => {
    for (const socket of held) {
      if (!socket.destroyed) {
        state.accepted++;
        socket.write('250 Message accepted\r\n');
      }
    }
    held.clear();
  };
  state.disconnect = () => {
    for (const socket of sockets) socket.destroy();
  };
  state.sockets = sockets;
  t.after(async () => {
    state.disconnect();
    await new Promise((resolve) => server.close(resolve));
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  state.port = server.address().port;
  return state;
}
module.exports = { smtpServer };
