import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';
import { buildServer } from '../dist/server.js';

async function session(t, { scenario = 'catalyst', responses = {} } = {}) {
  const mock = new MockTransport(scenario);
  const commands = [];
  const transport = {
    describe: () => mock.describe(), open: () => mock.open(), close: () => mock.close(),
    sendRaw: async command => {
      commands.push(command);
      return responses[command] ?? mock.sendRaw(command);
    },
  };
  const server = buildServer(new Elm327(transport), true);
  const client = new Client({ name: 'permanent-dtc-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  t.after(async () => { await client.close(); await server.close(); });
  const call = async (name, args = {}) => {
    const response = await client.callTool({ name, arguments: args });
    return { response, data: JSON.parse(response.content[0].text) };
  };
  return { client, commands, call };
}

test('read_permanent_dtcs is read-only and sends only Mode 0A', async t => {
  const { client, commands, call } = await session(t);
  const tool = (await client.listTools()).tools.find(tool => tool.name === 'read_permanent_dtcs');
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.destructiveHint, false);
  const { response, data } = await call('read_permanent_dtcs');
  assert(!response.isError);
  assert.deepEqual(data.permanent_dtcs, ['P0420']);
  assert.equal(data.simulated, true);
  assert.deepEqual(commands.filter(command => !command.startsWith('AT')), ['0A']);
});

test('permanent codes survive clear_dtcs on the mock vehicle, as on a real ECU', async t => {
  const { call } = await session(t);
  const cleared = await call('clear_dtcs', { confirm: true });
  assert(!cleared.response.isError);
  const { data: dtcs } = await call('read_dtcs');
  assert.deepEqual(dtcs.stored_dtcs, []);
  assert.equal(dtcs.mil_on, false);
  const { data } = await call('read_permanent_dtcs');
  assert.deepEqual(data.permanent_dtcs, ['P0420']);
});

test('the healthy scenario has no permanent codes', async t => {
  const { call } = await session(t, { scenario: 'healthy' });
  const { data } = await call('read_permanent_dtcs');
  assert.deepEqual(data.permanent_dtcs, []);
});

test('no answer is reported as null with a note, not as an empty list or an error', async t => {
  const { call } = await session(t, { responses: { '0A': 'NO DATA\r' } });
  const { response, data } = await call('read_permanent_dtcs');
  assert(!response.isError);
  assert.equal(data.permanent_dtcs, null);
  assert.match(data.note, /not a confirmed empty list/);
});

test('a vehicle that rejects Mode 0A is reported as unsupported, not as an error', async t => {
  for (const reply of ['7F 0A 11\r', '7F0A11\r']) {
    const { call } = await session(t, { responses: { '0A': reply } });
    const { response, data } = await call('read_permanent_dtcs');
    assert(!response.isError, reply);
    assert.equal(data.permanent_dtcs, null);
    assert.match(data.note, /unsupported/);
  }
});

test('legacy (non-CAN) responses without a count byte are decoded', async t => {
  const { call } = await session(t, { responses: { '0A': '4A 04 20 01 71 00 00\r' } });
  const { data } = await call('read_permanent_dtcs');
  assert.deepEqual(data.permanent_dtcs, ['P0420', 'P0171']);
});

test('other adapter errors stay visible as errors', async t => {
  const { call } = await session(t, { responses: { '0A': 'CAN ERROR\r' } });
  const { response, data } = await call('read_permanent_dtcs');
  assert.equal(response.isError, true);
  assert.match(data.error, /CAN ERROR/);
});
