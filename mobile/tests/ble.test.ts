import assert from 'node:assert/strict';
import test from 'node:test';
import { sortNearby } from '../src/core/bleDiscovery';
import { isKnownBleService, selectBleProfile, type BleCharacteristicInfo } from '../src/core/bleProfiles';
import { BleTransport, type BleLink } from '../src/core/bleTransport';
import { PhoneSession } from '../src/core/session';
import { DemoTransport } from '../src/core/transport';

function characteristic(uuid: string, options: Partial<BleCharacteristicInfo> = {}): BleCharacteristicInfo {
  return { uuid, isNotifiable: false, isIndicatable: false,
    isWritableWithResponse: false, isWritableWithoutResponse: false, ...options };
}

test('only known BLE UART profiles with usable notify and write characteristics are selected', () => {
  assert(isKnownBleService('0000FFF0-0000-1000-8000-00805F9B34FB'));
  assert(!isKnownBleService('180d'));
  const service = { uuid: '0000FFF0-0000-1000-8000-00805F9B34FB', characteristics: [
    characteristic('fff1', { isNotifiable: true }),
    characteristic('fff2', { isWritableWithResponse: true, isWritableWithoutResponse: true }),
  ] };
  assert.deepEqual(selectBleProfile([service]), {
    service: service.uuid, notify: 'fff1', write: 'fff2', withResponse: true,
  });
  assert.deepEqual(selectBleProfile([{ uuid: 'ffe0', characteristics: [
    characteristic('ffe1', { isNotifiable: true, isWritableWithoutResponse: true }),
  ] }]), { service: 'ffe0', notify: 'ffe1', write: 'ffe1', withResponse: false });
  assert.deepEqual(selectBleProfile([{ uuid: '18f0', characteristics: [
    characteristic('2af0', { isNotifiable: true }), characteristic('2af1', { isWritableWithoutResponse: true }),
  ] }]), { service: '18f0', notify: '2af0', write: '2af1', withResponse: false });
  const nordic = '6e40000';
  const nordicTail = '-b5a3-f393-e0a9-e50e24dcca9e';
  assert.deepEqual(selectBleProfile([{ uuid: `${nordic}1${nordicTail}`, characteristics: [
    characteristic(`${nordic}3${nordicTail}`, { isNotifiable: true }),
    characteristic(`${nordic}2${nordicTail}`, { isWritableWithResponse: true }),
  ] }]), { service: `${nordic}1${nordicTail}`, notify: `${nordic}3${nordicTail}`, write: `${nordic}2${nordicTail}`, withResponse: true });
  assert.equal(selectBleProfile([{ uuid: '180d', characteristics: service.characteristics }]), null);
  assert.equal(selectBleProfile([{ uuid: 'fff0', characteristics: [
    characteristic('fff1', { isNotifiable: true }), characteristic('fff2'),
  ] }]), null);
  assert.equal(selectBleProfile([{ uuid: 'fff0', characteristics: [
    characteristic('fff1'), characteristic('fff2', { isWritableWithResponse: true }),
  ] }]), null);
});

test('nearby devices with diagnostic names are listed first without hiding other names', () => {
  const devices = [{ id: 'a', name: 'Headphones' }, { id: 'b', name: 'OBDII' }, { id: 'c', name: '' }];
  const sorted = sortNearby(devices);
  assert.equal(sorted[0].id, 'b');
  assert.deepEqual(new Set(sorted.map(item => item.id)), new Set(['a', 'b', 'c']));
  assert.equal(devices[0].id, 'a');
});

class FakeBleLink implements BleLink {
  private receive: (value: string) => void = () => undefined;
  private error: (error: Error) => void = () => undefined;
  commands: string[] = [];
  closed = false;
  respond = true;
  private readonly demo = new DemoTransport();

  async open(onData: (value: string) => void, onError: (error: Error) => void) {
    this.receive = onData;
    this.error = onError;
  }
  async write(value: string) {
    this.commands.push(value);
    if (!this.respond) return;
    const reply = await this.demo.sendRaw(value.trim());
    const framed = reply + '\r>';
    setTimeout(() => { if (!this.closed) this.receive(framed.slice(0, 3)); }, 1);
    setTimeout(() => { if (!this.closed) this.receive(framed.slice(3)); }, 2);
  }
  async close() { this.closed = true; }
  disconnect() { this.error(new Error('Device disconnected.')); }
  lateReply(value: string) { this.receive(value); }
}

