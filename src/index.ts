#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Elm327 } from "./elm327.js";
import { parseConnection } from "./connection.js";
import { buildServer } from "./server.js";
import { runDemo } from "./demo.js";

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
  const { transport, mock } = parseConnection(process.argv, process.env);
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
