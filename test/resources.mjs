import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';
import { buildServer } from '../dist/server.js';
import { PIDS } from '../dist/pids.js';

async function session(t, scenario = 'catalyst') {
  const mock = new MockTransport(scenario);
  const commands = [];
  const transport = {
    describe: () => mock.describe(), open: () => mock.open(), close: () => mock.close(),
    sendRaw: async command => { commands.push(command); return mock.sendRaw(command); },
  };
  const server = buildServer(new Elm327(transport), true);
  const client = new Client({ name: 'resources-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  t.after(async () => { await client.close(); await server.close(); });
  const read = async uri => (await client.readResource({ uri })).contents[0];
  const readJson = async uri => JSON.parse((await read(uri)).text);
  return { client, commands, read, readJson };
}

test('static resources and templates are listed with titles', async t => {
  const { client } = await session(t);
  const { resources } = await client.listResources();
  assert.deepEqual(resources.map(r => r.uri).sort(), [
    'obd2://guide/adapters', 'obd2://guide/troubleshooting', 'obd2://guide/used-car-check',
    'obd2://report/latest', 'obd2://scenarios', 'obd2://sensors',
  ]);
  for (const resource of resources) {
    assert.ok(resource.title, resource.uri);
    assert.ok(resource.description, resource.uri);
  }
  const { resourceTemplates } = await client.listResourceTemplates();
  assert.deepEqual(resourceTemplates.map(r => r.uriTemplate).sort(), ['obd2://code/{code}', 'obd2://sensor/{name}']);
});

test('guides are the bilingual Markdown documents', async t => {
  const { read } = await session(t);
  const adapters = await read('obd2://guide/adapters');
  assert.equal(adapters.mimeType, 'text/markdown');
  assert.match(adapters.text, /Bluetooth LE only/);
  assert.match(adapters.text, /## 日本語/);
  assert.match((await read('obd2://guide/troubleshooting')).text, /## 日本語/);
  assert.match((await read('obd2://guide/used-car-check')).text, /used_car_check/);
});

test('sensor and scenario catalogues match the server', async t => {
  const { readJson } = await session(t);
  const { sensors } = await readJson('obd2://sensors');
  assert.equal(sensors.length, PIDS.length);
  const coolant = sensors.find(s => s.name === 'coolant_temp');
  assert.deepEqual(coolant, { name: 'coolant_temp', pid: '01 05', description: 'Engine coolant temperature', unit: 'degC', in_default_set: true, in_freeze_frame: true });
  const { scenarios } = await readJson('obd2://scenarios');
  assert.deepEqual(scenarios.map(s => s.name), ['catalyst', 'healthy', 'misfire', 'lean', 'evap', 'cleared', 'partial']);
  assert(scenarios.every(s => s.description.length > 10));
});

test('resources never contact the adapter', async t => {
  const { client, commands, read } = await session(t);
  const { resources } = await client.listResources();
  for (const { uri } of resources) await read(uri);
  await read('obd2://code/P0420');
  await read('obd2://sensor/rpm');
  assert.deepEqual(commands, []);
});

test('the latest report is empty until one is collected, then has no port or address', async t => {
  const { client, readJson } = await session(t);
  assert.equal((await readJson('obd2://report/latest')).available, false);
  await client.callTool({ name: 'read_diagnostic_report', arguments: {} });
  const report = await readJson('obd2://report/latest');
  assert.equal(report.schema_version, 1);
  assert.equal(report.simulated, true);
  assert.deepEqual(report.sections.read_dtcs.data.stored_dtcs, ['P0420']);
  assert.doesNotMatch(JSON.stringify(report), /"source"/);
});

test('code template explains who defines a code and completes codes read this session', async t => {
  const { client, readJson } = await session(t);
  assert.deepEqual(
    (await client.complete({ ref: { type: 'ref/resource', uri: 'obd2://code/{code}' }, argument: { name: 'code', value: 'P' } })).completion.values,
    []
  );
  await client.callTool({ name: 'read_dtcs', arguments: {} });
  const done = await client.complete({ ref: { type: 'ref/resource', uri: 'obd2://code/{code}' }, argument: { name: 'code', value: 'p04' } });
  assert.deepEqual(done.completion.values, ['P0420']);
  const p0420 = await readJson('obd2://code/P0420');
  assert.equal(p0420.definition, 'sae');
  assert.equal(p0420.read_in_this_session, true);
  const p1234 = await readJson('obd2://code/p1234');
  assert.equal(p1234.code, 'P1234');
  assert.equal(p1234.definition, 'manufacturer');
  assert.match(p1234.guidance, /depends on the make/);
  assert.equal((await readJson('obd2://code/hello')).valid, false);
});

test('sensor template completes names and rejects unknown ones', async t => {
  const { client, readJson } = await session(t);
  const done = await client.complete({ ref: { type: 'ref/resource', uri: 'obd2://sensor/{name}' }, argument: { name: 'name', value: 'cool' } });
  assert.deepEqual(done.completion.values, ['coolant_temp']);
  assert.equal((await readJson('obd2://sensor/rpm')).unit, 'rpm');
  assert.equal((await readJson('obd2://sensor/boost')).valid, false);
});

test('prompt language arguments complete common languages', async t => {
  const { client } = await session(t);
  for (const name of ['check_engine_light', 'used_car_check', 'inspection_check']) {
    const ja = await client.complete({ ref: { type: 'ref/prompt', name }, argument: { name: 'language', value: '日' } });
    assert.deepEqual(ja.completion.values, ['日本語'], name);
  }
  const en = await client.complete({ ref: { type: 'ref/prompt', name: 'used_car_check' }, argument: { name: 'language', value: 'e' } });
  assert.deepEqual(en.completion.values, ['English', 'Español']);
});
