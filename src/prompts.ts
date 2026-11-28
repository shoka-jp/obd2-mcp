import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";

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

const LANGUAGES = ["日本語", "English", "Español", "Português", "Français", "Deutsch", "中文", "한국어"];

/** Suggested in clients that support argument completion; any language name is accepted. */
const languageArg = completable(
  optionalText('Reply language, for example "Japanese" or "日本語". Omit to use the language of the conversation.'),
  value => LANGUAGES.filter(name => name.toLowerCase().startsWith((value ?? "").trim().toLowerCase()))
);

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
              "Call read_diagnostic_report with no arguments, then format_diagnostic_report (language ja if the reply is in Japanese, otherwise en) and give its text to the user unchanged as the report to hand over.",
              "Then add a short covering note with these sections: collection time and data source; driver-reported symptoms (quoted, marked as reported); stored, pending and permanent codes with MIL state; freeze frame; live readings; readiness monitors; values that were unavailable, unknown or failed, with the error text; questions for the workshop.",
              "Keep freeze-frame values separate from live readings and keep the original units.",
              "Keep the covering note short enough to read at the counter. Do not add a diagnosis or repair recommendation, and do not edit the formatted report.",
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
      description: "Connect a real USB, Bluetooth or WiFi ELM327 adapter step by step without asking for a port name: find it, connect after asking, check that it answers, and explain how to keep the setting.",
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
              "Assume the user is not technical: do not ask for a port name, and explain each step in plain words.",
              "For a USB or Bluetooth adapter, call find_adapter. A Bluetooth adapter must be paired in the operating system first, and the adapter must be plugged into the car with the ignition on. If it finds an adapter, ask the user, then call use_adapter with that connection value (and baud if reported). If it finds none, follow its next_step; list_serial_ports shows every port if needed.",
              "For a WiFi adapter, ask the user to join the adapter's WiFi network first (often named OBDII; the internet may drop while connected), then call use_adapter with tcp:192.168.0.10:35000, or the address in the adapter's manual.",
              "After use_adapter succeeds, call read_supported_pids and explain the results. An adapter reply alone does not prove vehicle communication.",
              "Explain that this connection lasts until the extension or client restarts. To keep it, set Adapter connection in the Claude Desktop extension settings to the same value; in other clients, set OBD2MCP_CONNECTION (for example claude mcp add obd2 --env OBD2MCP_CONNECTION=serial:COM3 -- ...).",
            ],
            language,
            ["Ask the user to work with the vehicle safely parked, ignition on, and the engine off or idling outdoors."]
          ),
        ].join("\n")
      )
  );

  server.registerPrompt(
    "used_car_check",
    {
      title: "Check a used car before buying",
      description: "With the seller's permission, read codes, permanent codes and readiness monitors, point out signs that codes were cleared recently, and list questions for the seller and a pre-purchase inspection.",
      argsSchema: {
        notes: optionalText("What the listing or seller says, e.g. 'no warning lights, battery replaced last week'."),
        language: languageArg,
      },
    },
    ({ notes, language }) =>
      message(
        [
          "Help me check a used car I am thinking of buying, using the obd2 tools.",
          "",
          notes?.trim()
            ? `What the listing or seller says (their words, not verified by the vehicle):\n"""\n${notes.trim()}\n"""`
            : "I have not shared what the seller says. Ask only if it would change what to check.",
          "",
          compose(
            [
              "Before reading anything, confirm that the seller has agreed to the scan and that the car is parked with the ignition on (engine idling outdoors is fine). Readings are only taken while parked.",
              "Call read_diagnostic_report with no arguments. It includes permanent codes (read_permanent_dtcs).",
              "Call read_supported_pids. Read whichever of warmups_since_clear, distance_since_clear, time_since_clear, distance_with_mil, time_with_mil and run_time it lists, with one read_live_data call. warmups_since_clear, distance_since_clear and time_since_clear count engine warm-ups, kilometres and engine-running minutes since trouble codes were last cleared (by a scan tool, and on many cars also by a battery disconnect); distance_with_mil and time_with_mil are the distance and engine-running minutes with the warning light on; run_time is how long the engine has been running since it was started.",
              "Report stored and pending codes, the MIL state, permanent codes and readiness monitors. Keep the freeze frame separate from live readings. Monitors reported as not_supported do not apply to this car and are not a problem.",
              "Look for signs that codes were cleared recently: few warm-ups, little distance or little time since codes were cleared (the most direct clue, if supported), no stored codes while permanent codes remain, or several readiness monitors incomplete. Interpret them carefully. A battery replacement or disconnect, or a recent repair, also clears stored codes and resets monitors, so incomplete monitors alone are not suspicious; some cars normally leave one monitor, often EVAP, incomplete. A permanent code, however, survives a battery disconnect and a scan-tool clear: it means the car detected that fault and has not yet confirmed it is fixed, either because it was not repaired or because it was repaired recently and the car has not yet completed the driving needed to confirm it. Ask for repair records for that system (for P0420, the catalyst). Present all of this as questions for the seller, not as proof of concealment. A null permanent-code list means the car did not answer or does not support it (common before about 2010), not that there are none.",
              "Suggest reading again after the test drive, once parked: call read_diagnostic_report with no arguments, then compare_diagnostic_reports to see what changed since the first report, including permanent codes. A pending code that appears, or monitors that complete, add evidence; one drive may not complete every monitor.",
              "Reply with a short summary first, readable on site, then questions to ask the seller, then what a professional pre-purchase inspection should check. Say clearly that a scan without codes is not a clean bill of health, because many mechanical faults never set a code.",
            ],
            language,
            [
              "Only read data with the seller's permission. Never clear codes on a car you do not own, and do not suggest it.",
              "Do not estimate the car's value or tell the user whether to buy it; give them the evidence and questions to decide.",
            ]
          ),
        ].join("\n")
      )
  );

  server.registerPrompt(
    "inspection_check",
    {
      title: "Check before an emissions inspection",
      description: "Before an emissions (smog) inspection, or after a repair or battery change: read the warning light, codes, permanent codes and readiness monitors, explain what usually makes the OBD part of an inspection fail, and what to do next. Rules differ by region; this does not replace the inspection.",
      argsSchema: {
        vehicle: optionalText("Model year, fuel and where the inspection is, e.g. '2015 gasoline, California' or '2022年式 ガソリン車 日本'."),
        language: languageArg,
      },
    },
    ({ vehicle, language }) =>
      message(
        [
          "Help me check whether my car is ready for an emissions inspection, using the obd2 tools.",
          "",
          vehicle?.trim()
            ? `About the car (the user's words, not verified by the vehicle):\n"""\n${vehicle.trim()}\n"""`
            : "I have not said the model year, fuel or region. Ask only if the answer would change, for example when one or two monitors are incomplete.",
          "",
          compose(
            [
              "Confirm the car is parked with the ignition on (engine idling outdoors is fine). Readings are only taken while parked.",
              "Call read_dtcs, read_readiness and read_permanent_dtcs. Then call read_supported_pids and, if it lists warmups_since_clear and distance_since_clear, read them with read_live_data: they show how long ago codes were last cleared (by a scan tool, a battery disconnect or a repair).",
              "Report the warning light (MIL) state; stored, pending and permanent codes; and the readiness monitors as complete, incomplete or not_supported. Monitors reported as not_supported do not apply to this car and never count against it.",
              "Explain the usual OBD criteria, as typical rules rather than this car's verdict. US programs following EPA guidance fail a car when the warning light is commanded on, and when too many monitors are incomplete: model years 1996 to 2000 may have up to two incomplete monitors, 2001 and newer up to one. Diesel vehicles and some states are stricter: for example, California allows only the EVAP monitor to be incomplete on 2000 and newer gasoline cars and also fails 2010 and newer cars that report a permanent code, and Oregon does not accept an incomplete catalyst or EVAP monitor. The local inspection program sets the actual rules; suggest checking its website.",
              "If monitors are incomplete after a battery change, a repair or a code clear, explain that they complete by themselves with normal driving, usually within days to a couple of weeks, often needing a mix of city and highway driving and an overnight cool-down; diesel monitors can take much longer. The exact conditions differ by manufacturer (the owner's manual or a workshop can say), so suggest driving normally and checking again with read_readiness before the inspection. If warmups_since_clear and distance_since_clear are small, say that this is why monitors are not ready yet.",
              "If there is a pending code, explain it may become a stored code and turn the warning light on, so it is worth having it looked at before the inspection. If there is a permanent code, explain that it clears only after the car confirms the repair during normal driving.",
              "If the car is in Japan: explain that the OBD inspection in 車検 (for new domestic models introduced from October 2021, and imported models from October 2022) uses an official scan tool and a server check for manufacturer-defined \"specific DTCs\" in safety systems such as driver assistance and brakes. This tool cannot read those, so a clean result here does not guarantee passing; it still shows the engine warning light and emissions-related codes.",
              "Reply with a short summary first: likely ready, not ready yet (wait and drive), or needs a repair first, framed as an estimate from the readings and not a promise. Then list the next steps.",
            ],
            language,
            [
              "Never suggest clearing codes, disconnecting the battery, or any other way to hide a fault before an inspection: it resets readiness monitors, makes the car fail the readiness check, and tampering with emissions controls can be illegal.",
              "Do not promise that the car will pass.",
            ]
          ),
        ].join("\n")
      )
  );

  server.registerPrompt(
    "after_repair_check",
    {
      title: "Check after a repair",
      description: "After a repair or a part replacement: read codes, permanent codes and readiness monitors, compare with a report from before the repair if there is one, and explain whether the fault has shown up again and what driving is still needed to confirm the fix.",
      argsSchema: {
        repair: optionalText("What was repaired and when, e.g. 'catalytic converter replaced for P0420 last Tuesday'."),
        language: languageArg,
      },
    },
    ({ repair, language }) =>
      message(
        [
          "Help me check my car after a repair, using the obd2 tools.",
          "",
          repair?.trim()
            ? `About the repair (the user's words, not verified by the vehicle):\n"""\n${repair.trim()}\n"""`
            : "I have not said what was repaired. Ask which code or problem the repair was for, because the answer depends on it.",
          "",
          compose(
            [
              "Confirm the car is parked with the ignition on (engine idling outdoors is fine). Readings are only taken while parked.",
              "Call read_diagnostic_report with no arguments; it includes permanent codes (read_permanent_dtcs). Call read_supported_pids and, if it lists warmups_since_clear and distance_since_clear, read them with read_live_data: they show how much driving has happened since codes were cleared, which a workshop usually does after a repair.",
              "If this session already has a report from before the repair, call compare_diagnostic_reports. If the user saved a report before the repair (from obd2://report/latest), ask them to attach or paste it and pass it unchanged as earlier_report_json. Otherwise work from the current readings alone and say so.",
              "For the code or system the repair was about, explain what the readings show: not stored and not pending means no current sign of that fault; a pending code means the car detected it again during recent driving but has not confirmed it; a stored code or the warning light on means the fault was confirmed again. A permanent code that is still there means the car has not yet finished the driving needed to confirm the repair by itself; it is not a sign that the repair failed. Incomplete readiness monitors are normal after a repair, because clearing codes or disconnecting the battery resets them.",
              "Explain that the monitor for that system has to run and pass before the fix is confirmed: drive normally for some days, often a mix of city and highway driving with an overnight cool-down; the exact conditions differ by manufacturer. Suggest checking again then, and saving this report now (obd2://report/latest) to compare next time.",
              "Reply with a short summary first: no sign of the fault so far, the fix is not confirmed yet, or the fault was detected again, framed as what the readings show and not a verdict on the repair. Then the next steps. If the fault was detected again, list what to tell the workshop: the code, whether it is pending or stored, the freeze frame, and the driving since the repair.",
            ],
            language,
            [
              "Do not judge the workshop or say the repair was done badly; a code can return for other reasons, and the workshop should look at it.",
              "Do not say the repair definitely worked: a code may take several drives to return.",
            ]
          ),
        ].join("\n")
      )
  );
}
