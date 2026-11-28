import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';
import { TcpTransport } from '../dist/transport.js';
import { buildServer } from '../dist/server.js';

/** A WiFi-style adapter on localhost that answers like the mock; `drop()` cuts the current link. */
async function wifiAdapter(t) {
  const mock = new MockTransport('catalyst');
  const sockets = new Set();
  let connections = 0;
  const server = net.createServer(socket => {
    connections++;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let buffer = '';
    socket.on('data', async chunk => {
      buffer += chunk.toString('latin1');
      let idx;
      while ((idx = buffer.indexOf('\r')) !== -1) {
        const command = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (command) socket.write((await mock.sendRaw(command)) + '>');
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { for (const s of sockets) s.destroy(); server.close(resolve); }));
  return {
    port: server.address().port,
    connections: () => connections,
    drop: async () => { for (const s of sockets) s.destroy(); await new Promise(r => setTimeout(r, 50)); },
  };
}

async function session(t, elm, deps) {
  const server = buildServer(elm, false, deps);
  const client = new Client({ name: 'reconnect-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  t.after(async () => { await client.close(); await server.close(); });
  return async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    return { result, data: JSON.parse(result.content[0].text) };
  };
}

test('after the link drops, reconnect restores reads without a restart', async t => {
  const adapter = await wifiAdapter(t);
  const call = await session(t, new Elm327(new TcpTransport('127.0.0.1', adapter.port)));
  assert.deepEqual((await call('read_dtcs')).data.stored_dtcs, ['P0420']);
  await adapter.drop();
  const broken = await call('read_dtcs');
  assert.equal(broken.result.isError, true);
  assert.match(broken.data.error, /unusable|closed/);
  assert.match(broken.data.hint, /ask Claude to reconnect/);
  const { result, data } = await call('reconnect');
  assert.notEqual(result.isError, true);
  assert.equal(data.reconnected, true);
  assert.match(data.adapter, /ELM327/);
  assert.equal(data.vehicle_communication, 'not_checked');
  assert.equal(adapter.connections(), 2);
  // A late close event from the dropped link must not break the new one.
  await new Promise(r => setTimeout(r, 50));
  assert.deepEqual((await call('read_dtcs')).data.stored_dtcs, ['P0420']);
  assert.deepEqual((await call('read_dtcs')).data.stored_dtcs, ['P0420']);
});

test('reconnecting a working link opens a fresh one and sends only adapter commands', async t => {
  const mock = new MockTransport('catalyst');
  const log = [];
  const transport = {
    describe: () => 'serial:/dev/ttyUSB0@38400',
    open: async () => { log.push('<open>'); },
    close: async () => { log.push('<close>'); },
    sendRaw: async c => { log.push(c); return mock.sendRaw(c); },
  };
  const call = await session(t, new Elm327(transport));
  await call('read_dtcs');
  log.length = 0;
  const { data } = await call('reconnect');
  assert.equal(data.reconnected, true);
  assert.deepEqual(log, ['<close>', '<open>', 'ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0']);
});

test('a failed reconnect reports the error with a next step', async t => {
  const transport = {
    describe: () => 'tcp:192.168.0.10:35000',
    open: async () => { throw new Error('connect ECONNREFUSED 192.168.0.10:35000'); },
    close: async () => {},
    sendRaw: async () => 'OK',
  };
  const call = await session(t, new Elm327(transport));
  const { result, data } = await call('reconnect');
  assert.equal(result.isError, true);
  assert.match(data.error, /ECONNREFUSED/);
  assert.match(data.hint, /adapter's own WiFi network/);
});

test('switching to the same adapter again closes the current connection first', async t => {
  const events = [];
  const make = name => {
    const mock = new MockTransport('catalyst');
    return {
      describe: () => 'serial:COM3@38400',
      open: async () => { events.push(`${name}:open`); },
      close: async () => { events.push(`${name}:close`); },
      sendRaw: c => mock.sendRaw(c),
    };
  };
  const first = make('first');
  const call = await session(t, new Elm327(first), { connect: () => ({ transport: make('second'), mock: false }) });
  await call('read_dtcs');
  const { data } = await call('use_adapter', { connection: 'serial:COM3' });
  assert.equal(data.connected, true);
  assert.ok(events.indexOf('first:close') < events.indexOf('second:open'), events.join(' '));
});
