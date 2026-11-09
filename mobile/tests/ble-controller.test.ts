import assert from 'node:assert/strict';
import test from 'node:test';
import type { BleError, BleManager, Characteristic, Device } from 'react-native-ble-plx';
import { NativeBleScanner } from '../src/core/bleController';
import { BleSetupError, type NearbyDevice } from '../src/core/bleDiscovery';
import { PhoneSession } from '../src/core/session';
import { DemoTransport } from '../src/core/transport';

class FakeManager {
  private scan: ((error: BleError | null, device: Device | null) => void) | null = null;
  private notify: ((error: BleError | null, characteristic: Characteristic | null) => void) | null = null;
  private readonly demo = new DemoTransport();
  commands: string[] = [];
  scanStopped = false;
  disconnected = false;
  unsupported = false;
  failStop = false;
  notificationRemoved = false;
  lastScanFilter: string[] | null | undefined;

  async state() { return 'PoweredOn'; }
  async startDeviceScan(filter: string[] | null, _options: unknown, callback: typeof this.scan) {
    this.lastScanFilter = filter; this.scan = callback;
  }
  async stopDeviceScan() { if (this.failStop) throw new Error('Could not stop scan'); this.scanStopped = true; }
  emitDevice(id: string, name: string) { this.scan?.(null, { id, name, localName: null } as unknown as Device); }
  async connectToDevice() { return {}; }
  onDeviceDisconnected() { return { remove() {} }; }
  async discoverAllServicesAndCharacteristicsForDevice() { return {}; }
  async servicesForDevice() { return [{ uuid: 'fff0' }, { uuid: '180d' }]; }
  async characteristicsForDevice() {
    return [
      { uuid: 'fff1', isNotifiable: true, isIndicatable: false, isWritableWithResponse: false, isWritableWithoutResponse: false },
      ...(this.unsupported ? [] : [{ uuid: 'fff2', isNotifiable: false, isIndicatable: false, isWritableWithResponse: true, isWritableWithoutResponse: false }]),
    ];
  }
  monitorCharacteristicForDevice(_id: string, _service: string, _characteristic: string, callback: typeof this.notify) {
    this.notify = callback;
    return { remove: () => { this.notificationRemoved = true; } };
  }
  async writeCharacteristicWithResponseForDevice(_id: string, _service: string, _characteristic: string, encoded: string) {
    const value = Buffer.from(encoded, 'base64').toString('ascii');
    this.commands.push(value);
    const response = await this.demo.sendRaw(value.trim());
    const encodedResponse = Buffer.from(response + '\r>').toString('base64');
    this.notify?.(null, { value: encodedResponse } as unknown as Characteristic);
  }
  async cancelDeviceConnection() { this.disconnected = true; return {}; }
}

test('BLE discovery and a selected device use a supported profile and close cleanly', async () => {
  const manager = new FakeManager();
  const scanner = new NativeBleScanner(() => manager as unknown as BleManager, async () => {});
  const devices: NearbyDevice[] = [];
  await scanner.start(device => devices.push(device), () => assert.fail('Unexpected scan error'));
  assert.equal(manager.lastScanFilter, null);
  manager.emitDevice('device-one', 'OBDII');
  assert.deepEqual(devices, [{ id: 'device-one', name: 'OBDII' }]);
  await scanner.stop();
  manager.emitDevice('device-two', 'Other');
  assert.equal(devices.length, 1);
  assert(manager.scanStopped);
  const session = new PhoneSession(scanner.makeTransport('device-one'), false);
  await session.connect();
  const result = await session.read();
  assert.deepEqual(result.stored, ['P0420']);
  assert.equal(result.rpm, 748);
  assert(!manager.commands.includes('04\r'));
  assert(!manager.commands.includes('0902\r'));
  await session.close();
  await scanner.close();
  assert(manager.disconnected);
  assert(manager.notificationRemoved);
});

test('an unknown BLE profile is disconnected without sending commands', async () => {
  const manager = new FakeManager();
  manager.unsupported = true;
  const scanner = new NativeBleScanner(() => manager as unknown as BleManager, async () => {});
  await scanner.start(() => {}, () => {});
  manager.emitDevice('unknown-device', 'OBD');
  await scanner.stop();
  const session = new PhoneSession(scanner.makeTransport('unknown-device'), false);
  await assert.rejects(session.connect(), /Unsupported Bluetooth adapter profile/);
  assert.deepEqual(manager.commands, []);
  assert(manager.disconnected);
  await scanner.close();
});

test('only a discovered device can be connected after scanning has stopped', async () => {
  const manager = new FakeManager();
  const scanner = new NativeBleScanner(() => manager as unknown as BleManager, async () => {});
  await scanner.start(() => {}, () => {});
  manager.emitDevice('seen', 'OBDII');
  assert.throws(() => scanner.makeTransport('seen'), /stopping the scan/);
  await scanner.stop();
  assert.throws(() => scanner.makeTransport('unseen'), /discovered/);
  await scanner.close();
});

test('a failed scan stop prevents connecting until the scan is stopped', async () => {
  const manager = new FakeManager();
  const scanner = new NativeBleScanner(() => manager as unknown as BleManager, async () => {});
  await scanner.start(() => {}, () => {});
  manager.emitDevice('seen', 'OBDII');
  manager.failStop = true;
  await assert.rejects(scanner.stop(), /Could not stop scan/);
  assert.throws(() => scanner.makeTransport('seen'), /stopping the scan/);
  manager.failStop = false;
  await scanner.stop();
  assert.doesNotThrow(() => scanner.makeTransport('seen'));
  await scanner.close();
});

test('denied Bluetooth permission never starts a scan', async () => {
  let managerCreated = false;
  const scanner = new NativeBleScanner(() => { managerCreated = true; return new FakeManager() as unknown as BleManager; },
    async () => { throw new BleSetupError('permission'); });
  await assert.rejects(scanner.start(() => {}, () => {}), /permission/);
  assert.equal(managerCreated, false);
  await scanner.close();
});

test('cancelling while permission is pending never starts a scan later', async () => {
  let grantPermission: (() => void) | null = null;
  let managerCreated = false;
  const scanner = new NativeBleScanner(() => { managerCreated = true; return new FakeManager() as unknown as BleManager; },
    () => new Promise<void>(resolve => { grantPermission = resolve; }));
  const starting = scanner.start(() => {}, () => {});
  await scanner.close();
  (grantPermission as (() => void) | null)?.();
  await assert.rejects(starting, /scan/);
  assert.equal(managerCreated, false);
});
