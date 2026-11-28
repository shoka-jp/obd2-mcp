import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Elm327 } from "./elm327.js";
import { buildServer } from "./server.js";
import type { Transport } from "./transport.js";
import { VERSION } from "./version.js";

/**
 * `obd2-mcp --check`: a short, read-only test of a real adapter and car that
 * prints a Markdown summary to paste into the "Real setup report" issue form.
 * It never reads the VIN or clears codes, and it leaves out port names,
 * network addresses and other identifying details.
 */

export const REPORT_FORM = "https://github.com/shoka-jp/obd2-mcp/issues/new?template=hardware-report.yml";

export interface CheckTarget {
  transport: Transport;
  mock: boolean;
  /** "serial", "tcp" or "mock"; how the connection was chosen is added in brackets. */
  kind: string;
  how: string;
}

type Step = { label: string; result: string; ms: number };

/** Remove anything that could identify the computer, network or vehicle from an error text. */
export function scrub(text: string): string {
  return text
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, "<address>")
    .replace(/\[[0-9a-f:]+\](?::\d+)?/gi, "<address>")
    .replace(/(?:serial:)?(?:\/dev\/[\w.-]+|COM\d+)(?:@\d+)?/gi, "<port>")
    .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/g, "<VIN>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export async function runCheck(target: CheckTarget, now: () => number = () => Date.now()): Promise<string> {
  const server = buildServer(new Elm327(target.transport), target.mock, { reportDir: null });
  const client = new Client({ name: "obd2-mcp-check", version: VERSION });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  const steps: Step[] = [];
  const facts: Record<string, string> = {};
  const call = async (label: string, name: string, summarise: (data: Record<string, unknown>) => string) => {
    const started = now();
    let result: string;
    try {
      const response = await client.callTool({ name, arguments: {} });
      const text = (response.content as Array<{ type: string; text?: string }>).find(c => c.type === "text")?.text ?? "{}";
      const data = JSON.parse(text) as Record<string, unknown>;
      result = response.isError ? `failed: ${scrub(String(data.error ?? "unknown error"))}` : summarise(data);
    } catch (err) {
      result = `failed: ${scrub(err instanceof Error ? err.message : String(err))}`;
    }
    steps.push({ label, result, ms: now() - started });
    return result;
  };
  try {
    await call("Adapter answers (ATZ, ATI)", "connection_status", d => {
      facts.adapter = scrub(String(d.adapter ?? "unknown"));
      if (typeof d.battery_voltage === "string") facts.voltage = scrub(d.battery_voltage);
      return "OK";
    });
    await call("Supported sensors (0100 onwards)", "read_supported_pids", d => {
      const supported = Array.isArray(d.supported_sensor_names) ? d.supported_sensor_names.length : 0;
      const unknown = Array.isArray(d.unknown_sensor_names) ? d.unknown_sensor_names.length : 0;
      return `OK: ${supported} supported${unknown ? `, ${unknown} unknown` : ""}`;
    });
    await call("Trouble codes (03, 07)", "read_dtcs", d => {
      const stored = Array.isArray(d.stored_dtcs) ? d.stored_dtcs.length : "unknown";
      const pending = Array.isArray(d.pending_dtcs) ? d.pending_dtcs.length : "unknown";
      return `OK: ${stored} stored, ${pending} pending, warning light ${d.mil_on === true ? "on" : d.mil_on === false ? "off" : "unknown"}`;
    });
    await call("Permanent codes (0A)", "read_permanent_dtcs", d =>
      Array.isArray(d.permanent_dtcs) ? `OK: ${d.permanent_dtcs.length}` : "no answer or not supported"
    );
    await call("Freeze frame (02)", "read_freeze_frame", d =>
      d.freeze_frame ? "OK: stored" : typeof d.note === "string" && /^No freeze frame stored/.test(d.note) ? "OK: none stored" : "no answer"
    );
    await call("Readiness (0101)", "read_readiness", d => {
      const engine = d.engine_type === "compression_ignition" ? "diesel" : "petrol";
      return `OK: ${d.complete_count} of ${d.supported_count} complete (${engine})`;
    });
    await call("Control modules (09 with headers)", "read_ecu_info", d => {
      if (typeof d.protocol === "string") facts.protocol = d.protocol;
      if (d.supported !== true) return typeof d.note === "string" ? `not supported: ${scrub(d.note).slice(0, 80)}` : "not supported";
      const modules = Array.isArray(d.modules) ? d.modules : [];
      return `OK: ${modules.length} module${modules.length === 1 ? "" : "s"}`;
    });
    await call("Monitor tests (06 with headers)", "read_monitor_tests", d => {
      if (d.supported !== true) return typeof d.note === "string" ? `not supported: ${scrub(d.note).slice(0, 80)}` : "not supported";
      const c = (d.counts ?? {}) as Record<string, unknown>;
      return `OK: ${c.pass} pass, ${c.fail} fail, ${c.not_run} not run${Array.isArray(d.misfire_counts) ? `, misfire counts for ${d.misfire_counts.length} cylinders` : ""}`;
    });
  } finally {
    await client.close();
    await server.close();
    await target.transport.close().catch(() => undefined);
  }

  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  return [
    "### obd2-mcp check",
    "",
    `- obd2-mcp ${VERSION} · Node ${process.versions.node} · ${os.type()} ${os.release()} (${process.platform}/${process.arch})`,
    `- Connection: ${target.kind} (${target.how})`,
    `- Adapter: ${facts.adapter ?? "no answer"}`,
    `- Voltage at the port: ${facts.voltage ?? "unknown"}`,
    `- Protocol: ${facts.protocol ?? "unknown"}`,
    ...(target.mock ? ["- **Simulated vehicle: this is not a real setup.**"] : []),
    "",
    "| Step | Result | Time |",
    "|---|---|---|",
    ...steps.map(s => `| ${s.label} | ${s.result.replace(/\|/g, "/")} | ${seconds(s.ms)} |`),
    "",
    "Read-only: no VIN was read and no codes were cleared. Port names and network addresses are left out.",
    `Paste this into the real setup report: ${REPORT_FORM}`,
  ].join("\n");
}
