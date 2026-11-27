import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Elm327 } from "./elm327.js";
import { MockTransport, type MockScenario } from "./mock.js";
import { buildServer } from "./server.js";
import { VERSION } from "./version.js";

/** Run a read-only simulation without requiring an external MCP client. */
export async function runDemo(summary = false, lang: "en" | "ja" = "en", scenario: MockScenario = "catalyst"): Promise<void> {
  const server = buildServer(new Elm327(new MockTransport(scenario)), true);
  const client = new Client({ name: "obd2-mcp-demo", version: VERSION });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const readings = new Map<string, unknown>();
    for (const name of ["connection_status", "read_dtcs", "read_permanent_dtcs", "read_freeze_frame", "read_live_data", "read_readiness"]) {
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
      const { permanent_dtcs: permanent } = readings.get("read_permanent_dtcs") as { permanent_dtcs: string[] | null };
      const { freeze_frame: frame } = readings.get("read_freeze_frame") as { freeze_frame: { dtc: string } | null };
      const { live_data: live } = readings.get("read_live_data") as {
        live_data: { rpm: { value: number; unit: string }; coolant_temp: { value: number; unit: string } };
      };
      const { incomplete_monitors: incomplete } = readings.get("read_readiness") as { incomplete_monitors: string[] };
      const clearedSigns = codes.stored_dtcs.length === 0 && (permanent?.length ?? 0) > 0;
      const mentionsP0420 = codes.stored_dtcs.includes("P0420") || (permanent ?? []).includes("P0420");
      if (lang === "ja") {
        console.log("模擬デモ — 実車には接続せず、コードも消去していません");
        console.log(`模擬シナリオ: ${scenario}`);
        console.log(`記録されたコード: ${codes.stored_dtcs.join(", ") || "なし"}`);
        console.log(`エンジン警告灯: ${codes.mil_on ? "点灯" : "消灯"}`);
        console.log(`消去しても残るコード: ${permanent === null ? "不明（応答なし）" : permanent.join(", ") || "なし"}`);
        console.log(`フリーズフレームのコード: ${frame?.dtc ?? "なし"}`);
        console.log(`未完了のレディネスモニター: ${incomplete.join(", ") || "なし"}`);
        console.log(`現在のエンジン回転数: ${live.rpm.value} ${live.rpm.unit}`);
        console.log(`現在の冷却水温: ${live.coolant_temp.value} ${live.coolant_temp.unit}`);
        if (mentionsP0420) console.log("P0420の一般的な意味: バンク1の触媒システム効率が基準を下回ったことを示すコード。");
        if (clearedSigns) console.log("記録済みのコードはないのに、消去しても残るコードがあります。最近コードが消去され、修理がまだ確認されていない可能性があります。証拠ではなく、理由を確認するための材料です（docs/used-car-check.md）。");
        console.log("これは模擬データであり、診断結果ではありません。コードだけで故障部品は特定できません。");
        console.log("実車ではコードとフリーズフレームを消去せず保存し、車両メーカーの手順を確認するか整備士に相談してください。");
        console.log("完全なJSONは、ビルド後に node dist/index.js --demo で確認できます。");
      } else {
        console.log("SIMULATED DEMO — no vehicle connected; no codes cleared");
        console.log(`Scenario: ${scenario}`);
        console.log(`Stored codes: ${codes.stored_dtcs.join(", ") || "none"}`);
        console.log(`Check-engine light: ${codes.mil_on ? "on" : "off"}`);
        console.log(`Permanent codes: ${permanent === null ? "unknown (no answer)" : permanent.join(", ") || "none"}`);
        console.log(`Freeze frame: ${frame?.dtc ?? "none"}`);
        console.log(`Incomplete readiness monitors: ${incomplete.join(", ") || "none"}`);
        console.log(`Current engine speed: ${live.rpm.value} ${live.rpm.unit}`);
        console.log(`Current coolant temperature: ${live.coolant_temp.value} ${live.coolant_temp.unit}`);
        if (mentionsP0420) console.log("P0420 generally indicates catalyst system efficiency below the threshold on bank 1.");
        if (clearedSigns) console.log("No stored codes, but a permanent code remains: codes were probably cleared recently and the fault is not yet confirmed fixed. This is a reason to ask why, not proof (see docs/used-car-check.md).");
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
