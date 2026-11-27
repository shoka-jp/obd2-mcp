import { fromByteArray, toByteArray } from 'base64-js';
import type { BleManager, Subscription } from 'react-native-ble-plx';
import { BleSetupError, type BleScanner, type NearbyDevice } from './bleDiscovery';
import { isKnownBleService, selectBleProfile, type BleProfile, type BleServiceInfo } from './bleProfiles';
import { BleTransport, type BleLink } from './bleTransport';

let scanQueue: Promise<void> = Promise.resolve();
function queueScan(action: () => Promise<void>): Promise<void> {
  const next = scanQueue.then(action, action);
  scanQueue = next.catch(() => undefined);
  return next;
}

function checkState(state: string): void {
  if (state === 'PoweredOn') return;
  if (state === 'PoweredOff') throw new BleSetupError('poweredOff');
  if (state === 'Unauthorized') throw new BleSetupError('permission');
  if (state === 'Unsupported') throw new BleSetupError('unsupported');
  throw new BleSetupError('scan');
}

async function waitForPoweredOn(manager: BleManager): Promise<void> {
  const current = await manager.state();
  if (current !== 'Unknown' && current !== 'Resetting') return checkState(current);
  return new Promise((resolve, reject) => {
    let subscription: Subscription | null = null;
    const timer = setTimeout(() => { subscription?.remove(); reject(new BleSetupError('scan')); }, 10000);
    subscription = manager.onStateChange(state => {
      if (state === 'Unknown' || state === 'Resetting') return;
      clearTimeout(timer);
      subscription?.remove();
      try { checkState(state); resolve(); } catch (error) { reject(error); }
    }, true);
  });
}

class NativeBleLink implements BleLink {
  private closed = false;
  private attempted = false;
  private disconnectSubscription: Subscription | null = null;
  private notificationSubscription: Subscription | null = null;
  private profile: BleProfile | null = null;

  constructor(private readonly manager: BleManager, private readonly deviceId: string) {}

  async open(onData: (value: string) => void, onError: (error: Error) => void): Promise<void> {
    if (this.closed) throw new Error('Bluetooth connection closed.');
    this.attempted = true;
    await this.manager.connectToDevice(this.deviceId, { timeout: 15000 });
    if (this.closed) { await this.manager.cancelDeviceConnection(this.deviceId).catch(() => undefined); throw new Error('Connection closed.'); }
    this.disconnectSubscription = this.manager.onDeviceDisconnected(this.deviceId, () => {
      if (!this.closed) onError(new Error('Bluetooth device disconnected.'));
    });
    await this.manager.discoverAllServicesAndCharacteristicsForDevice(this.deviceId);
    if (this.closed) throw new Error('Connection closed.');
    const services = await this.manager.servicesForDevice(this.deviceId);
    const choices: BleServiceInfo[] = [];
    for (const service of services.filter(item => isKnownBleService(item.uuid))) {
      const characteristics = await this.manager.characteristicsForDevice(this.deviceId, service.uuid);
      choices.push({ uuid: service.uuid, characteristics });
    }
    if (this.closed) throw new Error('Connection closed.');
    this.profile = selectBleProfile(choices);
    if (!this.profile) throw new Error('Unsupported Bluetooth adapter profile.');
    this.notificationSubscription = this.manager.monitorCharacteristicForDevice(
      this.deviceId, this.profile.service, this.profile.notify, (error, characteristic) => {
        if (this.closed) return;
        if (error) { onError(new Error('Bluetooth notifications failed.')); return; }
        if (!characteristic?.value) return;
        try { onData(Array.from(toByteArray(characteristic.value), value => String.fromCharCode(value)).join('')); }
        catch { onError(new Error('Invalid Bluetooth response.')); }
      });
    // Native subscription registration is asynchronous. A missed reply still
    // times out and closes the connection rather than being treated as data.
    await new Promise(resolve => setTimeout(resolve, 250));
    if (this.closed) throw new Error('Connection closed.');
  }

  async write(value: string): Promise<void> {
    if (this.closed || !this.profile) throw new Error('Bluetooth connection is not ready.');
    const bytes = Uint8Array.from(value, character => character.charCodeAt(0));
    const data = fromByteArray(bytes);
    const args = [this.deviceId, this.profile.service, this.profile.write, data] as const;
    if (this.profile.withResponse) await this.manager.writeCharacteristicWithResponseForDevice(...args);
    else await this.manager.writeCharacteristicWithoutResponseForDevice(...args);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.notificationSubscription?.remove();
    this.disconnectSubscription?.remove();
    if (this.attempted) await this.manager.cancelDeviceConnection(this.deviceId).catch(() => undefined);
  }
}
export class NativeBleScanner implements BleScanner {
  private closed = false;
  private active = false;
  private needsStop = false;
  private manager: BleManager | null = null;
  private stopping: Promise<void> | null = null;
  private readonly seen = new Set<string>();

  constructor(private readonly getManager: () => BleManager, private readonly requestPermission: () => Promise<void>) {}

  async start(onDevice: (device: NearbyDevice) => void, onError: (error: BleSetupError) => void): Promise<void> {
    if (this.closed || this.active) throw new BleSetupError('scan');
    await this.requestPermission();
    if (this.closed) throw new BleSetupError('scan');
    const manager = this.getManager();
    this.manager = manager;
    await waitForPoweredOn(manager);
    if (this.closed) throw new BleSetupError('scan');
    this.active = true;
    this.needsStop = true;
    await queueScan(async () => {
      if (!this.active || this.closed) return;
      // No service filter: many BLE adapters do not advertise their service.
      await manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (!this.active || this.closed) return;
        if (error) { onError(new BleSetupError('scan')); return; }
        if (!device?.id) return;
        const name = (device.name || device.localName || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
        this.seen.add(device.id);
        onDevice({ id: device.id, name });
      });
    });
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    if (!this.needsStop || !this.manager) return;
    this.active = false;
    const manager = this.manager;
    const stopping = queueScan(() => manager.stopDeviceScan()).then(() => { this.needsStop = false; });
    this.stopping = stopping;
    try { await stopping; } finally { if (this.stopping === stopping) this.stopping = null; }
  }

  async close(): Promise<void> { this.closed = true; await this.stop(); }

  makeTransport(deviceId: string): BleTransport {
    if (this.closed || this.active || this.needsStop || this.stopping || !this.manager || !this.seen.has(deviceId)) {
      throw new Error('Select a discovered Bluetooth device after stopping the scan.');
    }
    return new BleTransport(new NativeBleLink(this.manager, deviceId));
  }
}
