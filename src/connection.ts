import { MockTransport, MOCK_SCENARIOS, type MockScenario } from "./mock.js";
import { SerialTransport, TcpTransport } from "./transport.js";
import type { Transport } from "./transport.js";

const EXPECTED = "expected mock, serial:<path>, or tcp:<host>:<port>";
const DEFAULT_BAUD = 38400;

/**
 * Connection selection (first match wins):
 *   --connection <spec> CLI argument
 *   OBD2MCP_CONNECTION  environment variable (blank means unset)
 *   default: mock
 *
 * spec: "mock" | "serial:<path>" (e.g. serial:COM3, serial:/dev/ttyUSB0)
 *       | "tcp:<host>:<port>" (e.g. tcp:192.168.0.10:35000, tcp:[fe80::1]:35000)
 * Baud rate for serial: OBD2MCP_BAUD (default 38400).
 *
 * Invalid values stop startup with a message that names the setting, instead of
 * failing later with a less specific adapter or socket error.
 */
export function parseConnection(
  argv: readonly string[],
  env: NodeJS.ProcessEnv
): { transport: Transport; mock: boolean } {
  const argIdx = argv.indexOf("--connection");
  if (argIdx !== -1 && argv[argIdx + 1] === undefined) {
    throw new Error(`Missing value for --connection — ${EXPECTED}`);
  }
  // A blank environment value means "not set", e.g. a desktop extension setting
  // the user cleared may arrive as an empty string.
  const spec = (argIdx !== -1 ? argv[argIdx + 1] : blankToUndefined(env.OBD2MCP_CONNECTION)) ?? "mock";
  if (spec === "mock") {
    const scenario = blankToUndefined(env.OBD2MCP_MOCK_SCENARIO) ?? "catalyst";
    if (!MOCK_SCENARIOS.includes(scenario as MockScenario)) {
      throw new Error(`Unknown mock scenario "${scenario}" — choose ${MOCK_SCENARIOS.join(", ")}`);
    }
    return { transport: new MockTransport(scenario as MockScenario), mock: true };
  }
  if (spec.startsWith("serial:")) {
    const path = spec.slice("serial:".length);
    if (!path.trim()) throw new Error(`Invalid serial spec "${spec}" — expected serial:<path>, e.g. serial:COM3 or serial:/dev/ttyUSB0`);
    return { transport: new SerialTransport(path, parseBaud(env.OBD2MCP_BAUD)), mock: false };
  }
  if (spec.startsWith("tcp:")) {
    const { host, port } = parseHostPort(spec);
    return { transport: new TcpTransport(host, port), mock: false };
  }
  throw new Error(`Invalid connection "${spec}" — ${EXPECTED}`);
}

function blankToUndefined(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

/** OBD2MCP_BAUD must be a positive whole number; unset or blank uses the default. */
export function parseBaud(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_BAUD;
  const text = value.trim();
  const baud = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(baud) || baud <= 0) {
    throw new Error(`Invalid OBD2MCP_BAUD "${value}" — expected a positive whole number such as 38400 or 115200`);
  }
  return baud;
}

function parseHostPort(spec: string): { host: string; port: number } {
  const rest = spec.slice("tcp:".length);
  const sep = rest.lastIndexOf(":");
  const invalid = (detail: string) =>
    new Error(`Invalid tcp spec "${spec}" — ${detail}; expected tcp:<host>:<port>, e.g. tcp:192.168.0.10:35000`);
  if (sep === -1) throw invalid("missing port");
  let host = rest.slice(0, sep).trim();
  const portText = rest.slice(sep + 1).trim();
  // Allow bracketed IPv6 literals such as tcp:[fe80::1]:35000.
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (!host) throw invalid("missing host");
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || port < 1 || port > 65535) throw invalid("port must be a whole number from 1 to 65535");
  return { host, port };
}

/**
 * use_adapter lets the AI client change the connection during a chat, so it is
 * limited to what a real adapter uses: a serial port name, or a WiFi adapter
 * on the local network (an IP address in a private or link-local range). A
 * value read from a web page or a document therefore cannot point the server
 * at an arbitrary internet host. The OBD2MCP_CONNECTION setting, chosen by the
 * user, is not limited this way.
 */
export function sessionConnectionError(spec: string): string | undefined {
  if (spec === "mock") return undefined;
  if (spec.startsWith("serial:")) {
    const path = spec.slice("serial:".length);
    return /^(COM\d{1,3}|\\\\\.\\COM\d{1,3}|\/dev\/[\w.\-/]+)$/i.test(path)
      ? undefined
      : `"${path}" does not look like a serial port; expected a name such as COM3, /dev/ttyUSB0 or /dev/cu.OBDII-SPPDev`;
  }
  if (spec.startsWith("tcp:")) {
    let host: string;
    try {
      host = parseHostPort(spec).host;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
    return isLocalNetworkAddress(host)
      ? undefined
      : `"${host}" is not a local network address. WiFi adapters use a private address such as 192.168.0.10; to use another host, set OBD2MCP_CONNECTION in the settings`;
  }
  return undefined; // parseConnection reports other invalid values
}

function isLocalNetworkAddress(host: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (v4.slice(1).some(part => Number(part) > 255)) return false;
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  const v6 = host.toLowerCase();
  return v6 === "::1" || /^f[cd][0-9a-f]{2}:/.test(v6) || /^fe[89ab][0-9a-f]:/.test(v6);
}
