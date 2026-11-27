import type { Transport } from './vendor/transport';

export type NearbyDevice = { id: string; name: string };
export type BleProblem = 'permission' | 'poweredOff' | 'unsupported' | 'scan';

export class BleSetupError extends Error {
  constructor(public readonly reason: BleProblem) { super(`Bluetooth setup: ${reason}`); }
}

export interface BleScanner {
  start(onDevice: (device: NearbyDevice) => void, onError: (error: BleSetupError) => void): Promise<void>;
  stop(): Promise<void>;
  close(): Promise<void>;
  makeTransport(deviceId: string): Transport;
}

/** Show likely names first without assuming an advertised name proves identity. */
export function sortNearby(devices: NearbyDevice[]): NearbyDevice[] {
  const hint = (name: string) => /obd|elm|vlink|icar|veepeak|carista|viecar|konnwei/i.test(name);
  return [...devices].sort((a, b) => Number(hint(b.name)) - Number(hint(a.name)) ||
    Number(Boolean(b.name)) - Number(Boolean(a.name)) || a.name.localeCompare(b.name));
}