test('BLE session reassembles notifications and stays read-only', async () => {
  const link = new FakeBleLink();
  const transport = new BleTransport(link);
  const session = new PhoneSession(transport, false);
  await session.connect();
  const result = await session.read();
  assert.equal(result.milOn, true);
  assert.deepEqual(result.stored, ['P0420']);
  assert.equal(result.rpm, 748);
  assert.equal(result.incomplete, false);
  assert(!link.commands.includes('04\r'));
  assert(!link.commands.includes('0902\r'));
  await assert.rejects(transport.sendRaw('04'));
  await assert.rejects(transport.sendRaw('0902'));
  await session.close();
  assert(link.closed);
});

test('BLE requests are serialized and a timeout prevents stale responses from being reused', async () => {
  const link = new FakeBleLink();
  const transport = new BleTransport(link);
  await transport.open();
  const [status, codes] = await Promise.all([transport.sendRaw('0101'), transport.sendRaw('03')]);
  assert(status.includes('41 01'));
  assert(codes.includes('43 01'));
  assert.deepEqual(link.commands, ['0101\r', '03\r']);
  link.respond = false;
  await assert.rejects(transport.sendRaw('010C', 15), /timed out/);
  link.lateReply('41 0C 00 00\r>');
  await assert.rejects(transport.sendRaw('0105', 15));
  assert.deepEqual(link.commands, ['0101\r', '03\r', '010C\r']);
  assert(link.closed);
});

test('a BLE response arriving before its write completes does not start the next command', async () => {
  let receive: (value: string) => void = () => undefined;
  let finishWrite: (() => void) | null = null;
  const writes: string[] = [];
  const link: BleLink = {
    open: async onData => { receive = onData; },
    write: value => {
      writes.push(value);
      receive(value === '0101\r' ? '41 01 00 00 00 00\r>' : '47 00\r>');
      return value === '0101\r' ? new Promise<void>(resolve => { finishWrite = resolve; }) : Promise.resolve();
    },
    close: async () => {},
  };
  const transport = new BleTransport(link);
  await transport.open();
  const first = transport.sendRaw('0101');
  const second = transport.sendRaw('07');
  await new Promise(resolve => setTimeout(resolve, 1));
  assert.deepEqual(writes, ['0101\r']);
  (finishWrite as (() => void) | null)?.();
  assert((await first).includes('41 01'));
  assert((await second).includes('47 00'));
  assert.deepEqual(writes, ['0101\r', '07\r']);
  await transport.close();
});

test('a BLE write that stalls after the response still times out', async () => {
  let receive: (value: string) => void = () => undefined;
  let closed = false;
  const transport = new BleTransport({
    open: async onData => { receive = onData; },
    write: () => { receive('41 01 00 00 00 00\r>'); return new Promise<void>(() => {}); },
    close: async () => { closed = true; },
  });
  await transport.open();
  await assert.rejects(transport.sendRaw('0101', 15), /timed out/);
  assert(closed);
});

test('disconnect and cancellation reject pending BLE operations', async () => {
  const link = new FakeBleLink();
  const transport = new BleTransport(link);
  await transport.open();
  link.respond = false;
  const waiting = transport.sendRaw('0101');
  await new Promise(resolve => setTimeout(resolve, 1));
  link.disconnect();
  await assert.rejects(waiting, /disconnected/i);
  assert(link.closed);

  let finishConnect: (() => void) | null = null;
  const pendingLink: BleLink = {
    open: () => new Promise<void>(resolve => { finishConnect = resolve; }),
    write: async () => {}, close: async () => {},
  };
  const pendingTransport = new BleTransport(pendingLink);
  const opening = pendingTransport.open();
  await new Promise(resolve => setTimeout(resolve, 1));
  await pendingTransport.close();
  await assert.rejects(opening, /closed/i);
  (finishConnect as (() => void) | null)?.();
});
