import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { Elm327 } from '../dist/elm327.js';
import { TcpTransport } from '../dist/transport.js';
import { buildServer } from '../dist/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { parseDtcPayload } from '../dist/dtc.js';

function adapter(responses = {}) {
  let opens = 0;
  return {
    get opens() { return opens; },
    describe: () => 'test adapter',
    open: async () => { opens++; await new Promise(resolve => setTimeout(resolve, 5)); },
    close: async () => {},
    sendRaw: async command => responses[command] ?? (command === 'ATZ' ? 'ELM327' : 'OK'),
  };
}

async function clientFor(responses, mock = false, approval) {
  const elm = new Elm327(adapter(responses));
  const server = buildServer(elm, mock);
  const client = new Client({ name: 'test', version: '1' }, approval === undefined ? {} : { capabilities: { elicitation: { form: {} } } });
  if (approval !== undefined) client.setRequestHandler(ElicitRequestSchema, async () => approval);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

test('initialization is shared by concurrent calls', async () => {
  const transport = adapter({ ATI: 'ELM327', ATRV: '12V' });
  const elm = new Elm327(transport);
  await Promise.all([elm.at('ATI'), elm.at('ATRV')]);
  assert.equal(transport.opens, 1);
});

test('rejects multiple ECU replies instead of concatenating data', async () => {
  const elm = new Elm327(adapter({ '03': '43 01 04 20\r43 01 01 33\r' }));
  await assert.rejects(elm.obd('03', '43'), /Ambiguous/);
});

test('rejects truncated or ambiguous counted DTC data', () => {
  assert.throws(() => parseDtcPayload([2, 4, 32]), /Incomplete/);
  assert.throws(() => parseDtcPayload([1, 4, 32, 67, 1, 1, 51]), /Ambiguous/);
  assert.deepEqual(parseDtcPayload([1, 4, 32, 0, 0]), ['P0420']);
});

test('rejects unsupported adapter initialization commands', async () => {
  const elm = new Elm327(adapter({ ATE0: '?' }));
  await assert.rejects(elm.at('ATI'), /Adapter rejected ATE0/);
});

test('rejects invalid or incomplete ISO-TP frames', async () => {
  for (const response of ['014\r0: 49 02 01 31\r', '004\r0: 49 02\r2: 01 31\r', '004\r0: 49 02\r0: 01 31\r']) {
    const elm = new Elm327(adapter({ '0902': response }));
    await assert.rejects(elm.obd('0902', '4902'));
  }
});

test('rejects short status data and incomplete PID data', async () => {
  const { client, server } = await clientFor({ '0101': '41 01 80', '010C': '41 0C 1A' });
  try {
    const status = await client.callTool({ name: 'read_dtcs', arguments: {} });
    assert.equal(status.isError, true);
    assert.match(status.content[0].text, /Incomplete response/);
    const live = await client.callTool({ name: 'read_live_data', arguments: { pids: ['rpm'] } });
    assert.match(live.content[0].text, /Incomplete response/);
  } finally { await client.close(); await server.close(); }
});

test('does not report an empty code list when the vehicle reports a stored code', async () => {
  const { client, server } = await clientFor({ '0101': '41 01 81 07 E5 04', '03': 'NO DATA', '07': 'NO DATA' });
  try {
    const result = await client.callTool({ name: 'read_dtcs', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Incomplete stored DTC response/);
  } finally { await client.close(); await server.close(); }
});

test('NO DATA is reported as unavailable rather than a confirmed empty list', async () => {
  const { client, server } = await clientFor({ '0101': '41 01 00 07 E5 04', '03': 'NO DATA', '07': 'NO DATA' });
  try {
    const result = await client.callTool({ name: 'read_dtcs', arguments: {} });
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.stored_dtcs, null);
    assert.equal(data.pending_dtcs, null);
  } finally { await client.close(); await server.close(); }
});

test('invalid adapter identification is not reported as connected', async () => {
  const { client, server } = await clientFor({ ATI: '?', ATRV: '12.5V' });
  try {
    const result = await client.callTool({ name: 'connection_status', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Invalid adapter/);
  } finally { await client.close(); await server.close(); }
});

test('unavailable voltage is distinct from adapter connection or vehicle communication', async () => {
  const { client, server } = await clientFor({ ATI: 'ELM327', ATRV: '?' });
  try {
    const result = await client.callTool({ name: 'connection_status', arguments: {} });
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.connected, true);
    assert.equal(data.battery_voltage, null);
    assert.equal(data.vehicle_communication, 'not_checked');
    assert.match(data.battery_voltage_note, /unavailable/);
  } finally { await client.close(); await server.close(); }
});

test('no PID data does not assert that the vehicle lacks support', async () => {
  const { client, server } = await clientFor({ '010C': 'NO DATA' });
  try {
    const result = await client.callTool({ name: 'read_live_data', arguments: { pids: ['rpm'] } });
    const data = JSON.parse(result.content[0].text);
    assert.match(data.live_data.rpm.error, /may be unsupported/);
    assert.match(data.live_data.rpm.error, /ignition may be off/);
  } finally { await client.close(); await server.close(); }
});

test('freeze frame propagates communication errors', async () => {
  const { client, server } = await clientFor({ '020200': '42 02 00 04 20', '020400': 'CAN ERROR' });
  try {
    const result = await client.callTool({ name: 'read_freeze_frame', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /CAN ERROR/);
  } finally { await client.close(); await server.close(); }
});

test('diesel readiness does not use gasoline monitor labels', async () => {
  const { client, server } = await clientFor({ '0101': '41 01 00 08 00 00' });
  try {
    const result = await client.callTool({ name: 'read_readiness', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Compression-ignition/);
  } finally { await client.close(); await server.close(); }
});

test('invalid VIN is returned as an error', async () => {
  const { client, server } = await clientFor({ '0902': '49 02 01 41 42' });
  try {
    const result = await client.callTool({ name: 'read_vin', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Incomplete/);
  } finally { await client.close(); await server.close(); }
});

test('real adapter clearing is disabled by default', async () => {
  const old = process.env.OBD2MCP_ENABLE_CLEAR;
  delete process.env.OBD2MCP_ENABLE_CLEAR;
  const { client, server } = await clientFor({ '04': '44' });
  try {
    const result = await client.callTool({ name: 'clear_dtcs', arguments: { confirm: true } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /disabled/);
  } finally {
    if (old !== undefined) process.env.OBD2MCP_ENABLE_CLEAR = old;
    await client.close(); await server.close();
  }
});

test('real adapter clearing fails closed without client elicitation', async () => {
  const old = process.env.OBD2MCP_ENABLE_CLEAR;
  process.env.OBD2MCP_ENABLE_CLEAR = '1';
  const { client, server } = await clientFor({ '04': '44' });
  try {
    const denied = await client.callTool({ name: 'clear_dtcs', arguments: { confirm: true } });
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].text, /client did not provide/);
  } finally {
    if (old === undefined) delete process.env.OBD2MCP_ENABLE_CLEAR;
    else process.env.OBD2MCP_ENABLE_CLEAR = old;
    await client.close(); await server.close();
  }
});

test('real adapter clearing requires explicit elicitation approval', async () => {
  const old = process.env.OBD2MCP_ENABLE_CLEAR;
  process.env.OBD2MCP_ENABLE_CLEAR = '1';
  try {
    for (const [approval, allowed] of [[{ action: 'decline' }, false], [{ action: 'accept', content: { approve: false } }, false], [{ action: 'accept', content: { approve: true } }, true]]) {
      const { client, server } = await clientFor({ '04': '44' }, false, approval);
      try {
        const result = await client.callTool({ name: 'clear_dtcs', arguments: { confirm: true } });
        assert.equal(result.isError === true, !allowed);
        if (allowed) assert.equal(JSON.parse(result.content[0].text).cleared, true);
      } finally { await client.close(); await server.close(); }
    }
  } finally {
    if (old === undefined) delete process.env.OBD2MCP_ENABLE_CLEAR;
    else process.env.OBD2MCP_ENABLE_CLEAR = old;
  }
});

test('mixed NO DATA and data replies are ambiguous', async () => {
  const elm = new Elm327(adapter({ '03': 'NO DATA\r43 01 04 20\r' }));
  await assert.rejects(elm.obd('03', '43'), /Ambiguous/);
});

test('adapter timeout prevents later commands using a stale response', async () => {
  const listener = net.createServer(socket => socket.on('data', () => {}));
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const t = new TcpTransport('127.0.0.1', listener.address().port);
  try {
    await t.open();
    await assert.rejects(t.sendRaw('010C', 20), /Timeout/);
    await assert.rejects(t.sendRaw('010D', 20), /unusable/);
  } finally { await t.close(); await new Promise(resolve => listener.close(resolve)); }
});
