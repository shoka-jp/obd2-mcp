import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';
import { buildServer } from '../dist/server.js';
import { supportedMids, describeMid, parseMonitorTests, isNegative06 } from '../dist/mode06.js';

const record = (mid, tid, uasid, value, min, max) => {
  const word = n => [(n >> 8) & 0xff, n & 0xff];
  return [mid, tid, uasid, ...word(value), ...word(min), ...word(max)];
};

test('support bitmaps keep their exact monitor numbers', () => {
  // 01, 02, 20 (continuation); 21, 3B, 3C
  assert.deepEqual([...supportedMids([0x46, 0x00, 0xc0, 0x00, 0x00, 0x01], 0x00)], [0x01, 0x02, 0x20]);
  assert.deepEqual([...supportedMids([0x46, 0x20, 0x80, 0x00, 0x00, 0x18], 0x20)], [0x21, 0x3c, 0x3d]);
  assert.throws(() => supportedMids([0x46, 0x00, 0xc0], 0x00), /Invalid answer to 0600/);
  assert.throws(() => supportedMids([0x46, 0x20, 0, 0, 0, 0], 0x00), /Invalid answer to 0600/);
  assert.equal(isNegative06([0x7f, 0x06, 0x12]), true);
  assert.equal(isNegative06([0x46, 0x00]), false);
});

test('monitor names follow the standard monitor IDs', () => {
  assert.deepEqual(describeMid(0x01), { group: 'oxygen_sensor', monitor: 'Oxygen sensor bank 1 sensor 1' });
  assert.equal(describeMid(0x05).monitor, 'Oxygen sensor bank 2 sensor 1');
  assert.equal(describeMid(0x22).monitor, 'Catalyst bank 2');
  assert.equal(describeMid(0x3d).monitor, 'EVAP purge flow');
  assert.equal(describeMid(0x42).monitor, 'Oxygen sensor heater bank 1 sensor 2');
  assert.deepEqual(describeMid(0xa2), { group: 'misfire', monitor: 'Misfire cylinder 1' });
  assert.equal(describeMid(0xad).monitor, 'Misfire cylinder 12');
  assert.equal(describeMid(0xb0).group, 'pm_filter');
  assert.deepEqual(describeMid(0xe5), { group: 'other', monitor: 'Monitor E5' });
});

test('records: pass and fail from the raw numbers, signed values, not run, and unknown scaling', () => {
  const tests = parseMonitorTests([0x46,
    ...record(0x01, 0x05, 0x10, 72, 0, 100), // switch time in ms: pass
    ...record(0x01, 0x07, 0x0a, 3688, 0, 3600), // 0.45 V above a 0.44 V maximum: fail
    ...record(0x01, 0x81, 0x83, -3000, -2500, 2500), // signed, below the minimum: fail
    ...record(0x01, 0x82, 0x01, 0, 0, 0), // all zero: not run
    ...record(0x01, 0x83, 0x3f, 5, 1, 9), // unknown UASID: raw numbers
  ], 0x01);
  assert.deepEqual(tests[0], {
    mid: '01', monitor: 'Oxygen sensor bank 1 sensor 1', tid: '05', test: 'Rich to lean sensor switch time',
    value: 72, min: 0, max: 100, unit: 'ms', result: 'pass',
  });
  assert.equal(tests[1].result, 'fail');
  assert.equal(tests[1].unit, 'V');
  assert.equal(tests[1].value, 0.449936);
  assert.deepEqual([tests[2].value, tests[2].min, tests[2].max, tests[2].result], [-30, -25, 25, 'fail']);
  assert.equal(tests[2].manufacturer_defined, true);
  assert.equal('test' in tests[2], false, 'no guessed name for a manufacturer test');
  assert.equal(tests[3].result, 'not_run');
  assert.deepEqual([tests[4].value, tests[4].unit, tests[4].scaling, tests[4].result], [5, null, 'unknown', 'pass']);
});

