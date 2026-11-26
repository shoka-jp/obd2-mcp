/**
 * Serial port discovery for USB and Bluetooth (serial) ELM327 adapters.
 *
 * Users often do not know which port name (COM3, /dev/ttyUSB0, ...) belongs to
 * their adapter. This lists the ports the operating system reports, without
 * opening any of them, so nothing is sent to a vehicle.
 */

/** USB-serial chips commonly found in ELM327 USB adapters, keyed by USB vendor ID. */
const USB_SERIAL_CHIPS: Record<string, string> = {
  "0403": "FTDI",
  "1a86": "CH340/CH341",
  "067b": "Prolific PL2303",
  "10c4": "Silicon Labs CP210x",
};

const LIST_TIMEOUT_MS = 10000;

export interface SerialPortSummary {
  /** Value to use for OBD2MCP_CONNECTION or --connection. */
  connection: string;
  path: string;
  /** Operating-system description, e.g. "USB-SERIAL CH340 (COM3)" on Windows. */
  description: string | null;
  manufacturer: string | null;
  vendor_id: string | null;
  product_id: string | null;
  /** Known USB-serial chip name, or null. A match does not prove the device is an OBD-II adapter. */
  usb_serial_chip: string | null;
}

interface RawPortInfo {
  path: string;
  manufacturer?: string;
  friendlyName?: string;
  vendorId?: string;
  productId?: string;
}

type SerialPortModule = { SerialPort: { list(): Promise<RawPortInfo[]> } };

const loadSerialPort = async (): Promise<SerialPortModule> =>
  (await import("serialport")) as unknown as SerialPortModule;

export const SERIALPORT_MISSING =
  'The "serialport" package is not installed (it is an optional dependency), so serial ports cannot be listed. ' +
  "Reinstall with build tools available, or use a WiFi adapter via tcp:HOST:PORT.";

/**
 * List serial ports reported by the operating system. Serial numbers and other
 * device identifiers are omitted so the result can be shared more safely.
 */
export async function listSerialPorts(load: () => Promise<SerialPortModule> = loadSerialPort): Promise<SerialPortSummary[]> {
  let mod: SerialPortModule;
  try {
    mod = await load();
  } catch {
    throw new Error(SERIALPORT_MISSING);
  }
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${LIST_TIMEOUT_MS} ms listing serial ports`)), LIST_TIMEOUT_MS);
  });
  let raw: RawPortInfo[];
  try {
    raw = await Promise.race([mod.SerialPort.list(), timeout]);
  } finally {
    clearTimeout(timer);
  }
  return raw
    .filter(p => typeof p.path === "string" && p.path.length > 0)
    .map(p => {
      const vendor = clean(p.vendorId)?.toLowerCase() ?? null;
      return {
        connection: `serial:${p.path}`,
        path: p.path,
        description: clean(p.friendlyName),
        manufacturer: clean(p.manufacturer),
        vendor_id: vendor,
        product_id: clean(p.productId)?.toLowerCase() ?? null,
        usb_serial_chip: vendor ? USB_SERIAL_CHIPS[vendor] ?? null : null,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path, "en", { numeric: true }));
}

/** Human-readable listing for `obd2-mcp --list-ports`. */
export function formatPortList(ports: SerialPortSummary[]): string {
  if (ports.length === 0) {
    return [
      "No serial ports found.",
      "Plug in a USB adapter, or pair a Bluetooth adapter in the operating system settings first.",
      "WiFi adapters do not appear here; use tcp:<host>:<port>, commonly tcp:192.168.0.10:35000.",
    ].join("\n");
  }
  const lines = [`Serial ports found: ${ports.length}`];
  for (const p of ports) {
    const details = [
      p.description,
      p.manufacturer && p.manufacturer !== p.description ? `manufacturer: ${p.manufacturer}` : null,
      p.usb_serial_chip ? `${p.usb_serial_chip} USB-serial chip (common in ELM327 USB adapters)` : null,
    ].filter(Boolean);
    lines.push(`  ${p.connection}${details.length ? `  — ${details.join("; ")}` : ""}`);
  }
  lines.push(
    "",
    "Set OBD2MCP_CONNECTION to the adapter's value above (for example serial:COM3) and restart the MCP server.",
    "A listed port is not necessarily an OBD-II adapter; unplug the adapter and list again to see which entry disappears."
  );
  return lines.join("\n");
}

function clean(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}
