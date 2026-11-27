import type { Transport } from './vendor/transport';
import { isReadOnlyCommand } from './transport';

/** Native BLE implementation is injected so queueing can be tested offline. */
export interface BleLink {
  open(onData: (value: string) => void, onError: (error: Error) => void): Promise<void>;
  write(value: string): Promise<void>;
  close(): Promise<void>;
}

export class BleTransport implements Transport {
  private failed: Error | null = null;
  private started = false;
  private opened = false;
  private buffer = '';
  private queue: Promise<unknown> = Promise.resolve();
  private openingReject: ((error: Error) => void) | null = null;
  private waiter: { resolve(value: string): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>; response: string | null; writeDone: boolean } | null = null;
  private closing: Promise<void> | null = null;

  constructor(private readonly link: BleLink, private readonly connectTimeoutMs = 20000) {}
  describe() { return 'bluetooth-le'; }

  open(): Promise<void> {
    if (this.started || this.failed) return Promise.reject(new Error('Connection cannot be reopened; start again.'));
    this.started = true;
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => this.fail(new Error('Bluetooth connection timed out.')), this.connectTimeoutMs);
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.openingReject = null;
        if (error) reject(error); else { this.opened = true; resolve(); }
      };
      this.openingReject = error => finish(error);
      const receive = (value: string) => {
        if (this.failed) return;
        this.buffer += value;
        if (this.buffer.length > 8192) return this.fail(new Error('Adapter response too long.'));
        const end = this.buffer.indexOf('>');
        if (end >= 0 && this.waiter && this.waiter.response === null) {
          this.waiter.response = this.buffer.slice(0, end);
          this.buffer = this.buffer.slice(end + 1);
          this.finishWaiter();
        }
      };
      Promise.resolve().then(() => {
        if (this.failed) throw this.failed;
        return this.link.open(receive, error => this.fail(error));
      })
        .then(() => { if (this.failed) void this.closeLink(); else finish(); })
        .catch(error => this.fail(error instanceof Error ? error : new Error('Bluetooth connection failed.')));
    });
  }

  private closeLink(): Promise<void> {
    if (!this.closing) {
      const operation = Promise.resolve().then(() => this.link.close()).catch(() => undefined);
      this.closing = new Promise(resolve => {
        const timer = setTimeout(resolve, 2000);
        void operation.then(() => { clearTimeout(timer); resolve(); });
      });
    }
    return this.closing;
  }

  private finishWaiter() {
    const waiter = this.waiter;
    if (!waiter || waiter.response === null || !waiter.writeDone) return;
    this.waiter = null;
    clearTimeout(waiter.timer);
    waiter.resolve(waiter.response);
  }

  private fail(error: Error) {
    if (!this.failed) this.failed = error;
    this.openingReject?.(this.failed);
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      clearTimeout(waiter.timer);
      waiter.reject(this.failed);
    }
    void this.closeLink();
  }

  sendRaw(command: string, timeoutMs = 8000): Promise<string> {
    if (!isReadOnlyCommand(command)) return Promise.reject(new Error('Command not allowed.'));
    const run = () => new Promise<string>((resolve, reject) => {
      if (this.failed || !this.opened) return reject(this.failed ?? new Error('Not connected.'));
      this.buffer = '';
      const timer = setTimeout(() => this.fail(new Error('Adapter response timed out.')), timeoutMs);
      const waiter = { resolve, reject, timer, response: null as string | null, writeDone: false };
      this.waiter = waiter;
      Promise.resolve().then(() => this.link.write(command + '\r'))
        .then(() => { if (this.waiter === waiter) { waiter.writeDone = true; this.finishWaiter(); } })
        .catch(error => this.fail(error instanceof Error ? error : new Error('Bluetooth write failed.')));
    });
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async close() {
    this.fail(new Error('Connection closed.'));
    await this.closeLink();
  }
}
