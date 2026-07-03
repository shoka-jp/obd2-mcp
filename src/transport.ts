import net from "node:net";

/** A byte pipe to an ELM327-style adapter. Commands end with \r; responses end with the '>' prompt. */
export interface Transport {
  open(): Promise<void>;
  /** Send one command and return everything up to (excluding) the next '>' prompt. */
  sendRaw(cmd: string, timeoutMs?: number): Promise<string>;
  close(): Promise<void>;
  describe(): string;
}

const DEFAULT_TIMEOUT = 8000;

abstract class StreamTransport implements Transport {
  protected buffer = "";
  private queue: Promise<unknown> = Promise.resolve();
  private waiter: { resolve: (s: string) => void; reject: (e: Error) => void; timer: NodeJS.Timeout } | null = null;

  abstract open(): Promise<void>;
  abstract close(): Promise<void>;
  abstract describe(): string;
  protected abstract write(data: string): void;

  protected onData(chunk: string): void {
    this.buffer += chunk;
    const idx = this.buffer.indexOf(">");
    if (idx !== -1 && this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      clearTimeout(w.timer);
      const out = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      w.resolve(out);
    }
  }

  protected fail(err: Error): void {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      clearTimeout(w.timer);
      w.reject(err);
    }
  }

  sendRaw(cmd: string, timeoutMs = DEFAULT_TIMEOUT): Promise<string> {
    const run = () =>
      new Promise<string>((resolve, reject) => {
        this.buffer = "";
        const timer = setTimeout(() => {
          this.waiter = null;
          reject(new Error(`Timeout waiting for adapter response to "${cmd}" (${timeoutMs} ms)`));
        }, timeoutMs);
        this.waiter = { resolve, reject, timer };
        this.write(cmd + "\r");
      });
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/** TCP transport for WiFi ELM327 adapters (commonly 192.168.0.10:35000). */
export class TcpTransport extends StreamTransport {
  private socket: net.Socket | null = null;
  constructor(private host: string, private port: number) {
    super();
  }
  describe(): string {
    return `tcp:${this.host}:${this.port}`;
  }
  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host: this.host, port: this.port });
      s.setEncoding("ascii");
      s.once("connect", () => resolve());
      s.once("error", err => {
        this.fail(err as Error);
        reject(err);
      });
      s.on("data", d => this.onData(String(d)));
      s.on("error", err => this.fail(err as Error));
      this.socket = s;
    });
  }
  protected write(data: string): void {
    this.socket?.write(data);
  }
  close(): Promise<void> {
    this.socket?.destroy();
    this.socket = null;
    return Promise.resolve();
  }
}

/** Serial transport for USB / Bluetooth-SPP ELM327 adapters. Loads `serialport` lazily. */
export class SerialTransport extends StreamTransport {
  private port: { write(d: string): void; close(cb: (e?: Error | null) => void): void } | null = null;
  constructor(private path: string, private baudRate: number) {
    super();
  }
  describe(): string {
    return `serial:${this.path}@${this.baudRate}`;
  }
  async open(): Promise<void> {
    let SerialPort: any;
    try {
      ({ SerialPort } = await import("serialport"));
    } catch {
      throw new Error(
        'The "serialport" package is not installed (it is an optional dependency). ' +
          "Reinstall with build tools available, or use a WiFi adapter via tcp:HOST:PORT, or mock mode."
      );
    }
    await new Promise<void>((resolve, reject) => {
      const p = new SerialPort({ path: this.path, baudRate: this.baudRate }, (err: Error | null) =>
        err ? reject(err) : resolve()
      );
      p.setEncoding("ascii");
      p.on("data", (d: unknown) => this.onData(String(d)));
      p.on("error", (err: Error) => this.fail(err));
      this.port = p;
    });
  }
  protected write(data: string): void {
    this.port?.write(data);
  }
  close(): Promise<void> {
    return new Promise(resolve => {
      if (!this.port) return resolve();
      this.port.close(() => resolve());
      this.port = null;
    });
  }
}
