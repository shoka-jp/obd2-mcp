import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Guided prompts for people who do not know which tool to call. Clients show
 * them as menu entries (Claude Desktop) or slash commands (Claude Code). They
 * only produce instructions; every vehicle access still goes through the tools.
 */

const SHARED_RULES = [
  "Treat tool results as observations, not a diagnosis. Say when a value is missing, unknown or an error, and never present it as a clean result.",
  "If a result has simulated: true, say clearly that it comes from the mock vehicle, not the user's car.",
  "Do not call clear_dtcs, and do not suggest clearing codes: that erases freeze-frame evidence and resets readiness monitors.",
  "Do not request the VIN.",
];

const optionalText = (description: string) => z.string().max(2000).optional().describe(description);

const languageArg = optionalText('Reply language, for example "Japanese" or "日本語". Omit to use the language of the conversation.');

function compose(steps: string[], language: string | undefined, extra: string[] = []): string {
  const lines = [...steps.map((step, i) => `${i + 1}. ${step}`), "", "Rules:", ...[...SHARED_RULES, ...extra].map(rule => `- ${rule}`)];
  const reply = language?.trim() ? `Write your reply in ${language.trim()}.` : "Reply in the language of this conversation.";
  return [...lines, "", reply].join("\n");
}

function reported(symptoms: string | undefined): string {
  const text = symptoms?.trim();
  return text
    ? `The user reports (their words, not verified by the vehicle):\n"""\n${text}\n"""`
    : "The user has not described symptoms. Ask for them briefly only if they would change what to check.";
}

const message = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "check_engine_light",
    {
      title: "Investigate a warning light",
      description: "Read the car's codes, freeze frame, live data and readiness, explain them in plain words and list what to check before spending money.",
      argsSchema: { symptoms: optionalText("What you noticed, e.g. 'light came on after refuelling, car drives normally'."), language: languageArg },
    },
    ({ symptoms, language }) =>
      message(
        [
          "Help me understand why my check-engine (MIL) light is on, using the obd2 tools.",
          "",
          reported(symptoms),
          "",
          compose(
            [
              "Call read_diagnostic_report with no arguments.",
              "For each stored or pending code, explain in plain words what the system monitors and what commonly sets it, without naming a single cause as certain.",
              "Summarize the freeze frame (conditions when the code was set) separately from current live readings, and mention readiness monitors that are not complete.",
              "List inexpensive checks in a sensible order (for example a loose fuel cap for an EVAP code), then what to tell a workshop. Separate what the vehicle reported from the user's description.",
              "End with what additional evidence would narrow it down.",
            ],
            language,
            [
              "If the MIL is flashing, or the user mentions overheating, smoke, a fuel smell, brake or steering problems, or loss of power, put a clear warning first: stop driving when safe and arrange an inspection.",
            ]
          ),
        ].join("\n")
      )
  );

  server.registerPrompt(
    "workshop_handover",
    {
      title: "Prepare a workshop handover note",
      description: "Collect a timestamped diagnostic report and turn it into a concise note to share with a mechanic, with unknowns and errors kept visible.",
      argsSchema: { symptoms: optionalText("Symptoms to include as reported by the driver."), language: languageArg },
    },
    ({ symptoms, language }) =>
      message(
        [
          "Prepare a handover note for a workshop from my car's OBD-II data.",
          "",
          reported(symptoms),
          "",
          compose(
            [
              "Call read_diagnostic_report with no arguments.",
              "Write the note with these sections: collection time and data source; driver-reported symptoms (quoted, marked as reported); stored and pending codes with MIL state; freeze frame; live readings; readiness monitors; values that were unavailable, unknown or failed, with the error text; questions for the workshop.",
              "Keep freeze-frame values separate from live readings and keep the original units.",
              "Keep it short enough to read at the counter. Do not add a diagnosis or repair recommendation.",
            ],
            language,
            ["Leave out the VIN, names, contact details, licence plates and private network addresses. Adapter error text can contain device details; shorten it if it is not useful to the mechanic."]
          ),
        ].join("\n")
      )
  );

  server.registerPrompt(
    "connect_adapter",
    {
      title: "Set up a real OBD-II adapter",
      description: "Find the connection value for a USB, Bluetooth or WiFi ELM327 adapter, explain how to apply it, and check the connection afterwards.",
      argsSchema: { adapter: optionalText("Adapter type or model if known, e.g. 'USB', 'Bluetooth', 'WiFi' or the product name."), language: languageArg },
    },
    ({ adapter, language }) =>
      message(
        [
          "Help me connect obd2-mcp to my real ELM327 adapter.",
          adapter?.trim() ? `\nMy adapter: ${adapter.trim()}` : "",
          "",
          compose(
            [
              "Call connection_status to see the current connection. If it starts with mock, the simulated vehicle is in use.",
              "For a USB or Bluetooth adapter, call list_serial_ports. Point out likely candidates (for example a known USB-serial chip or a Bluetooth serial port), and suggest unplugging or unpairing the adapter and listing again if it is unclear. A Bluetooth adapter must be paired in the operating system first.",
              "For a WiFi adapter, explain that the computer must join the adapter's WiFi network and that the value is usually tcp:192.168.0.10:35000; check the adapter's manual.",
              "Explain how to apply the value: in the Claude Desktop extension settings, set Adapter connection; in other clients, set the environment variable OBD2MCP_CONNECTION (for example claude mcp add obd2 --env OBD2MCP_CONNECTION=serial:COM3 -- ...), then restart the client or server.",
              "After the restart, call connection_status, then read_supported_pids, and explain the results. An adapter reply alone does not prove vehicle communication.",
            ],
            language,
            ["Ask the user to work with the vehicle safely parked, ignition on, and the engine off or idling outdoors."]
          ),
        ].join("\n")
      )
  );
}
