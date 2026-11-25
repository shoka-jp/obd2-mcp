import { MockTransport, MOCK_SCENARIOS, type MockScenario } from "./mock.js";
import { SerialTransport, TcpTransport } from "./transport.js";
import type { Transport } from "./transport.js";

const EXPECTED = "expected mock, serial:<path>, or tcp:<host>:<port>";
const DEFAULT_BAUD = 38400;

/**
 * Connection selection (first match wins):
 *   --connection <spec> CLI argument
 *   OBD2MCP_CONNECTION  environment variable
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
  const spec = (argIdx !== -1 ? argv[argIdx + 1] : env.OBD2MCP_CONNECTION) ?? "mock";
  if (spec === "mock") {
    const scenario = env.OBD2MCP_MOCK_SCENARIO ?? "catalyst";
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
