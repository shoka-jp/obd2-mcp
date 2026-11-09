import { Platform } from 'react-native';
import TcpSocket from 'react-native-tcp-socket';
import { WifiTransport, type SocketLike } from './transport';

export function makeWifiTransport(host: string, port: number): WifiTransport {
  return new WifiTransport(host, port,
    options => TcpSocket.createConnection(options, () => undefined) as unknown as SocketLike,
    Platform.OS === 'android');
}
