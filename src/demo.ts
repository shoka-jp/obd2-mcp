import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Elm327 } from "./elm327.js";
import { MockTransport } from "./mock.js";
import { buildServer } from "./server.js";

/** Run a read-only simulation without requiring an external MCP client. */
export async function runDemo(summary = false, lang: "en" | "ja" = "en"): Promise<void> {
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
      if (lang === "ja") {
        console.log("模擬デモ — 実車には接続せず、コードも消去していません");
        console.log(`記録されたコード: ${codes.stored_dtcs.join(", ") || "なし"}`);
        console.log(`エンジン警告灯: ${codes.mil_on ? "点灯" : "消灯"}`);
        console.log(`フリーズフレームのコード: ${frame?.dtc ?? "なし"}`);
        console.log(`現在のエンジン回転数: ${live.rpm.value} ${live.rpm.unit}`);
        console.log(`現在の冷却水温: ${live.coolant_temp.value} ${live.coolant_temp.unit}`);
        if (codes.stored_dtcs.includes("P0420")) console.log("P0420の一般的な意味: バンク1の触媒システム効率が基準を下回ったことを示すコード。");
        console.log("これは模擬データであり、診断結果ではありません。コードだけで故障部品は特定できません。");
        console.log("実車ではコードとフリーズフレームを消去せず保存し、車両メーカーの手順を確認するか整備士に相談してください。");
        console.log("完全なJSONは、ビルド後に node dist/index.js --demo で確認できます。");
      } else {
        console.log("SIMULATED DEMO — no vehicle connected; no codes cleared");
        console.log(`Stored codes: ${codes.stored_dtcs.join(", ") || "none"}`);
        console.log(`Check-engine light: ${codes.mil_on ? "on" : "off"}`);
        console.log(`Freeze frame: ${frame?.dtc ?? "none"}`);
        console.log(`Current engine speed: ${live.rpm.value} ${live.rpm.unit}`);
        console.log(`Current coolant temperature: ${live.coolant_temp.value} ${live.coolant_temp.unit}`);
        if (codes.stored_dtcs.includes("P0420")) console.log("P0420 generally indicates catalyst system efficiency below the threshold on bank 1.");
        console.log("These are mock observations, not a diagnosis.");
        console.log("A code alone does not identify a failed part. For a real vehicle, preserve the codes and freeze frame, and consult the manufacturer's procedures or a qualified technician.");
        console.log("For full JSON, run the demo command without --summary.");
      }
    }
  } finally {
    await client.close();
    await server.close();
  }
}
