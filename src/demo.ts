import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Elm327 } from "./elm327.js";
import { MockTransport } from "./mock.js";
import { buildServer } from "./server.js";

/** Run a read-only simulation without requiring an external MCP client. */
export async function runDemo(): Promise<void> {
  const server = buildServer(new Elm327(new MockTransport()), true);
  const client = new Client({ name: "obd2-mcp-demo", version: "0.2.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    for (const name of ["connection_status", "read_dtcs", "read_freeze_frame", "read_live_data"]) {
      const result = await client.callTool({ name, arguments: {} });
      if (result.isError) throw new Error(`Demo tool ${name} failed`);
      const parts: unknown[] = Array.isArray(result.content) ? result.content : [];
      const item = parts.find((part): part is { type: "text"; text: string } =>
        typeof part === "object" && part !== null && "type" in part && part.type === "text" &&
        "text" in part && typeof part.text === "string"
      );
      if (!item) throw new Error(`Demo tool ${name} returned no text`);
      console.log(JSON.stringify({ tool: name, data: JSON.parse(item.text) }, null, 2));
    }
  } finally {
    await client.close();
    await server.close();
  }
}
