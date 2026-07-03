// Smoke test: spawn the built server in mock mode and drive it over stdio
// with raw MCP JSON-RPC (newline-delimited). Verifies the full stack:
// transport → ELM327 parsing → tool responses.
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["dist/index.js"], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, OBD2MCP_CONNECTION: "mock" },
});

let buffer = "";
const pending = new Map();
child.stdout.on("data", chunk => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let nextId = 1;
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 10000);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

function assert(cond, label) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    child.kill();
    process.exit(1);
  }
  console.log(`ok: ${label}`);
}

const toolJson = res => JSON.parse(res.result.content[0].text);

try {
  const init = await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0.0.0" },
  });
  assert(init.result?.serverInfo?.name === "obd2-mcp", "initialize returns server info");
  notify("notifications/initialized", {});

  const tools = await request("tools/list", {});
  const names = tools.result.tools.map(t => t.name).sort();
  assert(names.length === 7, `7 tools registered (${names.join(", ")})`);

  const dtcs = toolJson(await request("tools/call", { name: "read_dtcs", arguments: {} }));
  assert(dtcs.stored_dtcs?.includes("P0420"), "read_dtcs finds stored P0420");
  assert(dtcs.mil_on === true && dtcs.dtc_count === 1, "MIL on with count 1");
  assert(dtcs.pending_dtcs?.length === 0, "no pending DTCs");
  assert(dtcs.simulated === true, "mock responses are labeled simulated");

  const ff = toolJson(await request("tools/call", { name: "read_freeze_frame", arguments: {} }));
  assert(ff.freeze_frame?.dtc === "P0420", "freeze frame DTC is P0420");
  assert(ff.freeze_frame?.conditions?.vehicle_speed?.value === 98, "freeze frame captured at 98 km/h");
  assert(ff.freeze_frame?.conditions?.rpm?.value === 2210, "freeze frame rpm 2210");

  const live = toolJson(await request("tools/call", { name: "read_live_data", arguments: {} }));
  assert(Math.abs(live.live_data?.coolant_temp?.value - 89) < 1, "coolant temp ~89 degC");
  assert(live.live_data?.rpm?.value > 700 && live.live_data?.rpm?.value < 800, "idle rpm plausible");

  const ready = toolJson(await request("tools/call", { name: "read_readiness", arguments: {} }));
  assert(ready.readiness_monitors?.catalyst === "complete", "catalyst monitor complete");
  assert(ready.readiness_monitors?.evaporative_system === "incomplete", "evap monitor incomplete");

  const vin = toolJson(await request("tools/call", { name: "read_vin", arguments: {} }));
  assert(vin.vin === "1HGFC2F59GA000042", `VIN decoded (${vin.vin})`);

  const refuse = await request("tools/call", { name: "clear_dtcs", arguments: { confirm: false } });
  assert(refuse.result.isError === true, "clear_dtcs refuses without confirm");

  const clear = toolJson(await request("tools/call", { name: "clear_dtcs", arguments: { confirm: true } }));
  assert(clear.cleared === true, "clear_dtcs works with confirm=true");

  const after = toolJson(await request("tools/call", { name: "read_dtcs", arguments: {} }));
  assert(after.stored_dtcs?.length === 0 && after.mil_on === false, "DTCs gone and MIL off after clear");

  console.log("\nPASS: all smoke tests passed");
  child.kill();
  process.exit(0);
} catch (err) {
  console.error("FAIL:", err);
  child.kill();
  process.exit(1);
}
