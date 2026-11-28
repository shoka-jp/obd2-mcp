import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';
import { buildServer } from '../dist/server.js';

// A fake clock: sleep advances time instantly, so the tests do not wait.
async function session(t, { scenario = 'catalyst', failAfter } = {}) {
  const mock = new MockTransport(scenario);
  const commands = [];
  let clock = 1_000_000;
  const sleeps = [];
  const transport = {
    describe: () => mock.describe(), open: () => mock.open(), close: () => mock.close(),
    sendRaw: async command => {
      commands.push(command);
      if (failAfter !== undefined && commands.length > failAfter) throw new Error('Connection closed.');
      return mock.sendRaw(command);
    },
  };
  const server = buildServer(new Elm327(transport), true, {
    sleep: async ms => { sleeps.push(ms); clock += ms; },
    now: () => clock,
  });
  const client = new Client({ name: 'watch-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  t.after(async () => { await client.close(); await server.close(); });
  const call = async (args, options) => {
    const response = await client.callTool({ name: 'watch_live_data', arguments: args }, undefined, options);
    return { response, data: JSON.parse(response.content[0].text) };
  };
  return { call, commands, sleeps };
}

test('watch_live_data samples each sensor at the interval and summarises it', async t => {
  const { call, commands, sleeps } = await session(t);
  const { response, data } = await call({ pids: ['rpm', 'coolant_temp'], seconds: 6, interval_seconds: 2 });
  assert(!response.isError);
  assert.deepEqual(data.samples.map(s => s.t), [0, 2, 4, 6]);
  assert.deepEqual(sleeps, [2000, 2000, 2000]);
  assert.deepEqual(commands.filter(c => c === '010C').length, 4);
  assert.deepEqual(commands.filter(c => c === '0105').length, 4);
  assert(commands.filter(c => !/^AT/i.test(c)).every(c => /^01(0C|05)$/.test(c)), 'only the requested Mode 01 reads reach the vehicle');
  const { rpm, coolant_temp } = data.summary;
  assert.equal(rpm.unit, 'rpm');
  assert.equal(rpm.readings, 4);
  assert.equal(rpm.failed, 0);
  assert(rpm.min <= rpm.first && rpm.first <= rpm.max);
  assert.equal(coolant_temp.first, coolant_temp.last);
  assert.equal(data.simulated, true);
  assert.match(data.note, /parked/);
});

test('defaults watch for 20 seconds every 2 seconds', async t => {
  const { call } = await session(t);
  const { data } = await call({ pids: ['rpm'] });
  assert.equal(data.interval_seconds, 2);
  assert.equal(data.samples.length, 11);
  assert.equal(data.samples.at(-1).t, 20);
});

test('unknown sensor names are rejected before anything is sent', async t => {
  const { call, commands } = await session(t);
  const before = commands.length;
  const { response, data } = await call({ pids: ['rpm', 'boost'] });
  assert.equal(response.isError, true);
  assert.match(data.error, /Unknown sensor name "boost"\./);
  assert.equal(commands.length, before);
});

test('limits on sensors, duration and interval are enforced', async t => {
  const { call } = await session(t);
  for (const args of [
    { pids: [] },
    { pids: ['rpm', 'coolant_temp', 'maf', 'throttle', 'engine_load'] },
    { pids: ['rpm'], seconds: 31 },
    { pids: ['rpm'], seconds: 4 },
    { pids: ['rpm'], interval_seconds: 6 },
    { pids: ['rpm'], interval_seconds: 0 },
  ]) {
    const response = await call(args).then(r => r.response, err => ({ isError: true, err }));
    assert.equal(response.isError, true, JSON.stringify(args));
  }
});

test('an unsupported sensor stays null and is counted as failed', async t => {
  const { call } = await session(t, { scenario: 'partial' });
  const { response, data } = await call({ pids: ['maf', 'coolant_temp'], seconds: 5, interval_seconds: 5 });
  assert(!response.isError);
  assert.deepEqual(data.samples.map(s => s.values.maf), [null, null]);
  assert.deepEqual(data.summary.maf, { unit: 'g/s', min: null, max: null, first: null, last: null, readings: 0, failed: 2 });
  assert.equal(data.summary.coolant_temp.first, 72);
  assert.equal('stopped_early' in data, false);
});

test('a lost connection stops watching and returns what was read', async t => {
  const { call, commands } = await session(t, { failAfter: 0 });
  // The first command (the adapter setup) already fails, as when the adapter is unplugged.
  const { response, data } = await call({ pids: ['rpm'], seconds: 10, interval_seconds: 1 });
  assert(!response.isError);
  assert.match(data.stopped_early, /Connection closed/);
  assert.equal(data.samples.length, 1);
  assert.equal(commands.length, 1);
});

test('reports MCP progress for each sample when the client asks for it', async t => {
  const { call } = await session(t);
  const progress = [];
  const { data } = await call({ pids: ['rpm'], seconds: 6, interval_seconds: 2 }, { onprogress: p => progress.push(p) });
  assert.equal(data.samples.length, 4);
  assert.deepEqual(progress.map(p => [p.progress, p.total]), [[1, 4], [2, 4], [3, 4], [4, 4]]);
  assert.match(progress[0].message, /Sample 1 of 4/);
});

test('other sensor names are accepted and mapped', async t => {
  const { call } = await session(t);
  const { response, data } = await call({ pids: ['speed', 'coolant'], seconds: 5, interval_seconds: 5 });
  assert.notEqual(response.isError, true);
  assert.deepEqual(Object.keys(data.summary).sort(), ['coolant_temp', 'vehicle_speed']);
});
