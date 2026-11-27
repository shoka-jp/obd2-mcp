import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';
import { buildServer } from '../dist/server.js';
import { adapterCandidates, findAdapters } from '../dist/discover.js';

/** A local TCP "WiFi adapter" that answers like an ELM327, using the mock vehicle's responses. */
async function fakeWifiAdapter(t) {
  const mock = new MockTransport();
  const commands = [];
  const server = net.createServer(socket => {
    let buffer = '';
    socket.on('data', async chunk => {
      buffer += chunk.toString('latin1');
      let idx;
      while ((idx = buffer.indexOf('\r')) !== -1) {
        const command = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!command) continue;
        commands.push(command);
        socket.write((await mock.sendRaw(command)) + '>');
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { connection: `tcp:127.0.0.1:${server.address().port}`, commands };
}

async function session(t, deps) {
  const server = buildServer(new Elm327(new MockTransport()), true, deps);
  const client = new Client({ name: 'adapter-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  t.after(async () => { await client.close(); await server.close(); });
  const call = async (name, args = {}) => {
    const response = await client.callTool({ name, arguments: args });
    return { response, data: JSON.parse(response.content[0].text) };
  };
  return { client, call };
}

test('use_adapter switches from mock to a real adapter; data is no longer labeled simulated and clearing stays blocked', async t => {
  delete process.env.OBD2MCP_ENABLE_CLEAR;
  const adapter = await fakeWifiAdapter(t);
  const { call } = await session(t);
  assert.equal((await call('read_dtcs')).data.simulated, true);

  const switched = await call('use_adapter', { connection: adapter.connection });
  assert(!switched.response.isError, JSON.stringify(switched.data));
  assert.equal(switched.data.connected, true);
  assert.match(switched.data.adapter, /ELM327/);
  assert.equal(switched.data.simulated, undefined);
  assert.match(switched.data.note, /until the server restarts/);
  assert.ok(adapter.commands.includes('ATZ'));
  assert.ok(!adapter.commands.some(c => /^0[1-9A]/.test(c)), 'switching contacts only the adapter, not the vehicle');

  const codes = await call('read_dtcs');
  assert.deepEqual(codes.data.stored_dtcs, ['P0420']);
  assert.equal(codes.data.simulated, undefined, 'real-adapter data is not labeled simulated');
  assert.match(codes.data.source, /^tcp:127\.0\.0\.1:/);

  const cleared = await call('clear_dtcs', { confirm: true });
  assert.equal(cleared.response.isError, true);
  assert.match(cleared.data.error, /disabled/);
  assert.ok(!adapter.commands.includes('04'), 'Mode 04 never reaches the adapter');

  const back = await call('use_adapter', { connection: 'mock' });
  assert.equal(back.data.simulated, true);
  assert.equal((await call('read_dtcs')).data.simulated, true);
});

test('use_adapter keeps the current connection when the adapter does not answer', async t => {
  const { call } = await session(t);
  const failed = await call('use_adapter', { connection: 'tcp:127.0.0.1:1' });
  assert.equal(failed.response.isError, true);
  assert.equal(failed.data.connected, false);
  assert.match(failed.data.current_connection, /^mock/);
  assert.match(failed.data.hint, /WiFi/);
  assert.equal((await call('read_dtcs')).data.simulated, true);
});

test('use_adapter rejects an invalid connection value with the usual message', async t => {
  const { call } = await session(t);
  const bad = await call('use_adapter', { connection: 'COM3' });
  assert.equal(bad.response.isError, true);
  assert.match(bad.data.error, /expected mock, serial:<path>, or tcp:<host>:<port>/);
});

test('find_adapter suggests use_adapter with the found connection', async t => {
  const { call } = await session(t, {
    findAdapters: async () => ({
      found: [{ connection: 'serial:COM5', description: 'USB-SERIAL CH340 (COM5)', reason: 'USB-serial chip CH340/CH341', status: 'elm327_found', adapter: 'ELM327 v1.5', baud: 38400 }],
      checked: [], skipped: [],
    }),
  });
  const { response, data } = await call('find_adapter');
  assert(!response.isError);
  assert.match(data.next_step, /Ask the user, then call use_adapter with connection serial:COM5/);
  assert.match(data.current_connection, /^mock/);
});

test('find_adapter explains next steps when no port looks like an adapter', async t => {
  const { call } = await session(t, { findAdapters: async () => ({ found: [], checked: [], skipped: [] }) });
  const { response, data } = await call('find_adapter');
  assert(!response.isError);
  assert.match(data.next_step, /pair the Bluetooth adapter/);
  assert.match(data.next_step, /Bluetooth LE-only adapter .* cannot be used/);
});

const port =(path, extra = {}) => ({ connection: `serial:${path}`, path, description: null, manufacturer: null, vendor_id: null, product_id: null, usb_serial_chip: null, ...extra });

test('only adapter-like ports are opened', () => {
  const { candidates, skipped } = adapterCandidates([
    port('COM5', { description: 'USB-SERIAL CH340 (COM5)', usb_serial_chip: 'CH340/CH341' }),
    port('COM7', { description: 'Standard Serial over Bluetooth link (COM7)' }),
    port('/dev/tty.OBDII-SPPDev'),
    port('/dev/tty.Bluetooth-Incoming-Port'),
    port('COM1', { description: 'Communications Port (COM1)' }),
    port('/dev/ttyS0'),
  ]);
  assert.deepEqual(candidates.map(c => c.port.path), ['COM5', 'COM7', '/dev/tty.OBDII-SPPDev']);
  assert.deepEqual(skipped.map(p => p.path), ['/dev/tty.Bluetooth-Incoming-Port', 'COM1', '/dev/ttyS0']);
});

test('findAdapters identifies an ELM327, retries USB ports at other speeds, and closes every port', async () => {
  const opened = [];
  const closed = [];
  const open = (path, baud) => ({
    describe: () => `serial:${path}@${baud}`,
    open: async () => { opened.push(`${path}@${baud}`); },
    close: async () => { closed.push(`${path}@${baud}`); },
    sendRaw: async () => {
      if (path === 'COM5' && baud === 115200) return 'ATZ\r\rELM327 v2.1\r\r';
      if (path === 'COM6') return 'OK\r';
      throw new Error('Timeout waiting for adapter response to "ATZ" (10 ms)');
    },
  });
  const result = await findAdapters({
    list: async () => [
      port('COM5', { usb_serial_chip: 'CH340/CH341' }),
      port('COM6', { usb_serial_chip: 'FTDI' }),
      port('COM7', { description: 'Standard Serial over Bluetooth link (COM7)' }),
      port('COM1', { description: 'Communications Port (COM1)' }),
    ],
    open, timeoutMs: 10,
  });
  assert.deepEqual(result.found.map(f => [f.connection, f.adapter, f.baud]), [['serial:COM5', 'ELM327 v2.1', 115200]]);
  assert.equal(result.checked.find(c => c.connection === 'serial:COM6').status, 'not_elm327');
  assert.equal(result.checked.find(c => c.connection === 'serial:COM7').status, 'no_answer');
  assert.deepEqual(opened.filter(o => o.startsWith('COM7')), ['COM7@38400'], 'Bluetooth ports are tried once');
  assert.ok(!opened.some(o => o.startsWith('COM1')), 'unrelated ports are never opened');
  assert.deepEqual([...closed].sort(), [...opened].sort(), 'every opened port is closed');
});

test('use_adapter only accepts serial port names and local-network WiFi addresses', async t => {
  const { call } = await session(t);
  for (const [connection, pattern] of [
    ['tcp:example.com:35000', /not a local network address/],
    ['tcp:8.8.8.8:35000', /not a local network address/],
    ['tcp:192.168.1.300:35000', /not a local network address/],
    ['serial:../../etc/passwd', /does not look like a serial port/],
  ]) {
    const { response, data } = await call('use_adapter', { connection });
    assert.equal(response.isError, true, connection);
    assert.match(data.error, pattern, connection);
    assert.match(data.error, /previous connection is still in use/);
  }
  assert.equal((await call('read_dtcs')).data.simulated, true);
});

test('local WiFi addresses and serial names pass the session check', async () => {
  const { sessionConnectionError } = await import('../dist/connection.js');
  for (const ok of ['mock', 'tcp:192.168.0.10:35000', 'tcp:10.0.0.5:35000', 'tcp:172.20.1.1:35000', 'tcp:[fe80::1]:35000', 'serial:COM5', 'serial:/dev/ttyUSB0', 'serial:/dev/cu.OBDII-SPPDev', 'serial:/dev/rfcomm0']) {
    assert.equal(sessionConnectionError(ok), undefined, ok);
  }
});