test('misfire counts are counts, not pass or fail', () => {
  const [average, last] = parseMonitorTests([0x46, ...record(0xa3, 0x0b, 0x24, 46, 0, 0), ...record(0xa3, 0x0c, 0x24, 38, 0, 0)], 0xa3);
  assert.equal(average.result, 'counts');
  assert.equal(average.test, 'Misfires, average of the last 10 drives');
  assert.equal(last.value, 38);
});

test('malformed records are refused instead of decoded', () => {
  assert.throws(() => parseMonitorTests([0x46, 0x21, 0x80, 0x06, 0x0a], 0x21), /Invalid answer to 0621/);
  assert.throws(() => parseMonitorTests([0x41, ...record(0x21, 0x80, 0x06, 1, 0, 2)], 0x21), /Invalid answer/);
  assert.throws(() => parseMonitorTests([0x46, ...record(0x22, 0x80, 0x06, 1, 0, 2)], 0x21), /contains monitor 22/);
});

/** A server on the mock vehicle; `override` can replace the answer to any command. */
async function session(t, { scenario = 'catalyst', override = () => undefined } = {}) {
  const mock = new MockTransport(scenario);
  const commands = [];
  const transport = {
    describe: () => mock.describe(),
    open: () => mock.open(),
    close: async () => mock.close(),
    sendRaw: async command => {
      commands.push(command);
      const real = await mock.sendRaw(command);
      return override(command, real) ?? real;
    },
  };
  const server = buildServer(new Elm327(transport), true);
  const client = new Client({ name: 'mode06-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  t.after(async () => { await client.close(); await server.close(); });
  const call = async (args = {}) => {
    const result = await client.callTool({ name: 'read_monitor_tests', arguments: args });
    return { result, data: JSON.parse(result.content[0].text) };
  };
  return { client, commands, call };
}

test('the tool is a read-only vehicle read', async t => {
  const { client } = await session(t);
  const tool = (await client.listTools()).tools.find(x => x.name === 'read_monitor_tests');
  assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true });
  assert.match(tool.description, /do not guess what they measure/);
});

test('the P0420 car: the catalyst test fails, misfire counts per cylinder, headers off again', async t => {
  const { call, commands } = await session(t);
  const { result, data } = await call();
  assert.notEqual(result.isError, true);
  assert.equal(data.supported, true);
  assert.equal(data.simulated, true);
  assert.deepEqual(data.counts, { pass: 6, fail: 1, not_run: 0 });
  assert.equal(data.failed_tests.length, 1);
  assert.deepEqual(
    [data.failed_tests[0].address, data.failed_tests[0].monitor, data.failed_tests[0].value, data.failed_tests[0].max],
    ['7E8', 'Catalyst bank 1', 0.820145, 0.649955],
  );
  assert.equal(data.misfire_counts.length, 4);
  assert.deepEqual(data.misfire_counts[2], { address: '7E8', monitor: 'Misfire cylinder 3', average_last_10_drives: 1, this_or_last_drive: 0 });
  assert.equal(data.modules[0].tests.some(x => x.result === 'counts'), false, 'misfire counts are listed once');
  const fuel = data.modules[0].tests.find(x => x.mid === '81');
  assert.deepEqual([fuel.value, fuel.min, fuel.max, fuel.result], [3.1, -25, 25, 'pass']);
  const sent = commands.filter(c => !c.startsWith('AT') && c !== '0100');
  assert.deepEqual(sent, ['0600', '0620', '0640', '0660', '0680', '06A0', '0601', '0602', '0621', '063B', '063C', '0681', '06A2', '06A3', '06A4', '06A5']);
  assert.equal(commands.at(-1), 'ATH0');
  assert(!commands.includes('04') && !commands.includes('0902'), 'no clearing and no VIN');
});

