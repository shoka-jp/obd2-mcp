import type { BleScanner } from './bleDiscovery';

export function createBleScanner(): BleScanner {
  throw new Error('Bluetooth connections require the native mobile app.');
}
