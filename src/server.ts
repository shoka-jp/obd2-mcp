import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Elm327, NoDataError } from "./elm327.js";
import { parseDtcPayload, decodeDtcPair } from "./dtc.js";
import { codeInfo } from "./dtc-info.js";
import { PIDS, PID_BY_NAME, DEFAULT_PIDS, FREEZE_PIDS } from "./pids.js";
import { discoverSupportedPids } from "./supported-pids.js";
import { listSerialPorts } from "./ports.js";
import { registerPrompts } from "./prompts.js";
import { VERSION } from "./version.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";
import { errorHint } from "./hints.js";
import { findAdapters, type FindAdapterResult } from "./discover.js";
import { parseConnection, sessionConnectionError } from "./connection.js";
import type { Transport } from "./transport.js";

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

/**
 * MCP tool annotations let clients decide how to present a tool, for example
 * whether to ask before running it. Every reader only queries the adapter;
 * clear_dtcs is the only tool that changes vehicle state.
 */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const;
/** Reads only local operating-system information, never the adapter or vehicle. */
const LOCAL_READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/** Replaceable pieces, so tests can run adapter discovery and switching without hardware. */
export interface ServerDeps {
  findAdapters?: () => Promise<FindAdapterResult>;
  connect?: (connection: string, baud?: number) => { transport: Transport; mock: boolean };
  /** Waiting between watch_live_data samples; tests replace it to run instantly. */
  sleep?: (ms: number) => Promise<void>;
  /** Clock for watch_live_data timestamps, in milliseconds. */
  now?: () => number;
}

/** Limits for watch_live_data: a short look at how values change while parked, not a driving logger. */
export const WATCH_LIMITS = { maxPids: 4, minSeconds: 5, maxSeconds: 30, minInterval: 1, maxInterval: 5 } as const;

/** Switching for use_adapter: the same parsing and validation as the OBD2MCP_CONNECTION setting. */
function defaultConnect(connection: string, baud?: number) {
  const env = { ...process.env, ...(baud !== undefined ? { OBD2MCP_BAUD: String(baud) } : {}) };
  return parseConnection(["--connection", connection], env);
}

