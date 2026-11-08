import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport, mockPidNames } from '../dist/mock.js';
import { buildServer } from '../dist/server.js';

async function session(t, responses = {}) {
  const mock = new MockTransport();
  const commands = [];
  const transport = {
    describe: () => mock.describe(), open: () => mock.open(), close: () => mock.close(),
    sendRaw: async command => {
      commands.push(command);
      return responses[command] ?? mock.sendRaw(command);
    },
  };
  const server = buildServer(new Elm327(transport), true);
  const client = new Client({ name: 'support-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  t.after(async () => { await client.close(); await server.close(); });
  const read = async () => {
    const response = await client.callTool({ name: 'read_supported_pids', arguments: {} });
    return { response, data: JSON.parse(response.content[0].text) };
  };
  return { client, commands, read };
}

test('mock discovery advertises implemented sensors using only support queries', async t => {
  const { client, commands, read } = await session(t);
  const tool = (await client.listTools()).tools.find(tool => tool.name === 'read_supported_pids');
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.destructiveHint, false);
  const { response, data } = await read();
  assert(!response.isError);
  assert.equal(data.complete, true);
  assert.equal(data.simulated, true);
  assert.equal(data.mode, '01');
  assert.equal(data.pid_range, '01-60');
  assert(Number.isFinite(Date.parse(data.collected_at)));
  assert.deepEqual(data.supported_sensor_names, mockPidNames());
  assert(data.sensors.every(sensor => sensor.support === 'supported'));
  assert.deepEqual(commands.filter(command => !command.startsWith('AT')), ['0100', '0120', '0140']);
  assert.deepEqual(data.blocks[2].supported_pids, ['42', '46', '5C']);
  const live = await client.callTool({ name: 'read_live_data', arguments: { pids: data.supported_sensor_names } });
  const values = JSON.parse(live.content[0].text).live_data;
  assert(data.supported_sensor_names.every(name => Number.isFinite(values[name].value)));
});

test('bitmap byte boundaries and continuation flags retain their exact PID numbers', async t => {
  const { commands, read } = await session(t, {
    '0100': '41 00 80 01 80 01', // 01, 10, 11, 20
    '0120': '41 20 80 00 00 00', // 21; no continuation to 40
  });
  const { data } = await read();
  assert.deepEqual(data.blocks[0].supported_pids, ['01', '10', '11', '20']);
  assert.deepEqual(data.blocks[1].supported_pids, ['21']);
  assert.deepEqual(data.supported_sensor_names, ['maf', 'throttle']);
  assert.equal(data.sensors.find(sensor => sensor.name === 'rpm').support, 'not_advertised');
  assert.equal(data.sensors.find(sensor => sensor.name === 'oil_temp').support, 'not_advertised');
  assert(!commands.includes('0140'));
  assert.equal(data.complete, true);
});

test('a valid all-zero bitmap differs from unavailable support data', async t => {
  const { commands, read } = await session(t, { '0100': '41 00 00 00 00 00' });
  const { data, response } = await read();
  assert.equal(data.complete, true);
  assert(!response.isError);
  assert.deepEqual(data.supported_sensor_names, []);
  assert(data.sensors.every(sensor => sensor.support === 'not_advertised'));
  assert.deepEqual(commands.filter(command => !command.startsWith('AT')), ['0100']);
});

test('no initial data leaves every sensor unknown, not unsupported', async t => {
  const { commands, read } = await session(t, { '0100': 'NO DATA' });
  const { response, data } = await read();
  assert.equal(response.isError, true);
  assert.equal(data.complete, false);
  assert.deepEqual(data.supported_sensor_names, []);
  assert(data.sensors.every(sensor => sensor.support === 'unknown'));
  assert.equal(data.blocks[0].supported_pids, null);
  assert.match(data.blocks[0].error, /support is unknown/);
  assert(!commands.includes('0120'));
});

for (const [label, reply, error] of [
  ['no data', 'NO DATA', /support is unknown/],
  ['truncated bitmap', '41 20 00 02 00', /expected 4 bytes/],
  ['extra bytes', '41 20 00 02 00 01 00', /expected 4 bytes/],
  ['multiple ECU replies', '41 20 00 02 00 01\r41 20 00 00 00 00', /Ambiguous/],
  ['adapter error', 'CAN ERROR', /CAN ERROR/],
]) {
  test(`partial discovery preserves earlier support after ${label}`, async t => {
    const { commands, read } = await session(t, { '0100': '41 00 08 10 00 01', '0120': reply });
    const { response, data } = await read();
    assert.equal(response.isError, true);
    assert.equal(data.complete, false);
    assert.deepEqual(data.supported_sensor_names, ['coolant_temp', 'rpm']);
    assert.equal(data.sensors.find(sensor => sensor.name === 'engine_load').support, 'not_advertised');
    for (const name of ['fuel_level', 'module_voltage', 'oil_temp']) {
      assert.equal(data.sensors.find(sensor => sensor.name === name).support, 'unknown');
    }
    assert.match(data.blocks[1].error, error);
    assert.equal(data.blocks[1].supported_pids, null);
    assert(!commands.includes('0140'));
  });
}

test('discovery is bounded even when every bitmap bit is set', async t => {
  const { commands, read } = await session(t, {
    '0100': '41 00 FF FF FF FF', '0120': '41 20 FF FF FF FF', '0140': '41 40 FF FF FF FF',
  });
  const { data } = await read();
  assert.equal(data.complete, true);
  assert.equal(data.blocks[2].supported_pids.at(-1), '60');
  assert.equal(data.pid_range, '01-60');
  assert(!commands.includes('0160'));
});

test('later calls rediscover support instead of retaining a stale bitmap', async t => {
  const responses = { '0100': '41 00 00 10 00 00' };
  const { commands, read } = await session(t, responses);
  assert.deepEqual((await read()).data.supported_sensor_names, ['rpm']);
  responses['0100'] = '41 00 08 00 00 00';
  assert.deepEqual((await read()).data.supported_sensor_names, ['coolant_temp']);
  assert.equal(commands.filter(command => command === '0100').length, 2);
});
