#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Elm327 } from "./elm327.js";
import { MockTransport, MOCK_SCENARIOS, type MockScenario } from "./mock.js";
import { SerialTransport, TcpTransport } from "./transport.js";
import type { Transport } from "./transport.js";
import { buildServer } from "./server.js";
import { runDemo } from "./demo.js";

/**
 * Connection selection (first match wins):
 *   --connection <spec> CLI argument
 *   OBD2MCP_CONNECTION  environment variable
 *   default: mock
 *
 * spec: "mock" | "serial:<path>" (e.g. serial:COM3, serial:/dev/ttyUSB0)
 *       | "tcp:<host>:<port>" (e.g. tcp:192.168.0.10:35000)
 * Baud rate for serial: OBD2MCP_BAUD (default 38400).
 */
function parseConnection(): { transport: Transport; mock: boolean } {
  const argIdx = process.argv.indexOf("--connection");
  if (argIdx !== -1 && process.argv[argIdx + 1] === undefined) {
    throw new Error("Missing value for --connection — expected mock, serial:<path>, or tcp:<host>:<port>");
  }
  const spec = (argIdx !== -1 ? process.argv[argIdx + 1] : process.env.OBD2MCP_CONNECTION) ?? "mock";
  if (spec === "mock") {
    const scenario = process.env.OBD2MCP_MOCK_SCENARIO ?? "catalyst";
    if (!MOCK_SCENARIOS.includes(scenario as MockScenario)) throw new Error(`Unknown mock scenario "${scenario}" — choose ${MOCK_SCENARIOS.join(", ")}`);
    return { transport: new MockTransport(scenario as MockScenario), mock: true };
  }
  if (spec.startsWith("serial:")) {
    const baud = Number(process.env.OBD2MCP_BAUD ?? 38400);
    return { transport: new SerialTransport(spec.slice("serial:".length), baud), mock: false };
  }
  if (spec.startsWith("tcp:")) {
    const rest = spec.slice("tcp:".length);
    const sep = rest.lastIndexOf(":");
    if (sep === -1) throw new Error(`Invalid tcp spec "${spec}" — expected tcp:host:port`);
    return { transport: new TcpTransport(rest.slice(0, sep), Number(rest.slice(sep + 1))), mock: false };
  }
  throw new Error(`Invalid connection "${spec}" — expected mock, serial:<path>, or tcp:<host>:<port>`);
}

async function main(): Promise<void> {
  const langIndex = process.argv.indexOf("--lang");
  let lang: "en" | "ja" = "en";
  if (langIndex !== -1) {
    if (!process.argv.includes("--demo") || !process.argv.includes("--summary")) throw new Error("--lang requires --demo --summary");
    if (process.argv.indexOf("--lang", langIndex + 1) !== -1) throw new Error("Specify --lang only once");
    const value = process.argv[langIndex + 1];
    if (value !== "en" && value !== "ja") throw new Error("--lang requires en or ja");
    lang = value;
  }
  if (process.argv.includes("--demo")) {
    if (process.argv.includes("--connection")) throw new Error("--demo always uses a mock vehicle; do not combine it with --connection");
    await runDemo(process.argv.includes("--summary"), lang);
    return;
  }
  if (process.argv.includes("--summary")) throw new Error("--summary requires --demo");
  const { transport, mock } = parseConnection();
  const elm = new Elm327(transport);
  const server = buildServer(elm, mock);
  const stdio = new StdioServerTransport();
  await server.connect(stdio);
  console.error(`obd2-mcp ready — connection: ${transport.describe()}`);
}

main().catch(err => {
  console.error("obd2-mcp failed to start:", err);
  process.exit(1);
});
