import { listSerialPorts, type SerialPortSummary } from "./ports.js";
import { SerialTransport } from "./transport.js";
import type { Transport } from "./transport.js";

/**
 * Find an ELM327 adapter without asking the user for a port name. Most people
 * using obd2-mcp do not know what "COM5" or "/dev/cu.OBDII" means; this checks
 * only ports that look like an OBD-II adapter (a known USB-serial chip, or a
 * Bluetooth serial port), opens each briefly and asks the adapter to identify
 * itself with ATZ. Nothing is sent to the vehicle.
 */

export type ProbeStatus = "elm327_found" | "no_answer" | "not_elm327" | "error";

export interface ProbeResult {
  connection: string;
  description: string | null;
  reason: string;
  status: ProbeStatus;
  /** Identity line reported by the adapter, for example "ELM327 v1.5". */
  adapter?: string;
  baud?: number;
  detail?: string;
}

export interface FindAdapterResult {
  found: ProbeResult[];
  checked: ProbeResult[];
  /** Ports that do not look like an adapter and were not opened. */
  skipped: Array<{ connection: string; description: string | null }>;
}

export interface DiscoverDeps {
  list?: () => Promise<SerialPortSummary[]>;
  /** Creates the transport used for one probe; tests replace it. */
  open?: (path: string, baud: number) => Transport;
  baud?: number;
  timeoutMs?: number;
}

const IDENTITY = /ELM\s?327[^\r\n>]*|OBDLink[^\r\n>]*|STN\d{4}[^\r\n>]*|v-?Link[^\r\n>]*/i;
const NOT_AN_ADAPTER = /incoming|debug-console|wlan-debug|modem|^\/dev\/ttyS\d+$/i;
const BLUETOOTH = /bluetooth|rfcomm|obd|elm|v-?link|vgate|icar|spp/i;
/** USB adapters are usually set to 38400 baud; some low-cost ones use 115200 or 9600. */
const USB_BAUDS = [38400, 115200, 9600];

/** Decide which ports to open, and why. Ports that look unrelated are skipped. */
export function adapterCandidates(ports: SerialPortSummary[]): {
  candidates: Array<{ port: SerialPortSummary; reason: string; usb: boolean }>;
  skipped: SerialPortSummary[];
} {
  const candidates: Array<{ port: SerialPortSummary; reason: string; usb: boolean }> = [];
  const skipped: SerialPortSummary[] = [];
  for (const port of ports) {
    const text = `${port.path} ${port.description ?? ""} ${port.manufacturer ?? ""}`;
    if (NOT_AN_ADAPTER.test(port.path) || NOT_AN_ADAPTER.test(port.description ?? "")) {
      skipped.push(port);
    } else if (port.usb_serial_chip) {
      candidates.push({ port, reason: `USB-serial chip ${port.usb_serial_chip}`, usb: true });
    } else if (/^\/dev\/tty(USB|ACM)\d+$/.test(port.path)) {
      // On Linux these names are always USB serial devices, even when the chip is unknown.
      candidates.push({ port, reason: "Linux USB serial device", usb: true });
    } else if (BLUETOOTH.test(text)) {
      candidates.push({ port, reason: "Bluetooth or OBD-named serial port", usb: false });
    } else {
      skipped.push(port);
    }
  }
  return { candidates, skipped };
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Open one port at one baud rate, send ATZ and read the identity. Always closes the port. */
async function probe(path: string, baud: number, open: (path: string, baud: number) => Transport, timeoutMs: number) {
  const transport = open(path, baud);
  try {
    await withTimeout(transport.open(), timeoutMs + 4000, `Opening ${path} took too long`);
    const reply = await transport.sendRaw("ATZ", timeoutMs);
    const identity = IDENTITY.exec(reply)?.[0].trim();
    return identity ? { status: "elm327_found" as const, adapter: identity } : { status: "not_elm327" as const, detail: reply.trim().slice(0, 80) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return /Timeout waiting/.test(message) ? { status: "no_answer" as const } : { status: "error" as const, detail: message.slice(0, 200) };
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function findAdapters(deps: DiscoverDeps = {}): Promise<FindAdapterResult> {
  const list = deps.list ?? (() => listSerialPorts());
  const open = deps.open ?? ((path: string, baud: number) => new SerialTransport(path, baud));
  const baud = deps.baud ?? 38400;
  const timeoutMs = deps.timeoutMs ?? 4000;
  const { candidates, skipped } = adapterCandidates(await list());
  const checked: ProbeResult[] = [];
  for (const { port, reason, usb } of candidates) {
    // Bluetooth serial ports ignore the baud rate, so one attempt is enough.
    const bauds = usb ? [baud, ...USB_BAUDS.filter(b => b !== baud)] : [baud];
    let result: ProbeResult = { connection: port.connection, description: port.description, reason, status: "no_answer" };
    for (const rate of bauds) {
      const outcome = await probe(port.path, rate, open, timeoutMs);
      result = { connection: port.connection, description: port.description, reason, ...outcome, ...(outcome.status === "elm327_found" ? { baud: rate } : {}) };
      // Only a silent port is worth retrying at another speed.
      if (outcome.status !== "no_answer") break;
    }
    checked.push(result);
  }
  return {
    found: checked.filter(result => result.status === "elm327_found"),
    checked,
    skipped: skipped.map(port => ({ connection: port.connection, description: port.description })),
  };
}
