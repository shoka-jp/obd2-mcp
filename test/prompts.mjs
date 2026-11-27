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

test('six guided prompts are listed with titles and optional arguments', async () => {
  await withClient(async client => {
    const { prompts } = await client.listPrompts();
    assert.deepEqual(prompts.map(p => p.name).sort(), ['after_repair_check', 'check_engine_light', 'connect_adapter', 'inspection_check', 'used_car_check', 'workshop_handover']);
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
    for (const name of ['check_engine_light', 'workshop_handover', 'connect_adapter', 'used_car_check', 'inspection_check', 'after_repair_check']) {
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
    assert.ok(handover.indexOf('read_diagnostic_report') < handover.indexOf('format_diagnostic_report'), 'collect, then format');
    assert.match(handover, /give its text to the user unchanged/);
    assert.match(handover, /do not edit the formatted report/);
    const connect = text(await client.getPrompt({ name: 'connect_adapter', arguments: { adapter: 'USB' } }));
    assert.match(connect, /My adapter: USB/);
    assert.ok(connect.indexOf('find_adapter') < connect.indexOf('use_adapter'), 'find before switching');
    assert.ok(connect.indexOf('use_adapter') < connect.indexOf('read_supported_pids'), 'switch before reading');
    assert.match(connect, /do not ask for a port name/);
    assert.match(connect, /OBD2MCP_CONNECTION/);
  });
});

test('used_car_check asks for permission, reads permanent codes and treats clearing signs as questions', async () => {
  await withClient(async client => {
    const body = text(await client.getPrompt({ name: 'used_car_check', arguments: { notes: 'Battery replaced last week', language: '日本語' } }));
    assert.ok(body.indexOf("seller has agreed") < body.indexOf('read_diagnostic_report'), 'permission comes before any read');
    assert.match(body, /It includes permanent codes \(read_permanent_dtcs\)/);
    assert.ok(body.indexOf('read_diagnostic_report') < body.indexOf('read_supported_pids'), 'supported sensors are checked before reading distance_with_mil');
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

test('inspection_check reads readiness and permanent codes, explains typical rules and never suggests clearing', async () => {
  await withClient(async client => {
    const body = text(await client.getPrompt({ name: 'inspection_check', arguments: { vehicle: '2015 gasoline, California', language: 'English' } }));
    assert.ok(body.indexOf('parked') < body.indexOf('read_dtcs'), 'parking comes before any read');
    for (const tool of ['read_dtcs', 'read_readiness', 'read_permanent_dtcs', 'read_supported_pids']) assert.match(body, new RegExp(tool));
    assert.match(body, /"""\n2015 gasoline, California\n"""/);
    assert.match(body, /1996 to 2000 may have up to two incomplete monitors, 2001 and newer up to one/);
    assert.match(body, /not_supported do not apply/);
    assert.match(body, /does not guarantee passing/);
    assert.match(body, /Never suggest clearing codes, disconnecting the battery/);
    assert.match(body, /Do not promise that the car will pass/);
    assert.match(body, /Do not call clear_dtcs/);
    assert.match(body, /Write your reply in English\./);
  });
});

test('after_repair_check compares with a report from before the repair and treats a permanent code as not yet confirmed', async () => {
  await withClient(async client => {
    const body = text(await client.getPrompt({ name: 'after_repair_check', arguments: { repair: 'Catalytic converter replaced for P0420 last Tuesday', language: '日本語' } }));
    assert.ok(body.indexOf('parked') < body.indexOf('read_diagnostic_report'), 'parking comes before any read');
    assert.ok(body.indexOf('read_diagnostic_report') < body.indexOf('compare_diagnostic_reports'), 'collect before comparing');
    assert.match(body, /"""\nCatalytic converter replaced for P0420 last Tuesday\n"""/);
    assert.match(body, /earlier_report_json/);
    assert.match(body, /it includes permanent codes \(read_permanent_dtcs\)/);
    assert.match(body, /not a sign that the repair failed/);
    assert.match(body, /Incomplete readiness monitors are normal after a repair/);
    assert.match(body, /Do not judge the workshop/);
    assert.match(body, /Do not say the repair definitely worked/);
    assert.match(body, /Do not call clear_dtcs/);
    assert.match(body, /Write your reply in 日本語\./);
    const bare = text(await client.getPrompt({ name: 'after_repair_check', arguments: {} }));
    assert.match(bare, /Ask which code or problem the repair was for/);
  });
});
