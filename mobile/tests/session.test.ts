import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PhoneSession } from '../src/core/session';
import { DemoTransport, isPrivateIPv4, RestrictedTransport, WifiTransport, type SocketLike } from '../src/core/transport';
import type { Transport } from '../src/core/vendor/transport';

test('the phone and server share exactly the same ELM and DTC parsers', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const name of ['elm327.ts', 'dtc.ts']) {
    assert.equal(await readFile(resolve(here, '../../src', name), 'utf8'),
      await readFile(resolve(here, '../src/core/vendor', name), 'utf8'));
  }
});

test('sample read shows fictional recorded and current values and never requests VIN or clears codes', async () => {
  const mock = new DemoTransport();
  const commands: string[] = [];
  const traced: Transport = {
    open: () => mock.open(), close: () => mock.close(), describe: () => mock.describe(),
    sendRaw: command => { commands.push(command); return mock.sendRaw(command); },
  };
  const session = new PhoneSession(traced, true);
  await session.connect();
  const result = await session.read();
  assert.equal(result.simulated, true);
  assert.equal(result.milOn, true);
  assert.deepEqual(result.stored, ['P0420']);
  assert.deepEqual(result.pending, []);
  assert.equal(result.rpm, 748);
  assert.equal(result.coolant, 89);
  assert.equal(result.freezeCode, 'P0420');
  assert.equal(result.freezeRpm, 2210);
  assert.equal(result.freezeCoolant, 88);
  assert.equal(result.incomplete, false);
  assert(!commands.includes('04'));
  assert(!commands.includes('0902'));
  await session.close();
});

test('unavailable or contradictory code responses never become a clean result', async () => {
  const mock = new DemoTransport();
  const transport: Transport = {
    open: () => mock.open(), close: () => mock.close(), describe: () => mock.describe(),
    sendRaw: command => command === '03' || command === '07' ? Promise.resolve('NO DATA') : mock.sendRaw(command),
  };
  const session = new PhoneSession(transport, false);
  await session.connect();
  const result = await session.read();
  assert.equal(result.reportedCount, 1);
  assert.equal(result.stored, null);
  assert.equal(result.pending, null);
  assert.equal(result.incomplete, true);
  assert.equal(result.simulated, false);
  await session.close();
});

test('a bare positive code response is unknown rather than an empty list', async () => {
  const mock = new DemoTransport();
  const transport: Transport = {
    open: () => mock.open(), close: () => mock.close(), describe: () => mock.describe(),
    sendRaw: command => command === '03' ? Promise.resolve('43') : mock.sendRaw(command),
  };
  const session = new PhoneSession(transport, false);
  await session.connect();
  const result = await session.read();
  assert.equal(result.stored, null);
  assert.equal(result.incomplete, true);
  await session.close();
});

test('the transport blocks clearing, VIN and arbitrary commands even when directly invoked', async () => {
  const commands: string[] = [];
  const restricted = new RestrictedTransport({
    open: async () => {}, close: async () => {}, describe: () => 'test',
    sendRaw: async command => { commands.push(command); return 'OK'; },
  });
  await restricted.open();
  for (const command of ['04', '0902', 'ATSH7E0', '03\r04', 'ATI ']) {
    await assert.rejects(restricted.sendRaw(command));
  }
  assert.deepEqual(commands, []);
  await restricted.close();
  await assert.rejects(restricted.sendRaw('03'));
});

class FakeSocket extends EventEmitter {
  writes: string[] = [];
  destroyed = false;
  respond = true;
  write(data: string) {
    this.writes.push(data);
    if (this.respond) setTimeout(() => {
      const response = data === '0101\r' ? '41 01 81 07 E5 04\r>' : '43 01 04 20\r>';
      this.emit('data', response.slice(0, 4));
      setTimeout(() => this.emit('data', response.slice(4)), 1);
    }, 1);
    return true;
  }
  destroy() { if (!this.destroyed) { this.destroyed = true; this.emit('close'); } }
}

test('Wi-Fi transport serializes requests and reassembles fragmented replies', async () => {
  const socket = new FakeSocket();
  let receivedOptions: { interface?: string } | undefined;
  const transport = new WifiTransport('192.168.0.10', 35000, options => {
    receivedOptions = options;
    setTimeout(() => socket.emit('connect'), 1);
    return socket as unknown as SocketLike;
  }, true);
  await transport.open();
  const [status, codes] = await Promise.all([transport.sendRaw('0101'), transport.sendRaw('03')]);
  assert.equal(status, '41 01 81 07 E5 04\r');
  assert.equal(codes, '43 01 04 20\r');
  assert.deepEqual(socket.writes, ['0101\r', '03\r']);
  assert.equal(receivedOptions?.interface, 'wifi');
  await assert.rejects(transport.sendRaw('04'));
  await transport.close();
});

test('after a timeout, late replies cannot be attributed to another command', async () => {
  const socket = new FakeSocket();
  socket.respond = false;
  const transport = new WifiTransport('192.168.0.10', 35000, () => {
    setTimeout(() => socket.emit('connect'), 1);
    return socket as unknown as SocketLike;
  }, false);
  await transport.open();
  await assert.rejects(transport.sendRaw('0101', 15), /timed out/);
  socket.emit('data', '41 01 00 00 00 00\r>');
  await assert.rejects(transport.sendRaw('03', 15));
  assert.deepEqual(socket.writes, ['0101\r']);
  await transport.close();
});

test('cancelling while connecting rejects the opening operation', async () => {
  const socket = new FakeSocket();
  const transport = new WifiTransport('192.168.0.10', 35000, () => socket as unknown as SocketLike, false);
  const opening = transport.open();
  await transport.close();
  await assert.rejects(opening, /closed/i);
  assert.equal(socket.destroyed, true);
});

test('only local adapter IPv4 addresses and valid ports are accepted', async () => {
  for (const host of ['192.168.0.10', '10.0.0.1', '172.16.4.1', '169.254.1.2']) assert(isPrivateIPv4(host));
  for (const host of ['8.8.8.8', '127.0.0.1', '172.32.0.1', '192.168.001.1', 'example.com', '10.0.0.999']) assert(!isPrivateIPv4(host));
  let called = false;
  const factory = () => { called = true; return new FakeSocket() as unknown as SocketLike; };
  await assert.rejects(new WifiTransport('8.8.8.8', 35000, factory, false).open());
  await assert.rejects(new WifiTransport('192.168.0.10', 0, factory, false).open());
  assert.equal(called, false);
});
