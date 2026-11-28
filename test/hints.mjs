import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';
import { buildServer } from '../dist/server.js';
import { errorHint } from '../dist/hints.js';

test('common adapter and vehicle errors get a plain-language next step', () => {
  for (const [message, pattern] of [
    ['Adapter error for "0101": UNABLE TO CONNECT', /ignition ON/],
    ['Adapter error for "03": BUS INIT: ...ERROR', /ignition ON/],
    ['Vehicle returned NO DATA for "0105" (parameter not supported, or ignition off)', /does not mean the result is clean/],
    ['Timeout waiting for adapter response to "ATZ" (12000 ms)', /ask Claude to reconnect/],
    ['Adapter connection is unusable; restart the server: Serial adapter connection closed', /plugged in/],
    ['connect ECONNREFUSED 192.168.0.10:35000', /WiFi network/],
    ['Timed out after 10000 ms connecting to the adapter at tcp:192.168.0.10:35000.', /WiFi network/],
    ['Adapter rejected ATE0: ?', /find_adapter/],
    ['Compression-ignition readiness monitors are not yet supported', /diesel/],
  ]) {
    assert.match(errorHint(message) ?? '', pattern, message);
  }
});

test('errors that already explain the next step, or are unknown, get no extra hint', () => {
  assert.equal(errorHint('Could not open serial:COM9: File not found. Check the port name. See docs/troubleshooting.md.'), undefined);
  assert.equal(errorHint('The "serialport" package is not installed (it is an optional dependency).'), undefined);
  assert.equal(errorHint('Something new happened'), undefined);
});

test('a tool error keeps the original text and adds the hint', async t => {
  const mock = new MockTransport();
  const transport = {
    describe: () => 'serial:/dev/fake@38400', open: () => mock.open(), close: () => mock.close(),
    sendRaw: async command => (command === '0101' ? 'UNABLE TO CONNECT\r' : mock.sendRaw(command)),
  };
  const server = buildServer(new Elm327(transport), false);
  const client = new Client({ name: 'hint-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  t.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: 'read_dtcs', arguments: {} });
  assert.equal(result.isError, true);
  const data = JSON.parse(result.content[0].text);
  assert.match(data.error, /UNABLE TO CONNECT/);
  assert.match(data.hint, /ignition ON/);
});
