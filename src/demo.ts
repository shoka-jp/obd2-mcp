import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Elm327 } from "./elm327.js";
import { MockTransport } from "./mock.js";
import { buildServer } from "./server.js";

/** Run a read-only simulation without requiring an external MCP client. */
export async function runDemo(summary = false): Promise<void> {
  const server = buildServer(new Elm327(new MockTransport()), true);
  const client = new Client({ name: "obd2-mcp-demo", version: "0.2.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const readings = new Map<string, unknown>();
    for (const name of ["connection_status", "read_dtcs", "read_freeze_frame", "read_live_data"]) {
      const result = await client.callTool({ name, arguments: {} });
      if (result.isError) throw new Error(`Demo tool ${name} failed`);
      const parts: unknown[] = Array.isArray(result.content) ? result.content : [];
      const item = parts.find((part): part is { type: "text"; text: string } =>
        typeof part === "object" && part !== null && "type" in part && part.type === "text" &&
        "text" in part && typeof part.text === "string"
      );
      if (!item) throw new Error(`Demo tool ${name} returned no text`);
      const data = JSON.parse(item.text);
      readings.set(name, data);
      if (!summary) console.log(JSON.stringify({ tool: name, data }, null, 2));
    }
    if (summary) {
      const codes = readings.get("read_dtcs") as { stored_dtcs: string[]; mil_on: boolean };
      const { freeze_frame: frame } = readings.get("read_freeze_frame") as { freeze_frame: { dtc: string } | null };
      const { live_data: live } = readings.get("read_live_data") as {
        live_data: { rpm: { value: number; unit: string }; coolant_temp: { value: number; unit: string } };
      };
      console.log("SIMULATED DEMO — no vehicle connected; no codes cleared");
      console.log(`Stored codes: ${codes.stored_dtcs.join(", ") || "none"}`);
      console.log(`Check-engine light: ${codes.mil_on ? "on" : "off"}`);
      console.log(`Freeze frame: ${frame?.dtc ?? "none"}`);
      console.log(`Current engine speed: ${live.rpm.value} ${live.rpm.unit}`);
      console.log(`Current coolant temperature: ${live.coolant_temp.value} ${live.coolant_temp.unit}`);
      console.log("These are mock observations, not a diagnosis.");
      console.log("For full JSON, run the demo command without --summary.");
    }
  } finally {
    await client.close();
    await server.close();
  }
}
