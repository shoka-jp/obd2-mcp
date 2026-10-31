import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Elm327, NoDataError } from "./elm327.js";
import { parseDtcPayload, decodeDtcPair } from "./dtc.js";
import { PIDS, PID_BY_NAME, DEFAULT_PIDS, FREEZE_PIDS } from "./pids.js";

const MONITORS_B = ["misfire", "fuel_system", "components"] as const;
const MONITORS_CD = [
  "catalyst",
  "heated_catalyst",
  "evaporative_system",
  "secondary_air_system",
  "ac_refrigerant",
  "oxygen_sensor",
  "oxygen_sensor_heater",
  "egr_system",
] as const;

export function buildServer(elm: Elm327, mock: boolean): McpServer {
  const server = new McpServer({ name: "obd2-mcp", version: "0.2.0" });

  const wrap = (data: Record<string, unknown>) => {
    const payload = {
      ...data,
      source: elm.describe(),
      ...(mock ? { simulated: true, note: "Mock vehicle data — no real car is connected." } : {}),
    };
    return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
  };

  const fail = (err: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify({ error: String(err instanceof Error ? err.message : err) }) }],
    isError: true,
  });

  server.tool(
    "connection_status",
    "Report the OBD-II adapter connection: transport, adapter identity, and battery voltage at the port.",
    {},
    async () => {
      try {
        const identity = await elm.at("ATI");
        const voltage = await elm.at("ATRV");
        return wrap({ connected: true, adapter: identity, battery_voltage: voltage });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    "read_dtcs",
    "Read diagnostic trouble codes: stored (confirmed) DTCs, pending DTCs, MIL (check-engine light) state, and DTC count. Use first when a warning light is on.",
    {},
    async () => {
      try {
        const status = await elm.obd("0101", "4101");
        requireBytes(status, 4, "0101");
        const milOn = (status[0] & 0x80) !== 0;
        const count = status[0] & 0x7f;
        let stored: string[] = [];
        let pending: string[] = [];
        try {
          stored = parseDtcPayload(await elm.obd("03", "43"));
        } catch (e) {
          if (!(e instanceof NoDataError)) throw e;
        }
        try {
          pending = parseDtcPayload(await elm.obd("07", "47"));
        } catch (e) {
          if (!(e instanceof NoDataError)) throw e;
        }
        return wrap({ mil_on: milOn, dtc_count: count, stored_dtcs: stored, pending_dtcs: pending });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    "read_live_data",
    `Read live sensor values (mode 01 PIDs). Omit "pids" for a sensible default set. Available names: ${PIDS.map(p => p.name).join(", ")}.`,
    { pids: z.array(z.string()).optional().describe("PID names to read; omit for the default set") },
    async ({ pids }) => {
      const wanted = (pids && pids.length > 0 ? pids : DEFAULT_PIDS).map(p => p.toLowerCase().trim());
      const values: Record<string, { value: number; unit: string } | { error: string }> = {};
      for (const name of wanted) {
        const def = PID_BY_NAME.get(name);
        if (!def) {
          values[name] = { error: `Unknown PID name. Available: ${PIDS.map(p => p.name).join(", ")}` };
          continue;
        }
        try {
          const bytes = await elm.obd(`01${def.pid}`, `41${def.pid}`);
          requireBytes(bytes, def.bytes, `01${def.pid}`);
          values[name] = { value: round(def.parse(bytes)), unit: def.unit };
        } catch (err) {
          values[name] = { error: err instanceof NoDataError ? "not supported by this vehicle" : String(err instanceof Error ? err.message : err) };
        }
      }
      return wrap({ live_data: values });
    }
  );

  server.tool(
    "read_freeze_frame",
    "Read the freeze frame (frame 0): the DTC that froze it plus engine conditions captured at the moment the fault set. Read this BEFORE clearing codes — clearing erases it.",
    {},
    async () => {
      try {
        const dtcBytes = await elm.obd("020200", "420200");
        requireBytes(dtcBytes, 2, "020200");
        const dtc = dtcBytes.length >= 2 ? decodeDtcPair(dtcBytes[0], dtcBytes[1]) : null;
        if (!dtc) return wrap({ freeze_frame: null, note: "No freeze frame stored." });
        const conditions: Record<string, { value: number; unit: string }> = {};
        for (const name of FREEZE_PIDS) {
          const def = PID_BY_NAME.get(name)!;
          try {
            const bytes = await elm.obd(`02${def.pid}00`, `42${def.pid}00`);
            requireBytes(bytes, def.bytes, `02${def.pid}00`);
            conditions[name] = { value: round(def.parse(bytes)), unit: def.unit };
          } catch (err) {
            if (!(err instanceof NoDataError)) throw err;
          }
        }
        return wrap({ freeze_frame: { dtc, conditions } });
      } catch (err) {
        if (err instanceof NoDataError) return wrap({ freeze_frame: null, note: "No freeze frame stored." });
        return fail(err);
      }
    }
  );

  server.tool(
    "read_readiness",
    "Read readiness monitors (emissions self-tests): which monitors this vehicle supports and whether each has completed. Needed to know if the vehicle would pass an emissions inspection after codes were cleared.",
    {},
    async () => {
      try {
        const b = await elm.obd("0101", "4101");
        requireBytes(b, 4, "0101");
        if ((b[1] & 0x08) !== 0) throw new Error("Compression-ignition readiness monitors are not yet supported");
        const monitors: Record<string, string> = {};
        MONITORS_B.forEach((name, i) => {
          const available = (b[1] & (1 << i)) !== 0;
          const incomplete = (b[1] & (1 << (i + 4))) !== 0;
          monitors[name] = !available ? "not_supported" : incomplete ? "incomplete" : "complete";
        });
        MONITORS_CD.forEach((name, i) => {
          const available = (b[2] & (1 << i)) !== 0;
          const incomplete = (b[3] & (1 << i)) !== 0;
          monitors[name] = !available ? "not_supported" : incomplete ? "incomplete" : "complete";
        });
        return wrap({ mil_on: (b[0] & 0x80) !== 0, readiness_monitors: monitors });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    "read_vin",
    "Read the Vehicle Identification Number (VIN) from the ECU (mode 09 PID 02).",
    {},
    async () => {
      try {
        const bytes = await elm.obd("0902", "4902");
        requireBytes(bytes, 18, "0902");
        const ascii = bytes
          .slice(1) // record-count byte
          .filter(x => x >= 0x20 && x <= 0x7e)
          .map(x => String.fromCharCode(x))
          .join("");
        const vin = ascii.length >= 17 ? ascii.slice(-17) : ascii;
        if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) throw new Error("Invalid or incomplete VIN response");
        return wrap({ vin });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    "clear_dtcs",
    "Clear stored DTCs and turn off the MIL (mode 04). DESTRUCTIVE: also erases freeze frame data and resets readiness monitors, which can make the vehicle fail an emissions inspection until drive cycles complete. Read read_dtcs and read_freeze_frame first, and only call this with confirm=true after the user explicitly agrees.",
    { confirm: z.boolean().describe("Must be true. Confirms the user understands freeze frame data will be lost and readiness monitors reset.") },
    async ({ confirm }) => {
      if (!confirm) {
        return fail(
          "Not cleared. Set confirm=true only after the user explicitly confirms — clearing erases freeze frame evidence and resets readiness monitors."
        );
      }
      if (!mock && process.env.OBD2MCP_ENABLE_CLEAR !== "1") {
        return fail("Clearing real vehicle codes is disabled. Enable OBD2MCP_ENABLE_CLEAR=1 only after reviewing the risks and obtaining explicit user consent.");
      }
      if (!mock) {
        try {
          const response = await server.server.elicitInput({
            mode: "form",
            message: "Clear diagnostic trouble codes on the connected vehicle? This erases freeze-frame data and resets readiness monitors. Confirm only when the vehicle is safely parked and you understand the consequences.",
            requestedSchema: {
              type: "object",
              properties: { approve: { type: "boolean", title: "Approve clearing vehicle diagnostic codes", default: false } },
              required: ["approve"],
            },
          }, { timeout: 120000 });
          if (response.action !== "accept" || response.content?.approve !== true) return fail("Not cleared: user approval was not granted.");
        } catch {
          return fail("Not cleared: the MCP client did not provide a usable user confirmation. Use a client that supports form elicitation.");
        }
      }
      try {
        await elm.obd("04", "44");
        return wrap({ cleared: true, note: "DTCs cleared, MIL reset. Readiness monitors will read incomplete until drive cycles complete." });
      } catch (err) {
        return fail(err);
      }
    }
  );

  return server;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function requireBytes(bytes: number[], count: number, command: string): void {
  if (bytes.length < count) throw new Error(`Incomplete response to "${command}": expected ${count} bytes, got ${bytes.length}`);
  if (command !== "0902" && bytes.length !== count) throw new Error(`Ambiguous response to "${command}": expected ${count} bytes, got ${bytes.length}`);
}
