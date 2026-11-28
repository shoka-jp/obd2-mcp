import { MOCK_SCENARIOS } from "./mock.js";
import { VERSION } from "./version.js";

const VALUE_OPTIONS = new Set(["--connection", "--lang", "--scenario"]);
const FLAGS = new Set(["--demo", "--summary", "--list-ports", "--check", "--wifi", "--help", "-h", "--version", "-v"]);

/**
 * Arguments this CLI does not recognize. Previously a typo such as --list-port
 * or --connection=serial:COM3 was ignored and the server started with the mock
 * vehicle, which is easy to mistake for a real connection.
 */
export function unknownArguments(args: readonly string[]): string[] {
  const unknown: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (VALUE_OPTIONS.has(arg)) {
      i++; // its value is validated where it is used
      continue;
    }
    if (!FLAGS.has(arg)) unknown.push(arg);
  }
  return unknown;
}

export function unknownArgumentError(unknown: readonly string[]): Error {
  const first = unknown[0];
  const hint = first.includes("=") && VALUE_OPTIONS.has(first.slice(0, first.indexOf("=")))
    ? ` Write the value after a space, e.g. ${first.slice(0, first.indexOf("="))} ${first.slice(first.indexOf("=") + 1)}.`
    : "";
  const label = unknown.length === 1 ? "argument" : "arguments";
  return new Error(`Unknown ${label}: ${unknown.join(" ")}.${hint} Run obd2-mcp --help for usage.`);
}

export function helpText(): string {
  return `obd2-mcp ${VERSION} — read your car's OBD-II data through an ELM327 adapter (MCP server)

Usage:
  obd2-mcp [--connection <spec>]              Start the MCP server on stdio (MCP clients run this)
  obd2-mcp --demo [--scenario <name>] [--summary [--lang en|ja]]
                                              Run the simulated vehicle demo and exit
  obd2-mcp --list-ports                       List serial ports with their connection values
  obd2-mcp --check [--connection <spec>] [--wifi]
                                              Test a real adapter and car (read-only) and print a
                                              summary to paste into a setup report; without
                                              --connection it finds the adapter (--wifi: WiFi too)
  obd2-mcp --help | --version

Connection <spec> (or OBD2MCP_CONNECTION):
  mock                 Simulated vehicle, no car needed (default)
  serial:<port>        USB or paired Bluetooth adapter, e.g. serial:COM3 or serial:/dev/ttyUSB0
  tcp:<host>:<port>    WiFi adapter, commonly tcp:192.168.0.10:35000

Environment:
  OBD2MCP_CONNECTION     Connection used when --connection is not given
  OBD2MCP_MOCK_SCENARIO  Mock scenario: ${MOCK_SCENARIOS.join(", ")} (default ${MOCK_SCENARIOS[0]});
                         --scenario selects one for --demo
  OBD2MCP_BAUD           Serial baud rate (default 38400)
  OBD2MCP_UNITS          metric (default) or imperial
  OBD2MCP_REPORT_DIR     Folder to keep real-vehicle reports for comparison (optional)

Results are observations, not a diagnosis. Clearing codes on a real vehicle is disabled by default.
Documentation: https://github.com/shoka-jp/obd2-mcp#readme`;
}
