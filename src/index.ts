#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Elm327 } from "./elm327.js";
import { parseConnection } from "./connection.js";
import { buildServer } from "./server.js";
import { runDemo } from "./demo.js";
import { MOCK_SCENARIOS, type MockScenario } from "./mock.js";
import { formatPortList, listSerialPorts } from "./ports.js";
import { runCheck } from "./check.js";
import { findAdapters } from "./discover.js";
import { helpText, unknownArgumentError, unknownArguments } from "./cli.js";
import { VERSION } from "./version.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(helpText());
    return;
  }
  if (args.includes("--version") || args.includes("-v")) {
    console.log(VERSION);
    return;
  }
  const unknown = unknownArguments(args);
  if (unknown.length) throw unknownArgumentError(unknown);
  if (process.argv.includes("--list-ports")) {
    const others = ["--demo", "--summary", "--lang", "--connection", "--scenario"].filter(flag => process.argv.includes(flag));
    if (others.length) throw new Error(`--list-ports cannot be combined with ${others.join(", ")}`);
    console.log(formatPortList(await listSerialPorts()));
    return;
  }
  if (process.argv.includes("--check")) {
    const others = ["--demo", "--summary", "--lang", "--scenario"].filter(flag => process.argv.includes(flag));
    if (others.length) throw new Error(`--check cannot be combined with ${others.join(", ")}`);
    await check();
    return;
  }
  if (process.argv.includes("--wifi")) throw new Error("--wifi requires --check");
  const langIndex = process.argv.indexOf("--lang");
  let lang: "en" | "ja" = "en";
  if (langIndex !== -1) {
    if (!process.argv.includes("--demo") || !process.argv.includes("--summary")) throw new Error("--lang requires --demo --summary");
    if (process.argv.indexOf("--lang", langIndex + 1) !== -1) throw new Error("Specify --lang only once");
    const value = process.argv[langIndex + 1];
    if (value !== "en" && value !== "ja") throw new Error("--lang requires en or ja");
    lang = value;
  }
  const scenarioIndex = process.argv.indexOf("--scenario");
  let scenario: MockScenario = "catalyst";
  if (scenarioIndex !== -1) {
    if (!process.argv.includes("--demo")) throw new Error("--scenario requires --demo; for the MCP server, set OBD2MCP_MOCK_SCENARIO");
    if (process.argv.indexOf("--scenario", scenarioIndex + 1) !== -1) throw new Error("Specify --scenario only once");
    const value = process.argv[scenarioIndex + 1];
    if (!MOCK_SCENARIOS.includes(value as MockScenario)) throw new Error(`--scenario requires one of ${MOCK_SCENARIOS.join(", ")}`);
    scenario = value as MockScenario;
  }
  if (process.argv.includes("--demo")) {
    if (process.argv.includes("--connection")) throw new Error("--demo always uses a mock vehicle; do not combine it with --connection");
    await runDemo(process.argv.includes("--summary"), lang, scenario);
    return;
  }
  if (process.argv.includes("--summary")) throw new Error("--summary requires --demo");
  const { transport, mock } = parseConnection(process.argv, process.env);
  const elm = new Elm327(transport);
  const server = buildServer(elm, mock);
  const stdio = new StdioServerTransport();
  await server.connect(stdio);
  console.error(`obd2-mcp ready — connection: ${transport.describe()}`);
}

/** obd2-mcp --check: use the given connection, or find the adapter, then run the read-only check. */
async function check(): Promise<void> {
  const given = process.argv.includes("--connection") || (process.env.OBD2MCP_CONNECTION?.trim() ?? "") !== "";
  if (given) {
    const { transport, mock } = parseConnection(process.argv, process.env);
    const kind = transport.describe().split(":")[0];
    console.error("Checking the adapter (read-only; no VIN, no clearing)…");
    console.log(await runCheck({ transport, mock, kind, how: process.argv.includes("--connection") ? "--connection" : "OBD2MCP_CONNECTION" }));
    return;
  }
  const wifi = process.argv.includes("--wifi");
  console.error(`Looking for the adapter${wifi ? " (USB, Bluetooth and WiFi)" : " (USB and Bluetooth)"}…`);
  const result = await findAdapters({ wifi });
  const found = result.found[0];
  if (!found) {
    console.log([
      "No adapter answered.",
      "- Plug the adapter into the car and turn the ignition on.",
      "- Bluetooth: pair it in the operating system settings first. WiFi: join its network and add --wifi.",
      "- Or give the connection: obd2-mcp --check --connection serial:COM3 (see obd2-mcp --list-ports).",
    ].join("\n"));
    process.exitCode = 1;
    return;
  }
  const env = { ...process.env, ...(found.baud ? { OBD2MCP_BAUD: String(found.baud) } : {}) };
  const { transport, mock } = parseConnection(["--connection", found.connection], env);
  console.error("Found an adapter. Checking it (read-only; no VIN, no clearing)…");
  console.log(await runCheck({ transport, mock, kind: found.connection.split(":")[0], how: "found automatically" }));
}

main().catch(err => {
  console.error("obd2-mcp failed to start:", err);
  process.exit(1);
});
