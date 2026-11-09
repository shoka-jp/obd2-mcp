// Browser preview intentionally cannot reach a real adapter.
export function makeWifiTransport(_host: string, _port: number): never {
  throw new Error('Real adapter connections require the native mobile app.');
}
