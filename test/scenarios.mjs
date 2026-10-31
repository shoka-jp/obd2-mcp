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

for (const [scenario, code] of [['catalyst', 'P0420'], ['misfire', 'P0301'], ['lean', 'P0171'], ['healthy', null]]) {
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
