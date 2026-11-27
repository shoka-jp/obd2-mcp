/** BLE UART layouts used by selected ELM327-compatible adapters. */
const profiles = [
  { service: 'fff0', notify: 'fff1', write: 'fff2' },
  { service: 'ffe0', notify: 'ffe1', write: 'ffe1' },
  { service: '18f0', notify: '2af0', write: '2af1' },
  { service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', notify: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e' },
] as const;

export type BleCharacteristicInfo = {
  uuid: string;
  isNotifiable: boolean;
  isIndicatable: boolean;
  isWritableWithResponse: boolean;
  isWritableWithoutResponse: boolean;
};
export type BleServiceInfo = { uuid: string; characteristics: BleCharacteristicInfo[] };
export type BleProfile = { service: string; notify: string; write: string; withResponse: boolean };

function canonical(uuid: string): string {
  const value = uuid.toLowerCase();
  return /^[0-9a-f]{4}$/.test(value) ? `0000${value}-0000-1000-8000-00805f9b34fb` : value;
}

export function isKnownBleService(uuid: string): boolean {
  return profiles.some(profile => canonical(profile.service) === canonical(uuid));
}

/** Never fall back to an arbitrary writable Bluetooth characteristic. */
export function selectBleProfile(services: BleServiceInfo[]): BleProfile | null {
  for (const profile of profiles) {
    const service = services.find(item => canonical(item.uuid) === canonical(profile.service));
    if (!service) continue;
    const notify = service.characteristics.find(item => canonical(item.uuid) === canonical(profile.notify));
    const write = service.characteristics.find(item => canonical(item.uuid) === canonical(profile.write));
    if (!notify || !(notify.isNotifiable || notify.isIndicatable) || !write ||
      !(write.isWritableWithResponse || write.isWritableWithoutResponse)) continue;
    return { service: service.uuid, notify: notify.uuid, write: write.uuid, withResponse: write.isWritableWithResponse };
  }
  return null;
}
