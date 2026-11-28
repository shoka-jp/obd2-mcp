import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';
import { buildServer } from '../dist/server.js';

async function session(t, answer) {
  const mock = new MockTransport('catalyst');
  const commands = [];
  const transport = {
    describe: () => mock.describe(), open: () => mock.open(), close: () => mock.close(),
    sendRaw: async command => {
      commands.push(command);
      return command === 'ATRV' && answer !== undefined ? answer : mock.sendRaw(command);
    },
  };
  const server = buildServer(new Elm327(transport), true);
  const client = new Client({ name: 'battery-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  t.after(async () => { await client.close(); await server.close(); });
  const call = async () => {
    const result = await client.callTool({ name: 'read_battery_voltage', arguments: {} });
    return { result, data: JSON.parse(result.content[0].text) };
  };
  return { client, commands, call };
}

test('reads the adapter voltage with a guide, and asks only the adapter', async t => {
  const { client, commands, call } = await session(t);
  const tool = (await client.listTools()).tools.find(x => x.name === 'read_battery_voltage');
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.destructiveHint, false);
  assert.match(tool.description, /works with the ignition off/);
  assert.match(tool.description, /One reading is not a battery test/);
  const { result, data } = await call();
  assert.notEqual(result.isError, true);
  assert.equal(data.voltage, 14.2);
  assert.equal(data.unit, 'V');
  assert.equal(data.measured_by, 'adapter');
  assert.equal(data.simulated, true);
  assert.match(data.note, /12\.6 V or more is charged/);
  assert.match(data.note, /13\.5 to 14\.8 V usually means the alternator is charging/);
  assert.match(data.note, /not a load test/);
  assert.deepEqual(commands.filter(c => !c.startsWith('AT')), [], 'no request to the car');
});

test('adapter answers with decimals, spaces and lower case', async t => {
  for (const [answer, voltage] of [['12.48V\r', 12.48], ['12.4 v\r', 12.4], ['9V\r', 9]]) {
    const { call } = await session(t, answer);
    assert.equal((await call()).data.voltage, voltage, answer);
  }
});

test('an unexpected answer is an error, not a number', async t => {
  for (const answer of ['?\r', '\r', 'ELM327 v1.5\r', '123.4V\r']) {
    const { call } = await session(t, answer);
    const { result, data } = await call();
    assert.equal(result.isError, true, answer);
    assert.match(data.error, /Unexpected answer to ATRV/, answer);
  }
});
