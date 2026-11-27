import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describeDtc, codeInfo } from '../dist/dtc-info.js';
import { buildServer } from '../dist/server.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';

test('describeDtc reports the system and who defines the meaning', () => {
  const cases = {
    P0420: ['powertrain', 'sae'],
    P2187: ['powertrain', 'sae'],
    P1234: ['powertrain', 'manufacturer'],
    P3000: ['powertrain', 'manufacturer'],
    P33FF: ['powertrain', 'manufacturer'],
    P3400: ['powertrain', 'sae'],
    C0035: ['chassis', 'sae'],
    C1234: ['chassis', 'manufacturer'],
    B2AAA: ['body', 'manufacturer'],
    B3000: ['body', 'varies'],
    U0100: ['network', 'sae'],
  };
  for (const [code, [system, definition]] of Object.entries(cases)) {
    assert.deepEqual(describeDtc(code), { system, definition }, code);
  }
  for (const invalid of ['', 'P042', 'P4420', 'X0100', 'p0420', 'P04G0']) {
    assert.equal(describeDtc(invalid), null, invalid);
  }
});

test('codeInfo lists each distinct code once and is undefined when empty', () => {
  assert.equal(codeInfo([]), undefined);
  assert.equal(codeInfo([null, undefined]), undefined);
  assert.deepEqual(Object.keys(codeInfo(['P0420', 'P0420', 'P1234'])), ['P0420', 'P1234']);
});

async function session(t, scenario) {
  const server = buildServer(new Elm327(new MockTransport(scenario)), true);
  const client = new Client({ name: 'code-info-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  t.after(async () => { await client.close(); await server.close(); });
  return async name => JSON.parse((await client.callTool({ name, arguments: {} })).content[0].text);
}

test('code tools attach code_info for the codes they return', async t => {
  const call = await session(t, 'catalyst');
  const dtcs = await call('read_dtcs');
  assert.deepEqual(dtcs.stored_dtcs, ['P0420']);
  assert.deepEqual(dtcs.code_info, { P0420: { system: 'powertrain', definition: 'sae' } });
  const permanent = await call('read_permanent_dtcs');
  assert.deepEqual(permanent.code_info, { P0420: { system: 'powertrain', definition: 'sae' } });
  const freeze = await call('read_freeze_frame');
  assert.equal(freeze.freeze_frame.dtc, 'P0420');
  assert.deepEqual(freeze.code_info, { P0420: { system: 'powertrain', definition: 'sae' } });
});

test('no code_info when there are no codes', async t => {
  const call = await session(t, 'healthy');
  const dtcs = await call('read_dtcs');
  assert.deepEqual(dtcs.stored_dtcs, []);
  assert.equal('code_info' in dtcs, false);
});
