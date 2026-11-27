import { PermissionsAndroid, Platform } from 'react-native';
import type { BleManager } from 'react-native-ble-plx';
import { NativeBleScanner } from './bleController';
import { BleSetupError, type BleScanner } from './bleDiscovery';

let sharedManager: BleManager | null = null;
function getManager(): BleManager {
  if (!sharedManager) {
    // Load native code only when the user chooses BLE, so the sample remains usable.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BleManager: Manager } = require('react-native-ble-plx') as typeof import('react-native-ble-plx');
    sharedManager = new Manager();
  }
  return sharedManager;
}

async function requestNearbyPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (Number(Platform.Version) >= 31) {
    const permissions = [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT];
    const result = await PermissionsAndroid.requestMultiple(permissions);
    if (permissions.some(permission => result[permission] !== PermissionsAndroid.RESULTS.GRANTED)) {
      throw new BleSetupError('permission');
    }
  } else {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    if (result !== PermissionsAndroid.RESULTS.GRANTED) throw new BleSetupError('permission');
  }
}

export function createBleScanner(): BleScanner { return new NativeBleScanner(getManager, requestNearbyPermission); }
