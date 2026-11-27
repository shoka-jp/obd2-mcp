import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';
import { formatPortList, listSerialPorts, SERIALPORT_MISSING } from '../dist/ports.js';
import { buildServer } from '../dist/server.js';

const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const fake = ports => async () => ({ SerialPort: { list: async () => ports } });

test('ports are summarized with connection values, sorted, and without device identifiers', async () => {
  const ports = await listSerialPorts(fake([
    { path: 'COM10', manufacturer: 'Microsoft', friendlyName: 'Standard Serial over Bluetooth link (COM10)' },
    { path: 'COM3', manufacturer: 'wch.cn', friendlyName: 'USB-SERIAL CH340 (COM3)', vendorId: '1A86', productId: '7523',
      serialNumber: 'SECRET-123', pnpId: 'USB\\VID_1A86&PID_7523\\SECRET', locationId: 'Port_#0001' },
    { path: '/dev/ttyUSB0', manufacturer: ' FTDI ', vendorId: '0403', productId: '6001' },
    { path: '' },
  ]));
  assert.deepEqual(ports.map(p => p.path), ['/dev/ttyUSB0', 'COM3', 'COM10']);
  const ch340 = ports.find(p => p.path === 'COM3');
  assert.deepEqual(ch340, {
    connection: 'serial:COM3',
    path: 'COM3',
    description: 'USB-SERIAL CH340 (COM3)',
    manufacturer: 'wch.cn',
    vendor_id: '1a86',
    product_id: '7523',
    usb_serial_chip: 'CH340/CH341',
  });
  assert.equal(ports[0].manufacturer, 'FTDI');
  assert.equal(ports[0].usb_serial_chip, 'FTDI');
  assert.equal(ports[2].usb_serial_chip, null);
  assert.doesNotMatch(JSON.stringify(ports), /SECRET|Port_#/);
});

test('a missing optional serialport package gives an actionable error', async () => {
  await assert.rejects(listSerialPorts(async () => { throw new Error('Cannot find package'); }), { message: SERIALPORT_MISSING });
});

test('a missing udevadm on Linux keeps the original error and explains how to specify a port directly', async () => {
  const failing = async () => ({
    SerialPort: { list: async () => { throw new Error('spawn udevadm ENOENT'); } },
  });
  await assert.rejects(listSerialPorts(failing), error => {
    assert.ok(error.message.includes('spawn udevadm ENOENT'), 'original error text is kept');
    assert.match(error.message, /udevadm/);
    assert.match(error.message, /\/dev\/ttyUSB\*/);
    assert.match(error.message, /serial:<path>/);
    assert.match(error.message, /docs\/troubleshooting\.md/);
    return true;
  });

  const other = async () => ({
    SerialPort: { list: async () => { throw new Error('unexpected listing failure'); } },
  });
  await assert.rejects(listSerialPorts(other), { message: 'unexpected listing failure' });
});

test('the text listing explains how to use a port and what to do when none are found', async () => {
  const listed = formatPortList(await listSerialPorts(fake([{ path: 'COM3', vendorId: '1a86', friendlyName: 'USB-SERIAL CH340 (COM3)' }])));
  assert.match(listed, /Serial ports found: 1/);
  assert.match(listed, /serial:COM3  — USB-SERIAL CH340 \(COM3\); CH340\/CH341 USB-serial chip/);
  assert.match(listed, /OBD2MCP_CONNECTION/);
  const empty = formatPortList([]);
  assert.match(empty, /No serial ports found/);
  assert.match(empty, /tcp:<host>:<port>/);
});

test('--list-ports runs without starting the server', () => {
  const result = spawnSync(process.execPath, [entry, '--list-ports'], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Serial ports found: \d+|No serial ports found/);
  assert.doesNotMatch(result.stderr, /obd2-mcp ready/);
});

test('--list-ports rejects options for other modes', () => {
  const result = spawnSync(process.execPath, [entry, '--list-ports', '--demo'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--list-ports cannot be combined with --demo/);
});

test('list_serial_ports is a local read-only tool that works in mock mode', async () => {
  const server = buildServer(new Elm327(new MockTransport()), true);
  const client = new Client({ name: 'ports-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  try {
    const tool = (await client.listTools()).tools.find(t => t.name === 'list_serial_ports');
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.annotations.openWorldHint, false);
    const result = await client.callTool({ name: 'list_serial_ports', arguments: {} });
    assert.notEqual(result.isError, true, result.content[0].text);
    const body = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(body.ports));
    assert.equal(body.count, body.ports.length);
    assert.match(body.current_connection, /^mock:/);
    assert.equal(body.simulated, undefined, 'port listings come from the real computer, not the mock vehicle');
  } finally {
    await client.close();
    await server.close();
  }
});