export function buildServer(elm: Elm327, mock: boolean, deps: ServerDeps = {}): McpServer {
  // The active connection. use_adapter can replace it during a session, so
  // every tool reads it here instead of capturing the original values.
  const session = { elm, mock };
  const server = new McpServer({ name: "obd2-mcp", version: VERSION }, { instructions: SERVER_INSTRUCTIONS });

  const wrap = (data: Record<string, unknown>) => {
    const payload = {
      ...data,
      source: session.elm.describe(),
      ...(session.mock ? { simulated: true, note: data.note ?? "Mock vehicle data — no real car is connected." } : {}),
    };
    return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
  };

  const fail = (err: unknown) => {
    const error = String(err instanceof Error ? err.message : err);
    const hint = errorHint(error);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error, ...(hint ? { hint } : {}) }) }],
      isError: true,
    };
  };

  server.registerTool(
    "connection_status",
    {
      title: "Check adapter connection",
      description: "Report the OBD-II adapter connection, identity, and port voltage if available. Adapter connectivity does not establish communication with a vehicle; vehicle_communication is not_checked.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const identity = await session.elm.at("ATI");
        const voltage = await session.elm.at("ATRV");
        if (!identity || /^(\?|ERROR|NO DATA|STOPPED|UNABLE TO CONNECT)$/i.test(identity)) {
          throw new Error(`Invalid adapter identity: ${identity || "(empty)"}`);
        }
        const voltageValid = /^\d+(?:\.\d+)?\s*V$/i.test(voltage);
        return wrap({
          connected: true,
          adapter: identity,
          vehicle_communication: "not_checked",
          battery_voltage: voltageValid ? voltage : null,
          ...(!voltageValid ? { battery_voltage_note: "Voltage unavailable or unsupported by this adapter." } : {}),
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "list_serial_ports",
    {
      title: "Find adapter serial ports",
      description:
        "List the serial ports this computer reports, to find the connection value for a USB or paired Bluetooth ELM327 adapter (for example serial:COM3). Does not open any port or contact a vehicle, and works in mock mode. WiFi adapters are not listed. Changing the connection requires setting OBD2MCP_CONNECTION and restarting the server.",
      inputSchema: {},
      annotations: LOCAL_READ_ONLY,
    },
    async () => {
      try {
        const ports = await listSerialPorts();
        const payload = {
          ports,
          count: ports.length,
          current_connection: session.elm.describe(),
          note:
            ports.length === 0
              ? "No serial ports found. Plug in a USB adapter or pair a Bluetooth adapter in the operating system first. WiFi adapters use tcp:<host>:<port>."
              : "A listed port is not necessarily an OBD-II adapter. To identify it, unplug or unpair the adapter and list again. Use the chosen 'connection' value as OBD2MCP_CONNECTION and restart the server.",
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "find_adapter",
    {
      title: "Find my OBD-II adapter",
      description:
        "Find a USB or Bluetooth ELM327 adapter automatically, so the user does not need to know a port name. Only ports that look like an adapter (a known USB-serial chip, or a Bluetooth serial port) are opened, briefly, to send the adapter's identification command (ATZ); nothing is sent to the vehicle. Takes a few seconds per port. A Bluetooth adapter must be paired in the operating system first, and the adapter must be plugged into the car with the ignition on. WiFi adapters are not found this way: after the user joins the adapter's WiFi network, use use_adapter with tcp:192.168.0.10:35000 (or the address in its manual). If an adapter is found, ask the user before calling use_adapter with its connection value.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const result = await (deps.findAdapters ?? (() => findAdapters()))();
        const first = result.found[0];
        const next_step = first
          ? `Found ${result.found.length} adapter(s). Ask the user, then call use_adapter with connection ${first.connection}${first.baud && first.baud !== 38400 ? ` and baud ${first.baud}` : ""}.`
          : result.checked.length > 0
            ? "No adapter answered. Check that it is plugged into the car, the ignition is ON, and (for Bluetooth) that it is paired and nearby; then try again."
            : "No port looks like an OBD-II adapter. Plug in the USB adapter, or pair the Bluetooth adapter in the operating system settings, then try again. WiFi adapters use tcp:<host>:<port>. A Bluetooth LE-only adapter (often sold for iPhone) never appears as a port on a computer and cannot be used; see docs/adapters.md.";
        const payload = { ...result, current_connection: session.elm.describe(), next_step };
        return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "use_adapter",
    {
      title: "Connect to my adapter",
      description:
        "Switch this session to a real adapter, or back to mock, without editing settings or restarting. Use the connection value from find_adapter (serial:...) or a WiFi address (tcp:192.168.0.10:35000). The adapter is checked first; if it does not answer, the current connection is kept. Only the adapter is contacted, not the vehicle. The change lasts until the server restarts; to keep it, the user sets Adapter connection in the Claude Desktop extension settings (or OBD2MCP_CONNECTION). Clearing codes on a real vehicle stays disabled. Ask the user before switching.",
      inputSchema: {
        connection: z.string().min(1).max(300).describe("serial:<port>, tcp:<host>:<port>, or mock"),
        baud: z.number().int().positive().max(4000000).optional().describe("Serial baud rate, only if find_adapter reported one other than 38400"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ connection, baud }) => {
      const spec = connection.trim();
      const notAllowed = sessionConnectionError(spec);
      if (notAllowed) return fail(new Error(`Not switched: ${notAllowed}. The previous connection is still in use.`));
      let next: { transport: Transport; mock: boolean };
      try {
        next = (deps.connect ?? defaultConnect)(spec, baud);
      } catch (err) {
        return fail(err);
      }
      const candidate = new Elm327(next.transport);
      let identity: string;
      try {
        identity = await candidate.init();
      } catch (err) {
        await candidate.close().catch(() => undefined);
        const error = String(err instanceof Error ? err.message : err);
        const hint = errorHint(error);
        const payload = { error, ...(hint ? { hint } : {}), connected: false, current_connection: session.elm.describe(), note: "The previous connection is still in use." };
        return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], isError: true };
      }
      const previous = session.elm;
      session.elm = candidate;
      session.mock = next.mock;
      await previous.close().catch(() => undefined);
      return wrap({
        connected: true,
        connection: candidate.describe(),
        adapter: identity || null,
        vehicle_communication: "not_checked",
        note: next.mock
          ? "Switched back to the simulated vehicle."
          : `This session now reads the real adapter until the server restarts. To keep it, set Adapter connection to ${spec}${baud ? ` and Baud rate to ${baud}` : ""} in the extension settings. Read-only by default: clearing codes stays disabled.`,
      });
    }
  );

  const readDtcs = async () => {
    try {
      const status = await session.elm.obd("0101", "4101");
      requireBytes(status, 4, "0101");
      const milOn = (status[0] & 0x80) !== 0;
      const count = status[0] & 0x7f;
      let stored: string[] | null = null;
      let pending: string[] | null = null;
      try {
        stored = parseDtcPayload(await session.elm.obd("03", "43"));
      } catch (e) {
        if (!(e instanceof NoDataError)) throw e;
      }
      try {
        pending = parseDtcPayload(await session.elm.obd("07", "47"));
      } catch (e) {
        if (!(e instanceof NoDataError)) throw e;
      }
      if (count > 0 && (!stored || stored.length < count)) {
        throw new Error(`Incomplete stored DTC response: vehicle reports ${count} code(s), received ${stored?.length ?? 0}`);
      }
      const info = codeInfo([...(stored ?? []), ...(pending ?? [])]);
      return wrap({ mil_on: milOn, dtc_count: count, stored_dtcs: stored, pending_dtcs: pending, ...(info ? { code_info: info } : {}) });
    } catch (err) {
      return fail(err);
    }
  };

  server.registerTool(
    "read_dtcs",
    {
      title: "Read trouble codes",
      description: "Read diagnostic trouble codes: stored (confirmed) DTCs, pending DTCs, MIL (check-engine light) state, and DTC count. A null code list means the adapter returned no data, not that there are no codes. code_info tells, for each code, its system and whether SAE or the manufacturer defines its meaning. Use first when a warning light is on.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    readDtcs
  );

  server.registerTool(
    "read_permanent_dtcs",
    {
      title: "Read permanent trouble codes",
      description:
        "Read permanent DTCs (Mode 0A): codes the engine computer keeps after codes are cleared with a scan tool or the battery is disconnected, until its own monitor confirms the fault is gone. Useful to check whether codes were cleared recently, for example before buying a used car. Many vehicles built before about 2010 do not support it: permanent_dtcs is null when the vehicle gives no answer or reports the request unsupported, which is not a confirmed empty list. Read-only; it never clears anything.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      try {
        let permanent: string[] | null = null;
        let note: string | undefined;
        try {
          permanent = parseDtcPayload(await session.elm.obd("0A", "4A"));
        } catch (e) {
          if (e instanceof NoDataError) {
            note = "No answer to Mode 0A: the vehicle may not support permanent codes (common before about 2010), or the ignition is off. This is not a confirmed empty list.";
          } else if (e instanceof Error && /Unexpected response to "0A": 7F\s?0A/i.test(e.message)) {
            note = "The vehicle reported Mode 0A (permanent codes) as unsupported. This is not a confirmed empty list.";
          } else {
            throw e;
          }
        }
        const info = codeInfo(permanent ?? []);
        return wrap({ permanent_dtcs: permanent, ...(info ? { code_info: info } : {}), ...(note ? { note } : {}) });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "read_supported_pids",
    {
      title: "Discover supported live sensors",
      description: "Discover advertised Mode 01 support for this server's live sensors (PID range 01-60). Returns supported_sensor_names for a later read_live_data or read_diagnostic_report call, plus per-sensor supported/not_advertised/unknown states. Partial failures retain earlier results. Support does not guarantee a reading. If no names are supported, do not pass an empty pids array expecting no reads: it selects the defaults. No VIN request or code clearing.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const result = await discoverSupportedPids(session.elm);
      return { ...wrap(result), ...(!result.complete ? { isError: true } : {}) };
    }
  );

  const readLiveData = async ({ pids }: { pids?: string[] }) => {
    const wanted = (pids && pids.length > 0 ? pids : DEFAULT_PIDS).map(p => p.toLowerCase().trim());
    const values: Record<string, { value: number; unit: string } | { error: string }> = {};
    for (const name of wanted) {
      const def = PID_BY_NAME.get(name);
      if (!def) {
        values[name] = { error: `Unknown PID name. Available: ${PIDS.map(p => p.name).join(", ")}` };
        continue;
      }
      try {
        const bytes = await session.elm.obd(`01${def.pid}`, `41${def.pid}`);
        requireBytes(bytes, def.bytes, `01${def.pid}`);
        values[name] = { value: round(def.parse(bytes)), unit: def.unit };
      } catch (err) {
        values[name] = { error: err instanceof NoDataError ? "No data: the PID may be unsupported, the ignition may be off, or the vehicle may not have responded." : String(err instanceof Error ? err.message : err) };
      }
    }
    return wrap({ live_data: values });
  };

  server.registerTool(
    "read_live_data",
    {
      title: "Read live sensor data",
      description: `Read live sensor values (mode 01 PIDs). Omit "pids" for a sensible default set. Available names: ${PIDS.map(p => p.name).join(", ")}.`,
      inputSchema: { pids: z.array(z.string()).optional().describe("PID names to read; omit for the default set") },
      annotations: READ_ONLY,
    },
    readLiveData
  );

  server.registerTool(
    "watch_live_data",
    {
      title: "Watch live sensor data over time",
      description: `Read up to ${WATCH_LIMITS.maxPids} live sensors repeatedly for ${WATCH_LIMITS.minSeconds}-${WATCH_LIMITS.maxSeconds} seconds while the vehicle is parked, to see how values change: for example coolant temperature while the engine warms up, idle rpm stability, or fuel trims. Returns timestamped samples and, per sensor, min, max, first, last and the number of failed reads. Use read_supported_pids first and pass only supported names. Available names: ${PIDS.map(p => p.name).join(", ")}. Read-only; it is not a driving logger.`,
      inputSchema: {
        pids: z.array(z.string()).min(1).max(WATCH_LIMITS.maxPids).describe(`1 to ${WATCH_LIMITS.maxPids} PID names to watch`),
        seconds: z.number().int().min(WATCH_LIMITS.minSeconds).max(WATCH_LIMITS.maxSeconds).optional().describe(`How long to watch, ${WATCH_LIMITS.minSeconds}-${WATCH_LIMITS.maxSeconds} seconds (default 20)`),
        interval_seconds: z.number().int().min(WATCH_LIMITS.minInterval).max(WATCH_LIMITS.maxInterval).optional().describe(`Seconds between samples, ${WATCH_LIMITS.minInterval}-${WATCH_LIMITS.maxInterval} (default 2)`),
      },
      annotations: READ_ONLY,
    },
    async ({ pids, seconds = 20, interval_seconds = 2 }) => {
      const names = [...new Set(pids.map(p => p.toLowerCase().trim()))];
      const unknown = names.filter(name => !PID_BY_NAME.has(name));
      if (unknown.length > 0) {
        return fail(new Error(`Unknown PID name: ${unknown.join(", ")}. Available: ${PIDS.map(p => p.name).join(", ")}`));
      }
      const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
      const now = deps.now ?? (() => Date.now());
      const count = Math.floor(seconds / interval_seconds) + 1;
      const started = now();
      const samples: Array<{ t: number; values: Record<string, number | null> }> = [];
      const errors: Record<string, number> = Object.fromEntries(names.map(name => [name, 0]));
      let stopped: string | undefined;
      for (let i = 0; i < count && !stopped; i++) {
        const target = started + i * interval_seconds * 1000;
        const wait = target - now();
        if (wait > 0) await sleep(wait);
        const values: Record<string, number | null> = {};
        const t = round((now() - started) / 1000);
        for (const name of names) {
          const def = PID_BY_NAME.get(name)!;
          try {
            const bytes = await session.elm.obd(`01${def.pid}`, `41${def.pid}`);
            requireBytes(bytes, def.bytes, `01${def.pid}`);
            values[name] = round(def.parse(bytes));
          } catch (err) {
            values[name] = null;
            errors[name]++;
            // A lost connection will not recover by asking again; stop and return what was read.
            if (!(err instanceof NoDataError) && !(err instanceof Error && /^(Incomplete|Ambiguous) response/.test(err.message))) {
              stopped = String(err instanceof Error ? err.message : err);
              break;
            }
          }
        }
        samples.push({ t, values });
      }
      const summary: Record<string, { unit: string; min: number | null; max: number | null; first: number | null; last: number | null; readings: number; failed: number }> = {};
      for (const name of names) {
        const series = samples.map(s => s.values[name]).filter((v): v is number => typeof v === "number");
        summary[name] = {
          unit: PID_BY_NAME.get(name)!.unit,
          min: series.length ? Math.min(...series) : null,
          max: series.length ? Math.max(...series) : null,
          first: series.length ? series[0] : null,
          last: series.length ? series[series.length - 1] : null,
          readings: series.length,
          failed: errors[name],
        };
      }
      return wrap({
        interval_seconds,
        samples,
        summary,
        ...(stopped ? { stopped_early: stopped } : {}),
        note: "Values are read one sensor at a time, so each sample spans a short moment. null means no data for that read. Read only while parked.",
      });
    }
  );

  const readFreezeFrame = async () => {
    try {
      const dtcBytes = await session.elm.obd("020200", "420200");
      requireBytes(dtcBytes, 2, "020200");
      const dtc = dtcBytes.length >= 2 ? decodeDtcPair(dtcBytes[0], dtcBytes[1]) : null;
      if (!dtc) return wrap({ freeze_frame: null, note: "No freeze frame stored." });
      const conditions: Record<string, { value: number; unit: string }> = {};
      for (const name of FREEZE_PIDS) {
        const def = PID_BY_NAME.get(name)!;
        try {
          const bytes = await session.elm.obd(`02${def.pid}00`, `42${def.pid}00`);
          requireBytes(bytes, def.bytes, `02${def.pid}00`);
          conditions[name] = { value: round(def.parse(bytes)), unit: def.unit };
        } catch (err) {
          if (!(err instanceof NoDataError)) throw err;
        }
      }
      const info = codeInfo([dtc]);
      return wrap({ freeze_frame: { dtc, conditions }, ...(info ? { code_info: info } : {}) });
    } catch (err) {
      if (err instanceof NoDataError) return wrap({ freeze_frame: null, note: "Freeze frame unavailable: the vehicle returned no data; this does not confirm that no frame is stored." });
      return fail(err);
    }
  };

  server.registerTool(
    "read_freeze_frame",
    {
      title: "Read freeze frame",
      description: "Read the freeze frame (frame 0): the DTC that froze it plus engine conditions captured at the moment the fault set. Read this BEFORE clearing codes — clearing erases it.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    readFreezeFrame
  );

  const readReadiness = async () => {
    try {
      const b = await session.elm.obd("0101", "4101");
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
      const states = Object.entries(monitors);
      const supported = states.filter(([, state]) => state !== "not_supported");
      return wrap({
        mil_on: (b[0] & 0x80) !== 0,
        readiness_monitors: monitors,
        supported_count: supported.length,
        complete_count: supported.filter(([, state]) => state === "complete").length,
        incomplete_monitors: supported.filter(([, state]) => state === "incomplete").map(([name]) => name),
      });
    } catch (err) {
      return fail(err);
    }
  };

  server.registerTool(
    "read_readiness",
    {
      title: "Read readiness monitors",
      description: "Read readiness monitors (emissions self-tests): which monitors this vehicle supports and whether each has completed, with supported_count, complete_count and the incomplete_monitors list. Monitors reported as not_supported do not apply to the vehicle. Clearing codes or disconnecting the battery resets monitors; they complete again after enough driving, and some vehicles normally leave one (often EVAP) incomplete. Useful when preparing for an emissions inspection or checking a used car; this result alone does not determine whether the vehicle will pass.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    readReadiness
  );

  server.registerTool(
    "read_diagnostic_report",
    {
      title: "Collect diagnostic evidence report",
      description: `Collect stored/pending codes, freeze frame, live data and readiness into one timestamped evidence record for a workshop discussion. Optionally select live sensor names with pids; omit or pass an empty list for the defaults. Available names: ${PIDS.map(p => p.name).join(", ")}. Readings are collected sequentially. Preserve each section's errors and unknown values when summarizing. VIN is not requested and codes are not cleared. The result contains observations, not a diagnosis.`,
      inputSchema: { pids: z.array(z.string()).optional().describe("Live PID names to read; omit or pass an empty list for the default set") },
      annotations: READ_ONLY,
    },
    async ({ pids }) => {
      const startedAt = new Date().toISOString();
      const sections: Record<string, {
        collected_at: string;
        is_error: boolean;
        data: Record<string, unknown>;
      }> = {};
      const readers = [
        ["read_dtcs", readDtcs],
        ["read_freeze_frame", readFreezeFrame],
        ["read_live_data", () => readLiveData({ pids })],
        ["read_readiness", readReadiness],
      ] as const;
      for (const [name, read] of readers) {
        const result = await read();
        const data: Record<string, unknown> = JSON.parse(result.content[0].text);
        // Source can contain the local serial path or adapter's network address.
        // Keep it out of a report intended for sharing with a workshop.
        delete data.source;
        sections[name] = {
          collected_at: new Date().toISOString(),
          is_error: "isError" in result && result.isError === true,
          data,
        };
      }
      const report = {
        schema_version: 1,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        simulated: session.mock,
        sections,
        notes: [
          "Collection times describe this read session. Freeze-frame values were recorded earlier by the vehicle; live values are read sequentially.",
          "Keep null values, section errors and per-sensor errors as unknown or unavailable. A trouble code alone does not identify a failed part.",
        ],
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
        structuredContent: report,
      };
    }
  );

  server.registerTool(
    "read_vin",
    {
      title: "Read VIN",
      description: "Read the Vehicle Identification Number (VIN) from the ECU (mode 09 PID 02). A VIN identifies the vehicle; remove it before sharing results publicly.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const bytes = await session.elm.obd("0902", "4902");
        requireBytes(bytes, 18, "0902");
        // Accept the supported CAN-formatted VIN response only. Dropping bytes or
        // taking the last 17 characters can turn a mixed response into a false VIN.
        if (bytes.length !== 18 || bytes[0] !== 0x01) throw new Error("Invalid or ambiguous VIN response");
        const vin = String.fromCharCode(...bytes.slice(1));
        if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) throw new Error("Invalid or incomplete VIN response");
        return wrap({ vin });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "clear_dtcs",
    {
      title: "Clear trouble codes (destructive)",
      description: "Clear stored DTCs and turn off the MIL (mode 04). DESTRUCTIVE: also erases freeze frame data and resets readiness monitors, which can make the vehicle fail an emissions inspection until drive cycles complete. Read read_dtcs and read_freeze_frame first, and only call this with confirm=true after the user explicitly agrees.",
      inputSchema: { confirm: z.boolean().describe("Must be true. Confirms the user understands freeze frame data will be lost and readiness monitors reset.") },
      annotations: DESTRUCTIVE,
    },
    async ({ confirm }) => {
      if (!confirm) {
        return fail(
          "Not cleared. Set confirm=true only after the user explicitly confirms — clearing erases freeze frame evidence and resets readiness monitors."
        );
      }
      if (!session.mock && process.env.OBD2MCP_ENABLE_CLEAR !== "1") {
        return fail("Clearing real vehicle codes is disabled. Enable OBD2MCP_ENABLE_CLEAR=1 only after reviewing the risks and obtaining explicit user consent.");
      }
      if (!session.mock) {
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
        await session.elm.obd("04", "44");
        return wrap({ cleared: true, note: "DTCs cleared, MIL reset. Readiness monitors will read incomplete until drive cycles complete." });
      } catch (err) {
        return fail(err);
      }
    }
  );

  registerPrompts(server);
  return server;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function requireBytes(bytes: number[], count: number, command: string): void {
  if (bytes.length < count) throw new Error(`Incomplete response to "${command}": expected ${count} bytes, got ${bytes.length}`);
  if (command !== "0902" && bytes.length !== count) throw new Error(`Ambiguous response to "${command}": expected ${count} bytes, got ${bytes.length}`);
}
