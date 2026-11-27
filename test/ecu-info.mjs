import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';
import { buildServer } from '../dist/server.js';
import {
  protocolNumber, protocolName, reassembleByHeader, supportedInfoPids,
  calibrationIds, calibrationVerificationNumbers, ecuName, isNegative,
} from '../dist/mode09.js';

const ascii = text => [...Buffer.from(text, 'ascii')];
const pad = (bytes, size) => [...bytes, ...Array(size - bytes.length).fill(0)];

test('protocol numbers from ATDPN', () => {
  assert.equal(protocolNumber(['A6']), '6');
  assert.equal(protocolNumber(['7']), '7');
  assert.equal(protocolNumber(['A0']), null, 'not found yet');
  assert.equal(protocolNumber(['?']), null);
  assert.equal(protocolNumber(['A3']), '3');
  assert.equal(protocolName('3'), 'ISO 9141-2');
  assert.equal(protocolName('6'), 'ISO 15765-4 CAN (11-bit ID, 500 kbaud)');
});

test('headered answers are grouped by module and reassembled', () => {
  const answers = reassembleByHeader([
    '7E8 10 0B 49 04 01 41 42 43',
    '7E9 06 49 00 10 40 00 00',
    '7E8 21 44 45 46 47 48 00 00',
  ], 3);
  assert.deepEqual(answers.get('7E8'), [0x49, 0x04, 0x01, ...ascii('ABCDEFGH')]);
  assert.deepEqual(answers.get('7E9'), [0x49, 0x00, 0x10, 0x40, 0x00, 0x00]);
  // 29-bit headers, no spaces (ATS0).
  const wide = reassembleByHeader(['18DAF1100749060112345678'], 8);
  assert.deepEqual(wide.get('18DAF110'), [0x49, 0x06, 0x01, 0x12, 0x34, 0x56, 0x78]);
});

test('reassembly refuses what it cannot be sure of, per module', () => {
  const error = (lines, header = '7E8') => {
    const value = reassembleByHeader(lines, 3).get(header);
    assert(value instanceof Error, `expected an error for ${header}`);
    return value.message;
  };
  assert.match(error(['7E8 10 14 49 0A 01 41 42 43', '7E8 22 44 45 46 47 48 49 4A']), /Frame out of sequence from 7E8/);
  assert.match(error(['7E8 10 14 49 0A 01 41 42 43']), /Incomplete answer from 7E8/);
  assert.match(error(['7E8 03 49 00 10', '7E8 03 49 00 20']), /More than one answer from 7E8/);
  assert.match(error(['7E8 09 49 00']), /Invalid single frame from 7E8/);
  assert.match(error(['7E8 30 00 00']), /Unexpected frame type from 7E8/);
  // One module's broken frames do not hide another module's answer.
  const mixed = reassembleByHeader(['7E8 10 14 49 0A 01 41 42 43', '7E9 03 49 00 10'], 3);
  assert(mixed.get('7E8') instanceof Error);
  assert.deepEqual(mixed.get('7E9'), [0x49, 0x00, 0x10]);
  assert.throws(() => reassembleByHeader(['SEARCHING'], 3), /Unexpected line/);
});

test('mode 09 payloads', () => {
  assert.deepEqual([...supportedInfoPids([0x49, 0x00, 0x54, 0x40, 0x00, 0x00])].sort((a, b) => a - b), [0x02, 0x04, 0x06, 0x0a]);
  assert.throws(() => supportedInfoPids([0x49, 0x00, 0x54]), /Invalid answer to 0900/);
  assert.deepEqual(calibrationIds([0x49, 0x04, 0x02, ...pad(ascii('JMB*36761500'), 16), ...pad(ascii('JMB*47872611'), 16)]), ['JMB*36761500', 'JMB*47872611']);
  assert.throws(() => calibrationIds([0x49, 0x04, 0x02, ...pad(ascii('ONLYONE'), 16)]), /Unexpected length/);
  assert.throws(() => calibrationIds([0x49, 0x04, 0x01, 0x01, ...pad([], 15)]), /Unreadable calibration ID/);
  assert.deepEqual(calibrationVerificationNumbers([0x49, 0x06, 0x02, 0x17, 0x91, 0xbc, 0x82, 0x00, 0x0a, 0xff, 0x01]), ['1791BC82', '000AFF01']);
  assert.equal(ecuName([0x49, 0x0a, 0x01, ...pad([...ascii('ECM'), 0, ...ascii('-EngineControl')], 20)]), 'ECM-EngineControl');
  assert.throws(() => ecuName([0x49, 0x0a, 0x01, ...ascii('short')]), /Unexpected length/);
  assert.equal(isNegative([0x7f, 0x09, 0x12]), true);
});

