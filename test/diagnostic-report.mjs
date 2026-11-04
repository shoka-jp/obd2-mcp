import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';
import { buildServer } from '../dist/server.js';

async function session(responses = {}) {
  const mock = new MockTransport();
  const commands = [];
  const transport = {
    describe: () => 'serial:/private-device',
    open: () => mock.open(),
    close: () => mock.close(),
    sendRaw: async command => {
      commands.push(command);
      return responses[command] ?? mock.sendRaw(command);
    },
  };
  const server = buildServer(new Elm327(transport), true);
  const client = new Client({ name: 'report-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  return { client, server, commands };
}

test('report combines existing readers with timestamps, structured data and no VIN request', async () => {
  const { client, server, commands } = await session();
  try {
    const tools = await client.listTools();
    assert.equal(tools.tools.find(tool => tool.name === 'read_diagnostic_report').annotations.readOnlyHint, true);
    const response = await client.callTool({ name: 'read_diagnostic_report', arguments: {} });
    const report = JSON.parse(response.content[0].text);
    assert.deepEqual(response.structuredContent, report);
    assert.equal(report.schema_version, 1);
    assert.equal(report.simulated, true);
    assert.deepEqual(Object.keys(report.sections), ['read_dtcs', 'read_freeze_frame', 'read_live_data', 'read_readiness']);
    assert.deepEqual(report.sections.read_dtcs.data.stored_dtcs, ['P0420']);
    assert.equal(report.sections.read_freeze_frame.data.freeze_frame.conditions.rpm.value, 2210);
    assert.equal(report.sections.read_live_data.data.live_data.coolant_temp.value, 89);
    assert.equal(report.sections.read_readiness.data.readiness_monitors.catalyst, 'complete');
    assert(Number.isFinite(Date.parse(report.started_at)));
    assert(Number.isFinite(Date.parse(report.completed_at)));
    for (const section of Object.values(report.sections)) {
      assert.equal(section.is_error, false);
      assert(Date.parse(section.collected_at) >= Date.parse(report.started_at));
      assert(Date.parse(section.collected_at) <= Date.parse(report.completed_at));
      assert.equal('source' in section.data, false);
    }
    assert(!response.content[0].text.includes('private-device'));
    assert(!response.content[0].text.includes('1HGFC2F59GA000042'));
    assert(!commands.includes('0902'));
    assert(!commands.includes('04'));
  } finally { await client.close(); await server.close(); }
});

test('one failed reader remains visible while subsequent report sections are collected', async () => {
  const { client, server, commands } = await session({ '020200': 'CAN ERROR' });
  try {
    const response = await client.callTool({ name: 'read_diagnostic_report', arguments: {} });
    const report = JSON.parse(response.content[0].text);
    assert.equal(report.sections.read_freeze_frame.is_error, true);
    assert.match(report.sections.read_freeze_frame.data.error, /CAN ERROR/);
    assert.deepEqual(report.sections.read_dtcs.data.stored_dtcs, ['P0420']);
    assert.equal(report.sections.read_live_data.is_error, false);
    assert.equal(report.sections.read_live_data.data.live_data.coolant_temp.value, 89);
    assert.equal(report.sections.read_readiness.data.readiness_monitors.catalyst, 'complete');
    assert(commands.includes('010C'));
  } finally { await client.close(); await server.close(); }
});

test('report preserves unknown code lists and per-sensor errors', async () => {
  const { client, server } = await session({
    '0101': '41 01 00 07 E5 04', '03': 'NO DATA', '07': 'NO DATA', '010C': 'NO DATA', '020200': 'NO DATA',
  });
  try {
    const response = await client.callTool({ name: 'read_diagnostic_report', arguments: {} });
    const report = JSON.parse(response.content[0].text);
    assert.equal(report.sections.read_dtcs.data.stored_dtcs, null);
    assert.equal(report.sections.read_dtcs.data.pending_dtcs, null);
    assert.equal(report.sections.read_freeze_frame.data.freeze_frame, null);
    assert.match(report.sections.read_freeze_frame.data.note, /unavailable/);
    assert.match(report.sections.read_live_data.data.live_data.rpm.error, /No data/);
    assert.equal('value' in report.sections.read_live_data.data.live_data.rpm, false);
    assert.equal(report.sections.read_live_data.data.live_data.coolant_temp.value, 89);
  } finally { await client.close(); await server.close(); }
});
