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
  private unusable: Error | null = null;

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
    // Keep the first cause: a socket "close" that follows an error or timeout
    // would otherwise replace the useful message reported on later calls.
    this.unusable ??= err;
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
        if (this.unusable) return reject(new Error(`Adapter connection is unusable; restart the server: ${this.unusable.message}`));
        this.buffer = "";
        const timer = setTimeout(() => {
          this.waiter = null;
          const err = new Error(`Timeout waiting for adapter response to "${cmd}" (${timeoutMs} ms)`);
          this.unusable = err;
          reject(err);
        }, timeoutMs);
        this.waiter = { resolve, reject, timer };
        try { this.write(cmd + "\r"); } catch (err) { this.fail(err instanceof Error ? err : new Error(String(err))); }
      });
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

const DEFAULT_CONNECT_TIMEOUT = 10000;

/** TCP transport for WiFi ELM327 adapters (commonly 192.168.0.10:35000). */
export class TcpTransport extends StreamTransport {
  private socket: net.Socket | null = null;
  constructor(private host: string, private port: number, private connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT) {
    super();
  }
  describe(): string {
    return `tcp:${this.host.includes(":") ? `[${this.host}]` : this.host}:${this.port}`;
  }
  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host: this.host, port: this.port });
      s.setEncoding("ascii");
      // Without a deadline, an unreachable WiFi adapter can leave the first tool
      // call waiting for the operating system's TCP timeout (often 20 s or more).
      const timer = setTimeout(() => {
        const err = new Error(
          `Timed out after ${this.connectTimeoutMs} ms connecting to the adapter at ${this.describe()}. ` +
            "Check that this computer is on the adapter's WiFi network and that the address and port are correct."
        );
        this.fail(err);
        s.destroy();
        reject(err);
      }, this.connectTimeoutMs);
      s.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      s.once("error", err => {
        clearTimeout(timer);
        this.fail(err as Error);
        reject(err);
      });
      s.on("data", d => this.onData(String(d)));
      s.on("error", err => this.fail(err as Error));
      s.on("close", () => this.fail(new Error("TCP adapter connection closed")));
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

type SerialPortModule = { SerialPort: new (options: { path: string; baudRate: number }, callback: (err: Error | null) => void) => any };

/**
 * Add a next step to common errors from opening a serial port. The original
 * error text is kept, because it is what users and maintainers search for.
 */
export function serialOpenError(path: string, err: Error): Error {
  const text = err.message;
  let hint = "Check the port name with obd2-mcp --list-ports (or the list_serial_ports tool).";
  if (/permission denied|EACCES/i.test(text)) {
    hint = "Your user may lack permission for this port; on Linux, add it to the serial group (for example dialout) and sign in again.";
  } else if (/access denied|resource busy|EBUSY|in use/i.test(text)) {
    hint = "Another program may be using the port; close other diagnostic or serial apps and try again.";
  }
  return new Error(`Could not open serial:${path}: ${text}. ${hint} See docs/troubleshooting.md.`);
}

/** Serial transport for USB / Bluetooth-SPP ELM327 adapters. Loads `serialport` lazily. */
export class SerialTransport extends StreamTransport {
  private port: { write(d: string): void; close(cb: (e?: Error | null) => void): void } | null = null;
  constructor(
    private path: string,
    private baudRate: number,
    private load: () => Promise<SerialPortModule> = async () => (await import("serialport")) as unknown as SerialPortModule
  ) {
    super();
  }
  describe(): string {
    return `serial:${this.path}@${this.baudRate}`;
  }
  async open(): Promise<void> {
    let SerialPort: SerialPortModule["SerialPort"];
    try {
      ({ SerialPort } = await this.load());
    } catch {
      throw new Error(
        'The "serialport" package is not installed (it is an optional dependency). ' +
          "Reinstall with build tools available, or use a WiFi adapter via tcp:HOST:PORT, or mock mode."
      );
    }
    await new Promise<void>((resolve, reject) => {
      const p = new SerialPort({ path: this.path, baudRate: this.baudRate }, (err: Error | null) =>
        err ? reject(serialOpenError(this.path, err)) : resolve()
      );
      p.setEncoding("ascii");
      p.on("data", (d: unknown) => this.onData(String(d)));
      p.on("error", (err: Error) => this.fail(err));
      p.on("close", () => this.fail(new Error("Serial adapter connection closed")));
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
