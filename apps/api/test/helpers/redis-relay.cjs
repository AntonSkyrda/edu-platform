const assert = require('node:assert/strict');
const { once } = require('node:events');
const { connect, createServer } = require('node:net');

// Faults are confined to this test's connections, never the shared Redis server.
async function redisRelay(t, initialMode = 'ready') {
  assert(['localhost', '127.0.0.1'].includes(process.env.REDIS_HOST));
  let mode = initialMode;
  const pending = new Map();
  const state = { sockets: new Set(), blocked: 0 };
  Object.defineProperty(state, 'mode', {
    get: () => mode,
    set: (value) => {
      mode = value;
      if (value === 'ready') {
        for (const [downstream, item] of pending) {
          for (const chunk of item.requests) item.upstream.write(chunk);
          for (const chunk of item.replies) downstream.write(chunk);
          item.requests = [];
          item.replies = [];
        }
      }
    },
  });
  const server = createServer((downstream) => {
    if (state.mode === 'refuse') {
      downstream.destroy();
      return;
    }
    const upstream = connect({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
    });
    state.sockets.add(downstream);
    const item = { upstream, requests: [], replies: [] };
    pending.set(downstream, item);
    for (const socket of [downstream, upstream])
      socket.on('error', () => undefined);
    downstream.on('close', () => {
      state.sockets.delete(downstream);
      pending.delete(downstream);
      upstream.destroy();
    });
    upstream.on('close', () => downstream.destroy());
    downstream.on('data', (data) => {
      if (state.mode === 'stall') {
        state.blocked += data.length;
        item.requests.push(data);
      } else upstream.write(data);
    });
    upstream.on('data', (data) => {
      if (state.mode === 'stall' || state.mode === 'reply-stall') {
        state.blocked += data.length;
        item.replies.push(data);
      } else downstream.write(data);
    });
  });
  state.disconnect = () => {
    for (const socket of state.sockets) socket.destroy();
  };
  t.after(async () => {
    state.disconnect();
    await new Promise((resolve) => server.close(resolve));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  state.port = server.address().port;
  return state;
}
module.exports = { redisRelay };
