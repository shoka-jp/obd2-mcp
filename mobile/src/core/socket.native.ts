import { Platform } from 'react-native';
import { WifiTransport, type SocketLike } from './transport';

export function makeWifiTransport(host: string, port: number): WifiTransport {
  // Keep the sample usable if this optional native module is unavailable.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TcpSocket = (require('react-native-tcp-socket') as typeof import('react-native-tcp-socket')).default;
  return new WifiTransport(host, port,
    options => TcpSocket.createConnection(options, () => undefined) as unknown as SocketLike,
    Platform.OS === 'android');
}
