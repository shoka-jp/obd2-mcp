import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';
import { buildServer } from '../dist/server.js';

async function createClient(scenario) {
  const server = buildServer(new Elm327(new MockTransport(scenario)), true);
  const client = new Client({ name: 'scenario-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  return { client, server };
}

async function call(client, name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  assert.notEqual(r.isError, true, r.content[0].text);
  return JSON.parse(r.content[0].text);
}

for (const [scenario, code] of [['catalyst', 'P0420'], ['misfire', 'P0301'], ['lean', 'P0171'], ['evap', 'P0456'], ['healthy', null], ['cleared', null]]) {
  test(`${scenario}: codes, freeze frame and simulation label`, async () => {
    const { client, server } = await createClient(scenario);
    try {
      const codes = await call(client, 'read_dtcs');
      assert.equal(codes.simulated, true);
      assert.match(codes.source, new RegExp(`mock:${scenario}`));
      assert.deepEqual(codes.stored_dtcs, code ? [code] : []);
      assert.equal(codes.mil_on, Boolean(code));
      const freeze = await call(client, 'read_freeze_frame');
      assert.equal(freeze.freeze_frame?.dtc ?? null, code);
      if (scenario === 'lean') {
        const live = await call(client, 'read_live_data', { pids: ['ltft_b1'] });
        assert.ok(live.live_data.ltft_b1.value > 10);
      }
    } finally { await client.close(); await server.close(); }
  });
}

test('cleared: no stored codes, but the permanent code and incomplete monitors remain', async () => {
  const { client, server } = await createClient('cleared');
  try {
    const codes = await call(client, 'read_dtcs');
    assert.deepEqual(codes.stored_dtcs, []);
    assert.equal(codes.mil_on, false);
    assert.deepEqual((await call(client, 'read_permanent_dtcs')).permanent_dtcs, ['P0420']);
    const monitors = (await call(client, 'read_readiness')).readiness_monitors;
    for (const name of ['catalyst', 'evaporative_system', 'oxygen_sensor']) assert.equal(monitors[name], 'incomplete', name);
    assert.equal(monitors.misfire, 'complete');
    const readiness = await call(client, 'read_readiness');
    assert.deepEqual(readiness.incomplete_monitors, ['catalyst', 'evaporative_system', 'oxygen_sensor']);
    assert.equal(readiness.supported_count, 8);
    assert.equal(readiness.complete_count, 5);
    const live = await call(client, 'read_live_data', { pids: ['distance_with_mil'] });
    assert.equal(live.live_data.distance_with_mil.value, 0);
  } finally { await client.close(); await server.close(); }
});

test('readiness summary counts only supported monitors', async () => {
  for (const [scenario, incomplete] of [['healthy', []], ['catalyst', ['evaporative_system']]]) {
    const { client, server } = await createClient(scenario);
    try {
      const readiness = await call(client, 'read_readiness');
      assert.deepEqual(readiness.incomplete_monitors, incomplete, scenario);
      assert.equal(readiness.supported_count, 8, scenario);
      assert.equal(readiness.complete_count, 8 - incomplete.length, scenario);
      assert.ok(!readiness.incomplete_monitors.includes('heated_catalyst'), 'not_supported monitors are never listed as incomplete');
    } finally { await client.close(); await server.close(); }
  }
});

test('clearing one mock session resets readiness but not other sessions', async () => {
  const a = await createClient('catalyst');
  const b = await createClient('catalyst');
  try {
    await call(a.client, 'clear_dtcs', { confirm: true });
    assert.deepEqual((await call(a.client, 'read_dtcs')).stored_dtcs, []);
    assert.equal((await call(a.client, 'read_readiness')).readiness_monitors.catalyst, 'incomplete');
    assert.deepEqual((await call(b.client, 'read_dtcs')).stored_dtcs, ['P0420']);
    assert.equal((await call(b.client, 'read_readiness')).readiness_monitors.catalyst, 'complete');
  } finally { await a.client.close(); await a.server.close(); await b.client.close(); await b.server.close(); }
});

test('clearing mock codes resets distance_with_mil to 0 only when supported', async () => {
  const { client, server } = await createClient('catalyst');
  try {
    const before = await call(client, 'read_live_data', { pids: ['distance_with_mil'] });
    assert.equal(before.live_data.distance_with_mil.value, 128);
    await call(client, 'clear_dtcs', { confirm: true });
    const after = await call(client, 'read_live_data', { pids: ['distance_with_mil'] });
    assert.equal(after.live_data.distance_with_mil.value, 0);
  } finally { await client.close(); await server.close(); }

  const unsupportedMock = new MockTransport('catalyst');
  delete unsupportedMock.state.live.distance_with_mil;
  assert.equal(await unsupportedMock.sendRaw('04'), '44\r');
  assert.equal(await unsupportedMock.sendRaw('0121'), 'NO DATA\r');
  assert.equal('distance_with_mil' in unsupportedMock.state.live, false);
});

test('unknown scenario is rejected before the mock server starts', () => {
  const result = spawnSync(process.execPath, ['dist/index.js'], {
    env: { ...process.env, OBD2MCP_CONNECTION: 'mock', OBD2MCP_MOCK_SCENARIO: 'unknown' }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown mock scenario/);
  assert.doesNotMatch(result.stderr, /obd2-mcp ready/);
});

test('environment scenario is honored over a real stdio client', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    env: { ...process.env, OBD2MCP_CONNECTION: 'mock', OBD2MCP_MOCK_SCENARIO: 'lean' },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'stdio-test', version: '1' });
  try {
    await client.connect(transport);
    const result = await call(client, 'read_dtcs');
    assert.deepEqual(result.stored_dtcs, ['P0171']);
    assert.equal(result.simulated, true);
  } finally { await client.close(); }
});

test('scenario setting does not affect real connection selection', () => {
  const result = spawnSync(process.execPath, ['dist/index.js'], {
    env: { ...process.env, OBD2MCP_CONNECTION: 'serial:/nonexistent', OBD2MCP_MOCK_SCENARIO: 'unknown' }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /serial:\/nonexistent/);
});
