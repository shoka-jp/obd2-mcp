import type { Transport } from './vendor/transport';

// These are the complete set of commands the phone app may send. In
// particular, Mode 04 (clear codes) and Mode 09 (VIN) are not available.
const READ_ONLY_COMMANDS: ReadonlySet<string> = new Set([
  'ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0', 'ATI',
  '0101', '03', '07', '010C', '0105', '020200', '020C00', '020500',
]);

export class RestrictedTransport implements Transport {
  private closed = false;
  constructor(private readonly inner: Transport) {}
  open() { return this.closed ? Promise.reject(new Error('Connection closed.')) : this.inner.open(); }
  close() { this.closed = true; return this.inner.close(); }
  describe() { return this.inner.describe(); }
  sendRaw(command: string, timeoutMs?: number) {
    if (this.closed || !READ_ONLY_COMMANDS.has(command)) {
      return Promise.reject(new Error('This app only supports its read-only command set.'));
    }
    return this.inner.sendRaw(command, timeoutMs);
  }
}

/** Fictional responses, deliberately separate from the real connection. */
export class DemoTransport implements Transport {
  describe() { return 'simulated'; }
  async open() {}
  async close() {}
  async sendRaw(command: string): Promise<string> {
    const replies: Record<string, string> = {
      ATZ: 'ELM327 simulated', ATI: 'ELM327 simulated',
      ATE0: 'OK', ATL0: 'OK', ATS0: 'OK', ATH0: 'OK', ATSP0: 'OK',
      '0101': '41 01 81 07 E5 04', '03': '43 01 04 20', '07': '47 00',
      '010C': '41 0C 0B B0', '0105': '41 05 81',
      '020200': '42 02 00 04 20', '020C00': '42 0C 00 22 88',
      '020500': '42 05 00 80',
    };
    return replies[command] ?? 'NO DATA';
  }
}

export function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/.test(part))) return false;
  const [a, b, c, d] = parts.map(Number);
  if ([a, b, c, d].some(part => part > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 169 && b === 254);
}

export interface SocketLike {
  on(event: 'connect' | 'close', listener: () => void): unknown;
  on(event: 'error', listener: (error: unknown) => void): unknown;
  on(event: 'data', listener: (chunk: unknown) => void): unknown;
  write(data: string): unknown;
  destroy(): unknown;
}
export type SocketFactory = (options: {
  host: string; port: number; connectTimeout: number; interface?: 'wifi';
}) => SocketLike;

/** Prompt-delimited TCP stream with one outstanding command at a time. */
export class WifiTransport implements Transport {
  private socket: SocketLike | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private buffer = '';
  private failed: Error | null = null;
  private waiter: { resolve(value: string): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> } | null = null;
  private rejectOpening: ((error: Error) => void) | null = null;

  constructor(private readonly host: string, private readonly port: number,
    private readonly createSocket: SocketFactory, private readonly android: boolean) {}

  describe() { return 'wifi'; }

  open(): Promise<void> {
    if (!isPrivateIPv4(this.host) || !Number.isInteger(this.port) || this.port < 1 || this.port > 65535) {
      return Promise.reject(new Error('Invalid adapter address or port.'));
    }
    if (this.socket || this.failed) return Promise.reject(new Error('Connection cannot be reopened; start again.'));
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => this.fail(new Error('Connection timed out.')), 12000);
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.rejectOpening = null;
        if (error) reject(error); else resolve();
      };
      this.rejectOpening = error => finish(error);
      try {
        const socket = this.createSocket({ host: this.host, port: this.port, connectTimeout: 10000,
          ...(this.android ? { interface: 'wifi' as const } : {}) });
        this.socket = socket;
        socket.on('connect', () => finish());
        socket.on('data', (chunk: unknown) => {
          if (chunk == null || typeof (chunk as { toString?: unknown }).toString !== 'function') {
            return this.fail(new Error('Invalid adapter response.'));
          }
          this.buffer += typeof chunk === 'string' ? chunk : (chunk as { toString(encoding?: string): string }).toString('ascii');
          if (this.buffer.length > 8192) return this.fail(new Error('Adapter response too long.'));
          const end = this.buffer.indexOf('>');
          if (end >= 0 && this.waiter) {
            const waiter = this.waiter;
            this.waiter = null;
            clearTimeout(waiter.timer);
            const response = this.buffer.slice(0, end);
            this.buffer = this.buffer.slice(end + 1);
            waiter.resolve(response);
          }
        });
        socket.on('error', (error: unknown) => this.fail(error instanceof Error ? error : new Error('Connection error.')));
        socket.on('close', () => this.fail(new Error('Connection closed.')));
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error('Connection error.'));
      }
    });
  }

  private fail(error: Error) {
    if (!this.failed) this.failed = error;
    this.rejectOpening?.(this.failed);
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      clearTimeout(waiter.timer);
      waiter.reject(this.failed);
    }
    const socket = this.socket;
    this.socket = null;
    socket?.destroy();
  }

  sendRaw(command: string, timeoutMs = 8000): Promise<string> {
    if (!READ_ONLY_COMMANDS.has(command)) return Promise.reject(new Error('Command not allowed.'));
    const run = () => new Promise<string>((resolve, reject) => {
      if (this.failed || !this.socket) return reject(this.failed ?? new Error('Not connected.'));
      this.buffer = '';
      const timer = setTimeout(() => this.fail(new Error('Adapter response timed out.')), timeoutMs);
      this.waiter = { resolve, reject, timer };
      try { this.socket.write(command + '\r'); }
      catch (error) { this.fail(error instanceof Error ? error : new Error('Write failed.')); }
    });
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async close() {
    this.fail(new Error('Connection closed.'));
    this.socket = null;
  }
}
