import { readFile } from "node:fs/promises";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PIDS, PID_BY_NAME, DEFAULT_PIDS, FREEZE_PIDS } from "./pids.js";
import { MOCK_SCENARIOS } from "./mock.js";
import { describeDtc } from "./dtc-info.js";

/**
 * MCP resources: reference material a user can attach to a conversation
 * (Claude Desktop lists them under the extension), plus the latest report
 * from this session. Resources never contact the adapter or the vehicle.
 */

/** What the server remembers during this session, for the report and code resources. */
export interface SessionRecord {
  latestReport: Record<string, unknown> | null;
  seenCodes: Set<string>;
}

const GUIDES = [
  {
    name: "adapter-guide",
    uri: "obd2://guide/adapters",
    file: "adapters.md",
    title: "Choosing and plugging in an adapter",
    description: "Which ELM327 adapters work on a computer (USB, classic Bluetooth, WiFi; not Bluetooth LE only), where the OBD-II port is, and unplugging it afterwards. English and Japanese.",
  },
  {
    name: "troubleshooting-guide",
    uri: "obd2://guide/troubleshooting",
    file: "troubleshooting.md",
    title: "Troubleshooting a connection",
    description: "What to try when the adapter or the car does not answer. English and Japanese.",
  },
  {
    name: "used-car-guide",
    uri: "obd2://guide/used-car-check",
    file: "used-car-check.md",
    title: "Checking a used car",
    description: "How to use the used_car_check prompt at a viewing, and what cleared-code signs mean. English and Japanese.",
  },
] as const;

const SCENARIOS: Record<string, string> = {
  catalyst: "P0420 (catalyst efficiency) with the warning light on. The default.",
  healthy: "No codes, warning light off, all monitors complete.",
  misfire: "P0301 (cylinder 1 misfire) with the warning light on.",
  lean: "P0171 (system too lean, bank 1) with high fuel trims.",
  evap: "P0456 (small EVAP leak).",
  cleared: "Codes cleared recently: no stored codes and the light off, but a permanent P0420 and incomplete monitors.",
  partial: "P0128 with coolant at 72 °C, five unsupported sensors and no freeze frame.",
};

const SCENARIO_NOTE = "Synthetic examples for trying the tools without a car, not diagnoses.";

function json(uri: string, data: unknown) {
  return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] };
}

function sensorInfo(name: string) {
  const def = PID_BY_NAME.get(name);
  if (!def) return null;
  return {
    name: def.name,
    pid: `01 ${def.pid}`,
    description: def.desc,
    unit: def.unit,
    in_default_set: DEFAULT_PIDS.includes(def.name),
    in_freeze_frame: FREEZE_PIDS.includes(def.name),
  };
}

const startsWith = (options: Iterable<string>, value: string) =>
  [...options].filter(option => option.toLowerCase().startsWith(value.trim().toLowerCase())).slice(0, 100);

export function registerResources(server: McpServer, record: SessionRecord): void {
  for (const guide of GUIDES) {
    server.registerResource(
      guide.name,
      guide.uri,
      { title: guide.title, description: guide.description, mimeType: "text/markdown" },
      async uri => ({
        contents: [{
          uri: uri.href,
          mimeType: "text/markdown",
          text: await readFile(new URL(`../docs/${guide.file}`, import.meta.url), "utf8"),
        }],
      })
    );
  }

  server.registerResource(
    "sensors",
    "obd2://sensors",
    {
      title: "Live sensors this server can read",
      description: "Every live sensor name for read_live_data and watch_live_data, with its Mode 01 PID, unit, and whether it is in the default set or the freeze frame. A car supports only some of them; read_supported_pids tells which.",
      mimeType: "application/json",
    },
    async uri => json(uri.href, { sensors: PIDS.map(p => sensorInfo(p.name)) })
  );

  server.registerResource(
    "mock-scenarios",
    "obd2://scenarios",
    {
      title: "Simulated vehicle scenarios",
      description: "The mock scenarios for trying obd2-mcp without a car (Mock scenario setting or OBD2MCP_MOCK_SCENARIO).",
      mimeType: "application/json",
    },
    async uri => json(uri.href, {
      scenarios: MOCK_SCENARIOS.map(name => ({ name, description: SCENARIOS[name] ?? "" })),
      note: SCENARIO_NOTE,
    })
  );

  server.registerResource(
    "latest-report",
    "obd2://report/latest",
    {
      title: "Latest diagnostic report",
      description: "The most recent read_diagnostic_report from this session, without the adapter's port or address, ready to attach or save for a workshop. Empty until a report is collected; cleared when the server restarts.",
      mimeType: "application/json",
    },
    async uri => json(uri.href, record.latestReport ?? {
      available: false,
      note: "No diagnostic report has been collected since the server started. Ask Claude to collect one (read_diagnostic_report) first.",
    })
  );

  server.registerResource(
    "trouble-code",
    new ResourceTemplate("obd2://code/{code}", {
      list: undefined,
      complete: { code: value => startsWith(record.seenCodes, value.toUpperCase()) },
    }),
    {
      title: "Trouble code structure",
      description: "What the format of a trouble code says: its system and whether SAE (the same on every make) or the manufacturer defines its meaning. No meanings are bundled. Completion suggests codes read in this session.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const code = String(variables.code ?? "").toUpperCase();
      const info = describeDtc(code);
      if (!info) {
        return json(uri.href, { code, valid: false, note: "Not a trouble code. Codes look like P0420: a letter P, C, B or U, then four characters." });
      }
      return json(uri.href, {
        code,
        valid: true,
        ...info,
        read_in_this_session: record.seenCodes.has(code),
        guidance: info.definition === "sae"
          ? "SAE defines this code, so its general meaning is the same on every make. A code points to a system or condition, not to a part that must be replaced."
          : "The meaning depends on the make (and sometimes the model year). Check the manufacturer's information or ask a workshop rather than relying on a generic list.",
      });
    }
  );

  server.registerResource(
    "sensor",
    new ResourceTemplate("obd2://sensor/{name}", {
      list: undefined,
      complete: { name: value => startsWith(PIDS.map(p => p.name), value) },
    }),
    {
      title: "Live sensor details",
      description: "One live sensor's Mode 01 PID, unit and description. Completion suggests sensor names.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const name = String(variables.name ?? "").toLowerCase();
      return json(uri.href, sensorInfo(name) ?? {
        name,
        valid: false,
        note: `Unknown sensor. Available: ${PIDS.map(p => p.name).join(", ")}`,
      });
    }
  );
}