/** A server on the mock vehicle; `override` can replace the answer to any command. */
async function session(t, { scenario = 'catalyst', override = () => undefined } = {}) {
  const mock = new MockTransport(scenario);
  const commands = [];
  const transport = {
    describe: () => mock.describe(),
    open: () => mock.open(),
    close: async () => { commands.push('<close>'); return mock.close(); },
    sendRaw: async command => {
      commands.push(command);
      const real = await mock.sendRaw(command);
      return override(command, real) ?? real;
    },
  };
  const server = buildServer(new Elm327(transport), true);
  const client = new Client({ name: 'ecu-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  t.after(async () => { await client.close(); await server.close(); });
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    return { result, data: JSON.parse(result.content[0].text) };
  };
  return { client, commands, call };
}

test('the tool is listed as a read-only vehicle read', async t => {
  const { client } = await session(t);
  const tool = (await client.listTools()).tools.find(x => x.name === 'read_ecu_info');
  assert.ok(tool);
  assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true });
  assert.match(tool.description, /does not read the VIN/);
  assert.match(tool.description, /Do not conclude that a module was modified or tuned/);
});

test('two modules: names, calibration IDs, verification numbers, and headers turned off again', async t => {
  const { call, commands } = await session(t);
  const { result, data } = await call('read_ecu_info');
  assert.notEqual(result.isError, true);
  assert.equal(data.supported, true);
  assert.equal(data.simulated, true);
  assert.equal(data.protocol, 'ISO 15765-4 CAN (11-bit ID, 500 kbaud)');
  assert.deepEqual(data.modules, [
    { address: '7E8', name: 'ECM-EngineControl', calibration_ids: ['MOCK-ECM-A540'], calibration_verification_numbers: ['4E1F2A3C'] },
    { address: '7E9', name: 'TCM-TransmissionCtl', calibration_ids: ['MOCK-TCM-A120'], not_supported: ['calibration_verification_numbers'] },
  ]);
  assert.match(data.note, /do not conclude from them that a module was modified or tuned/);
  // The protocol was not known yet, so one ordinary request found it first.
  const from = commands.indexOf('ATH1');
  assert.deepEqual(commands.slice(from), ['ATH1', 'ATDPN', '0100', 'ATDPN', '0900', '090A', '0904', '0906', 'ATH0']);
  assert(!commands.includes('0902'), 'never reads the VIN');
  assert(!commands.includes('04'), 'never clears');
  // Headers are off again: ordinary reads still parse.
  assert.deepEqual((await call('read_dtcs')).data.stored_dtcs, ['P0420']);
});

test('a module with only a name, and a known protocol needs no extra request', async t => {
  const { call, commands } = await session(t, { scenario: 'partial' });
  await call('read_dtcs');
  const { data } = await call('read_ecu_info');
  assert.deepEqual(data.modules, [{ address: '7E8', name: 'ECM-EngineControl', not_supported: ['calibration_ids', 'calibration_verification_numbers'] }]);
  const from = commands.indexOf('ATH1');
  assert.deepEqual(commands.slice(from), ['ATH1', 'ATDPN', '0900', '090A', 'ATH0']);
});