test('monitor limits the read to one system', async t => {
  const { call, commands } = await session(t, { scenario: 'misfire' });
  const { data } = await call({ monitor: 'misfire' });
  assert.equal(data.monitor, 'misfire');
  assert.deepEqual(data.misfire_counts[0], { address: '7E8', monitor: 'Misfire cylinder 1', average_last_10_drives: 46, this_or_last_drive: 38 });
  assert.deepEqual(commands.filter(c => /^06[0-9A-F]{2}$/.test(c) && parseInt(c.slice(2), 16) % 0x20), ['06A2', '06A3', '06A4', '06A5']);
});

test('scenarios: cleared tests have not run, a small EVAP leak fails, a lean car fails its fuel system test', async t => {
  const cleared = (await (await session(t, { scenario: 'cleared' })).call()).data;
  assert.equal(cleared.counts.fail, 0);
  assert(cleared.counts.not_run >= 4);
  assert.equal(cleared.modules[0].tests.find(x => x.mid === '21').result, 'not_run');
  const evap = (await (await session(t, { scenario: 'evap' })).call()).data;
  assert.deepEqual(evap.failed_tests.map(x => x.monitor), ['EVAP leak test (0.020 in)']);
  const lean = (await (await session(t, { scenario: 'lean' })).call()).data;
  assert.deepEqual(lean.failed_tests.map(x => [x.monitor, x.value]), [['Fuel system bank 1', 33]]);
  const diesel = (await (await session(t, { scenario: 'diesel' })).call()).data;
  assert.equal(diesel.modules[0].tests.find(x => x.mid === 'B0').result, 'not_run');
});

test('clearing codes on the mock erases the results, as on a real engine computer', async t => {
  const { client, call } = await session(t);
  await client.callTool({ name: 'clear_dtcs', arguments: { confirm: true } });
  const { data } = await call({ monitor: 'catalyst' });
  assert.equal(data.modules[0].tests[0].result, 'not_run');
});

test('a car without Mode 06, an older protocol, and an unknown protocol are reported, not guessed', async t => {
  const partial = (await (await session(t, { scenario: 'partial' })).call()).data;
  assert.equal(partial.supported, false);
  assert.match(partial.note, /No module answered/);
  const kline = await session(t, { override: c => (c === 'ATDPN' ? 'A3\r' : undefined) });
  const older = (await kline.call()).data;
  assert.equal(older.supported, false);
  assert.match(older.note, /only on CAN vehicles/);
  assert(!kline.commands.includes('0600'));
  const off = await session(t, { override: c => (c === 'ATDPN' ? 'A0\r' : c === '0100' ? 'NO DATA\r' : undefined) });
  assert.match((await off.call()).data.note, /has not found the vehicle's protocol/);
});

test('two modules: each keeps its own tests and errors', async t => {
  const { call } = await session(t, {
    override: c => {
      // 7E8 advertises 21 only; 7E9 advertises 21 and 3D.
      if (c === '0600') return '7E8 06 46 00 00 00 00 01\r7E9 06 46 00 00 00 00 01\r';
      if (c === '0620') return '7E8 06 46 20 80 00 00 00\r7E9 06 46 20 80 00 00 08\r';
      // 7E8 answers 21 normally; 7E9 sends a record for the wrong monitor.
      if (c === '0621') return '7E8 10 0A 46 21 80 06 02 B1\r7E9 10 0A 46 22 80 06 02 B1\r7E8 21 00 00 08 53 00 00 00\r7E9 21 00 00 08 53 00 00 00\r';
      if (c === '063D') return 'NO DATA\r';
      return undefined;
    },
  });
  const { result, data } = await call();
  assert.notEqual(result.isError, true);
  assert.deepEqual(data.modules.map(m => m.address), ['7E8', '7E9']);
  assert.equal(data.modules[0].tests[0].result, 'pass');
  assert.deepEqual(data.modules[1].tests, []);
  assert.match(data.modules[1].errors['21'], /contains monitor 22/);
  assert.match(data.modules[1].errors['3D'], /did not answer/);
  assert.equal('errors' in data.modules[0], false);
});
