#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Elm327 } from "./elm327.js";
import { MockTransport } from "./mock.js";
import { SerialTransport, TcpTransport } from "./transport.js";
import type { Transport } from "./transport.js";
import { buildServer } from "./server.js";

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
  const spec = (argIdx !== -1 ? process.argv[argIdx + 1] : process.env.OBD2MCP_CONNECTION) ?? "mock";
  if (spec === "mock") return { transport: new MockTransport(), mock: true };
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
