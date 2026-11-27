import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';
import { buildServer } from '../dist/server.js';

async function withClient(check) {
  const server = buildServer(new Elm327(new MockTransport()), true);
  const client = new Client({ name: 'prompts-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  try { await check(client); } finally { await client.close(); await server.close(); }
}

const text = result => {
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].role, 'user');
  return result.messages[0].content.text;
};

test('four guided prompts are listed with titles and optional arguments', async () => {
  await withClient(async client => {
    const { prompts } = await client.listPrompts();
    assert.deepEqual(prompts.map(p => p.name).sort(), ['check_engine_light', 'connect_adapter', 'used_car_check', 'workshop_handover']);
    for (const prompt of prompts) {
      assert.ok(prompt.title && prompt.description, prompt.name);
      assert.ok(prompt.arguments.every(arg => arg.required !== true), `${prompt.name} arguments are optional`);
      assert.ok(prompt.arguments.some(arg => arg.name === 'language'), `${prompt.name} accepts a reply language`);
    }
  });
});

test('check_engine_light uses the report, keeps evidence separate and never clears codes', async () => {
  await withClient(async client => {
    const body = text(await client.getPrompt({ name: 'check_engine_light', arguments: { symptoms: 'Light came on after refuelling', language: '日本語' } }));
    assert.match(body, /read_diagnostic_report/);
    assert.match(body, /"""\nLight came on after refuelling\n"""/);
    assert.match(body, /freeze frame/i);
    assert.match(body, /Do not call clear_dtcs/);
    assert.match(body, /flashing/);
    assert.match(body, /Write your reply in 日本語\./);
  });
});

test('prompts work without arguments', async () => {
  await withClient(async client => {
    for (const name of ['check_engine_light', 'workshop_handover', 'connect_adapter', 'used_car_check']) {
      const body = text(await client.getPrompt({ name, arguments: {} }));
      assert.match(body, /Reply in the language of this conversation\./, name);
      assert.doesNotMatch(body, /undefined/, name);
    }
  });
});

test('workshop_handover excludes identifying data and connect_adapter finds the port first', async () => {
  await withClient(async client => {
    const handover = text(await client.getPrompt({ name: 'workshop_handover', arguments: {} }));
    assert.match(handover, /Leave out the VIN/);
    assert.match(handover, /unavailable, unknown or failed/);
    const connect = text(await client.getPrompt({ name: 'connect_adapter', arguments: { adapter: 'USB' } }));
    assert.match(connect, /My adapter: USB/);
    assert.ok(connect.indexOf('list_serial_ports') < connect.indexOf('read_supported_pids'));
    assert.match(connect, /OBD2MCP_CONNECTION/);
  });
});

test('used_car_check asks for permission, reads permanent codes and treats clearing signs as questions', async () => {
  await withClient(async client => {
    const body = text(await client.getPrompt({ name: 'used_car_check', arguments: { notes: 'Battery replaced last week', language: '日本語' } }));
    assert.ok(body.indexOf("seller has agreed") < body.indexOf('read_diagnostic_report'), 'permission comes before any read');
    assert.ok(body.indexOf('read_diagnostic_report') < body.indexOf('read_permanent_dtcs'));
    assert.ok(body.indexOf('read_permanent_dtcs') < body.indexOf('read_supported_pids'), 'supported sensors are checked before reading distance_with_mil');
    assert.match(body, /survives a battery disconnect/);
    assert.match(body, /repaired recently/);
    assert.match(body, /after the test drive, once parked/);
    assert.match(body, /not_supported do not apply/);
    assert.ok(body.indexOf('short summary first') > 0, 'summary comes first for on-site reading');
    assert.match(body, /"""\nBattery replaced last week\n"""/);
    assert.match(body, /not as proof/);
    assert.match(body, /not a clean bill of health/);
    assert.match(body, /Never clear codes on a car you do not own/);
    assert.match(body, /Do not call clear_dtcs/);
    assert.match(body, /Write your reply in 日本語\./);
  });
});