test('older protocols, no mode 09 answer, and no protocol are not supported, never guessed', async t => {
  const older = await session(t, { override: c => (c === 'ATDPN' ? 'A3\r' : undefined) });
  const kline = (await older.call('read_ecu_info')).data;
  assert.equal(kline.supported, false);
  assert.equal(kline.protocol, 'ISO 9141-2');
  assert.deepEqual(kline.modules, []);
  assert.match(kline.note, /only on CAN vehicles/);
  assert(!older.commands.includes('0900'));

  const silent = await session(t, { override: c => (c === '0900' ? 'NO DATA\r' : undefined) });
  const none = (await silent.call('read_ecu_info')).data;
  assert.equal(none.supported, false);
  assert.match(none.note, /No module answered/);

  const off = await session(t, { override: c => (c === 'ATDPN' ? 'A0\r' : c === '0100' ? 'NO DATA\r' : undefined) });
  const unknown = (await off.call('read_ecu_info')).data;
  assert.equal(unknown.supported, false);
  assert.match(unknown.note, /has not found the vehicle's protocol/);
  assert.equal(off.commands.at(-1), 'ATH0');
});

test('a module that advertises but does not answer, a negative answer, and a garbled answer', async t => {
  const { call } = await session(t, {
    override: (c, real) => {
      if (c === '0904') return real.split('\r').filter(l => !l.startsWith('7E9')).join('\r'); // TCM silent
      if (c === '090A') return '7E8 03 7F 09 12\r7E9 10 17 49 0A 01 54 43 4D\r'; // ECM refuses, TCM cut off
      return undefined;
    },
  });
  const { result, data } = await call('read_ecu_info');
  assert.notEqual(result.isError, true);
  const [ecm, tcm] = data.modules;
  assert.equal(ecm.name, undefined);
  assert.deepEqual(ecm.not_supported, ['name']);
  assert.equal(ecm.errors, undefined, "the TCM's broken answer does not affect the ECM");
  assert.deepEqual(ecm.calibration_ids, ['MOCK-ECM-A540']);
  assert.equal(tcm.errors.name, 'Incomplete answer from 7E9');
  assert.equal(tcm.errors.calibration_ids, 'advertised this information but did not answer');
  assert.equal(tcm.calibration_ids, undefined);
});

test('29-bit CAN addresses', async t => {
  const wide = {
    ATDPN: 'A7\r',
    '0900': '18DAF110064900544000000000\r',
    '090A': '18DAF110101749 0A 01 45 43 4D\r18DAF1102100 2D 45 6E 67 69 6E\r18DAF11022 65 43 6F 6E 74 72 6F\r18DAF11023 6C 00 00 00 00 00 00\r',
    '0904': '18DAF110101349 04 01 41 42 43\r18DAF11021 44 45 46 47 48 49 4A\r18DAF11022 4B 4C 4D 00 00 00 00\r',
    '0906': '18DAF110074906010A0B0C0D00\r',
  };
  const { call } = await session(t, { override: c => wide[c] });
  const { data } = await call('read_ecu_info');
  assert.equal(data.protocol, 'ISO 15765-4 CAN (29-bit ID, 500 kbaud)');
  assert.deepEqual(data.modules, [{ address: '18DAF110', name: 'ECM-EngineControl', calibration_ids: ['ABCDEFGHIJKLM'], calibration_verification_numbers: ['0A0B0C0D'] }]);
});

test('if headers cannot be turned off again, the next request starts the adapter afresh', async t => {
  let refuse = false;
  const { call, commands } = await session(t, { override: c => (c === 'ATH0' && refuse ? '?\r' : undefined) });
  await call('read_dtcs');
  refuse = true;
  const first = (await call('read_ecu_info')).data;
  assert.equal(first.supported, true, 'the information itself was read');
  assert.equal(commands.at(-1), '<close>');
  refuse = false;
  const before = commands.length;
  assert.deepEqual((await call('read_dtcs')).data.stored_dtcs, ['P0420']);
  assert.deepEqual(commands.slice(before, before + 6), ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0']);
});

test('other reads wait while headers are on', async t => {
  const { call, commands } = await session(t);
  await call('read_dtcs');
  const [ecu, live] = await Promise.all([call('read_ecu_info'), call('read_live_data', { pids: ['rpm', 'coolant_temp'] })]);
  assert.equal(ecu.data.supported, true);
  assert.notEqual(live.result.isError, true);
  assert.equal(typeof live.data.live_data.rpm.value, 'number');
  const on = commands.indexOf('ATH1');
  const off = commands.indexOf('ATH0', on);
  assert(commands.slice(on, off).every(c => c.startsWith('AT') || c.startsWith('09') || c === '0100'), 'no other request between ATH1 and ATH0');
});

test('a module whose support answer is broken is listed with the error', async t => {
  const { call } = await session(t, { override: c => (c === '0900' ? '7E8 06 49 00 54 40 00 00 00\r7E9 10 09 49 00 10 40 00 00\r' : undefined) });
  const { data } = await call('read_ecu_info');
  const tcm = data.modules.find(m => m.address === '7E9');
  assert.equal(tcm.errors.supported_information, 'Incomplete answer from 7E9');
  assert.equal(data.modules.find(m => m.address === '7E8').name, 'ECM-EngineControl');
});
