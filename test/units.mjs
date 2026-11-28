import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';
import { buildServer } from '../dist/server.js';
import { displayValue, unitSystem } from '../dist/units.js';

test('the units setting', () => {
  assert.equal(unitSystem({}), 'metric');
  assert.equal(unitSystem({ OBD2MCP_UNITS: 'metric' }), 'metric');
  assert.equal(unitSystem({ OBD2MCP_UNITS: ' Imperial ' }), 'imperial');
  assert.equal(unitSystem({ OBD2MCP_UNITS: 'US' }), 'imperial');
  assert.equal(unitSystem({ OBD2MCP_UNITS: 'kelvin' }), 'metric');
});

test('conversions to US units', () => {
  assert.deepEqual(displayValue(89, 'degC', 'imperial'), { value: 192.2, unit: 'degF' });
  assert.deepEqual(displayValue(-40, 'degC', 'imperial'), { value: -40, unit: 'degF' });
  assert.deepEqual(displayValue(100, 'km/h', 'imperial'), { value: 62.14, unit: 'mph' });
  assert.deepEqual(displayValue(350, 'km', 'imperial'), { value: 217.48, unit: 'mi' });
  assert.deepEqual(displayValue(100, 'kPa', 'imperial'), { value: 14.5, unit: 'psi' });
  assert.deepEqual(displayValue(3.79, 'L/h', 'imperial'), { value: 1, unit: 'gal/h' });
  assert.deepEqual(displayValue(748, 'rpm', 'imperial'), { value: 748, unit: 'rpm' });
  assert.deepEqual(displayValue(89, 'degC', 'metric'), { value: 89, unit: 'degC' });
});

async function session(t, units) {
  const server = buildServer(new Elm327(new MockTransport('catalyst')), true, { units });
  const client = new Client({ name: 'units-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  t.after(async () => { await client.close(); await server.close(); });
  return client;
}

test('imperial: the readable report uses US units, tool data stays metric, and the assistant is told', async t => {
  const client = await session(t, 'imperial');
  assert.match(client.getInstructions(), /The user prefers US units/);
  const report = JSON.parse((await client.callTool({ name: 'read_diagnostic_report', arguments: {} })).content[0].text);
  assert.equal(report.sections.read_live_data.data.live_data.coolant_temp.unit, 'degC', 'results stay metric');
  const text = (await client.callTool({ name: 'format_diagnostic_report', arguments: {} })).content[0].text;
  assert.match(text, /\| Engine coolant temperature \| 190\.4°F \|/, 'freeze frame 88 °C');
  assert.match(text, /\| Vehicle speed \| 60\.89 mph \|/, 'freeze frame 98 km/h');
  assert.match(text, /\| Intake manifold absolute pressure \| 5\.95 psi \|/);
  const metric = (await client.callTool({ name: 'format_diagnostic_report', arguments: { units: 'metric' } })).content[0].text;
  assert.match(metric, /\| Vehicle speed \| 98 km\/h \|/);
});

test('metric by default, with no units instruction', async t => {
  const client = await session(t, 'metric');
  assert.doesNotMatch(client.getInstructions(), /US units/);
  await client.callTool({ name: 'read_diagnostic_report', arguments: {} });
  const text = (await client.callTool({ name: 'format_diagnostic_report', arguments: {} })).content[0].text;
  assert.match(text, /\| Engine coolant temperature \| 88°C \|/);
  const us = (await client.callTool({ name: 'format_diagnostic_report', arguments: { units: 'imperial' } })).content[0].text;
  assert.match(us, /\| Engine coolant temperature \| 190\.4°F \|/);
});
