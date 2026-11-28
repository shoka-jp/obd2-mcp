# obd2-mcp

**[See actual mock output and run the demo without an AI client](./docs/demo-results.md).**

**New here? [Try the step-by-step mock demo — no car required](./docs/try-mock.md).**

**Want to contribute?** [Find a first issue](https://github.com/shoka-jp/obd2-mcp/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22) or read the [contribution guide](./CONTRIBUTING.md). Documentation, tests and questions are welcome in English or Japanese. [Share first-use feedback](https://github.com/shoka-jp/obd2-mcp/issues/new?template=first-experience.yml) (a public GitHub issue).

**English** | [日本語](./README.ja.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Mock and package checks](https://github.com/shoka-jp/obd2-mcp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/shoka-jp/obd2-mcp/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/shoka-jp/obd2-mcp)](https://github.com/shoka-jp/obd2-mcp/releases/latest)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.shoka--jp%2Fobd2--mcp-4b7bec)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.shoka-jp/obd2-mcp)
[![Claude Desktop extension](https://img.shields.io/badge/Claude_Desktop-one--file_extension_%28.mcpb%29-d97757)](https://github.com/shoka-jp/obd2-mcp/releases/latest)

An MCP server that lets AI assistants read your car's OBD-II data through cheap ELM327 adapters — trouble codes, live sensors, freeze frame, readiness monitors, and VIN.

![Three steps: install with the Claude Desktop extension or npx, try the simulated car with the check_engine_light prompt, then plug in your adapter, turn the ignition on and ask Claude to connect. It starts with mock data, reads only by default, and code clearing is off for real cars.](docs/images/get-started-en.svg)

**Try it without an AI client or car:** with Node.js 22 or 24 and npm installed, run this in a terminal. npm downloads the built package and its dependencies; Git and a local build are not needed.

```bash
npm exec --yes --package=https://github.com/shoka-jp/obd2-mcp/releases/download/v0.8.0/obd2-mcp-0.8.0.tgz -- obd2-mcp --demo --summary
```

The command uses the package attached to this repository's [v0.8.0 release](https://github.com/shoka-jp/obd2-mcp/releases/tag/v0.8.0). It prints simulated observations and exits. [See the output and what to check next](./docs/demo-results.md).

**Example from the mock vehicle:** stored code `P0420`; freeze frame at 98 km/h and 2,210 rpm; current reading 0 km/h and 740 rpm. These are simulated observations, not a diagnosis. [See the captured results and their limits](./docs/demo-results.md#observed-output--実際に取得した結果).

For the complete tool responses, remove `--summary`. Add `--lang ja` for the Japanese summary. To develop or connect an MCP client from source, follow the quick start below.

Ask Claude *"why is my check-engine light on?"* and it reads the actual codes from your actual car, pulls the freeze frame before anything gets erased, checks the fuel trims, and reasons about causes — instead of you transcribing scanner output by hand.

**No hardware? It still works.** A built-in mock vehicle (a warm idling sedan with a stored P0420, MIL on, and realistic live data) lets you try everything before buying an adapter.

## Choose how to start

| You want to… | Start here | You need |
|---|---|---|
| See what it returns, without an AI client or a car | The demo command above | Node.js 22 or 24 |
| Use it in Claude Desktop | [Install the `.mcpb` extension](#claude-desktop-install-as-an-extension) | Claude Desktop |
| Use it in Claude Code or another MCP client | [Register the release package with `npx`](#without-git-or-a-build) | Node.js 22 or 24 |
| Check a used car before buying | The [`used_car_check` prompt and walkthrough](./docs/used-car-check.md); try it first with `--demo --summary --scenario cleared` | An ELM327 adapter and the seller's permission |
| Read your own car | Plug in the adapter and ask Claude to connect ([how it works](#connecting-a-real-car)), then [troubleshooting](./docs/troubleshooting.md) if needed | A USB, Bluetooth (serial) or WiFi ELM327 adapter ([which kind to buy](./docs/adapters.md)) |
| Change the code or contribute | [Build from source](#from-source) and the [contribution guide](./CONTRIBUTING.md) | Git and Node.js |

Every path starts with the simulated vehicle, so you can check the setup before connecting a car. In your MCP client, the [guided prompts](#guided-prompts) such as `check_engine_light` are an easy first question.

obd2-mcp is listed in the [official MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.shoka-jp/obd2-mcp) as `io.github.shoka-jp/obd2-mcp`, so MCP clients and directories that read the registry can find each release.

## Claude Desktop: install as an extension

Each [GitHub release](https://github.com/shoka-jp/obd2-mcp/releases/latest) from v0.4.0 includes `obd2-mcp-<version>.mcpb`, a Claude Desktop extension. It needs no Git, build step or JSON editing:

1. Download the `.mcpb` file from the release.
2. Open it with Claude Desktop (double-click it, or install it from **Settings → Extensions**) and confirm the installation.
3. Ask: *"Read my car's trouble codes and tell me what to check before I spend money."* The extension starts with the simulated vehicle.

**To use a real adapter, just ask.** Plug the adapter into the car, turn the ignition on (pair a Bluetooth adapter in the computer's settings first, or join a WiFi adapter's network), and ask: *"Connect to my car's adapter."* Claude finds a USB or Bluetooth adapter with `find_adapter` and, after asking you, connects with `use_adapter`. No port name or restart is needed. This lasts until Claude Desktop restarts; to keep it, set **Adapter connection** in the extension's settings to the value Claude shows (for example `serial:COM3` or `tcp:192.168.0.10:35000`). The extension includes its dependencies and serial-port support for Windows, macOS and Linux. Release checks start it with the mock vehicle on Linux; Windows and macOS installs and real adapters have not been verified.

## Quick start (mock mode — no hardware)

### Without Git or a build

With Node.js 22 or 24 and npm installed, an MCP client can start the v0.8.0 release package directly. First run the demo command near the top of this page once: it downloads the package into npm's cache, so the client's first start does not wait for the download (about 40 seconds in a Windows test).

**Claude Code:**

```bash
claude mcp add obd2 -- npx -y --package=https://github.com/shoka-jp/obd2-mcp/releases/download/v0.8.0/obd2-mcp-0.8.0.tgz obd2-mcp
```

On native Windows, put `cmd /c` before `npx`.

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "obd2": {
      "command": "npx",
      "args": ["-y", "--package=https://github.com/shoka-jp/obd2-mcp/releases/download/v0.8.0/obd2-mcp-0.8.0.tgz", "obd2-mcp"]
    }
  }
}
```

On Windows, use `"command": "cmd"` and start `args` with `"/c", "npx"`. If Claude Desktop cannot find `npx`, use its full path (`which npx` on macOS/Linux, `where npx` on Windows). For a real adapter, add `"env": {"OBD2MCP_CONNECTION": "serial:COM3"}`; see [Connecting a real car](#connecting-a-real-car). The release URL always refers to v0.8.0; change it to upgrade.

### From source

Build from source using Git and Node.js/npm. Verify npm availability before using registry installation.

```bash
git clone https://github.com/shoka-jp/obd2-mcp.git
cd obd2-mcp
npm ci
npm run build
node -p "require('node:path').resolve('dist/index.js')"
```

Replace `/absolute/path/to/obd2-mcp/dist/index.js` below with the absolute path printed by the last command. Windows JSON configuration can use forward slashes.

**Claude Code:**

```bash
claude mcp add obd2 -- node "/absolute/path/to/obd2-mcp/dist/index.js"
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "obd2": {
      "command": "node",
      "args": ["/absolute/path/to/obd2-mcp/dist/index.js"]
    }
  }
}
```

Then ask: *"Read my car's trouble codes and tell me what to check before I spend money."*

### Try another mock scenario

Set `OBD2MCP_MOCK_SCENARIO` in your MCP client configuration while using `OBD2MCP_CONNECTION=mock`. Available values are `catalyst` (default, P0420), `healthy` (no codes), `misfire` (P0301), `lean` (P0171 with elevated bank 1 fuel trims), `evap` (P0456 evaporative emission system small leak), `cleared` (codes cleared recently: nothing stored and the light off, but a permanent P0420 and three incomplete monitors; try it with the `used_car_check` prompt), `partial` (P0128 with coolant at 72 °C, several unsupported sensors, and no freeze frame), and `diesel` (a diesel with P2463, particulate filter soot accumulation, and diesel readiness monitors). These are synthetic teaching examples, not diagnoses or verified vehicle profiles. An unknown scenario stops startup instead of falling back silently. The setting is ignored for real connections.

For example, register a separate Claude Code mock server:

```bash
claude mcp add obd2-lean --env OBD2MCP_CONNECTION=mock --env OBD2MCP_MOCK_SCENARIO=lean -- node "/absolute/path/to/obd2-mcp/dist/index.js"
```

Restart the server after changing the setting. Each server has independent mock state. Clearing a mock scenario resets its readiness monitors (its permanent code stays, as on a real car) and does not affect any vehicle.

To look at a scenario without an MCP client, add `--scenario` to the demo command, for example `obd2-mcp --demo --summary --scenario cleared` (add `--lang ja` for Japanese).

## Connecting a real car

You need an ELM327-compatible USB, Bluetooth-serial, or WiFi adapter plugged into the vehicle's OBD-II port, with the ignition on. Support varies by vehicle, market, protocol, adapter and connection method; this project has not yet verified a real-vehicle or real-adapter combination. Start with read-only checks while parked, and do not assume that an adapter connection confirms vehicle communication. Not every adapter can work with a computer: Bluetooth LE-only models cannot; see [choosing an adapter](./docs/adapters.md).

**The easy way:** ask your MCP client to connect. `find_adapter` checks only ports that look like an adapter (a known USB-serial chip or a Bluetooth serial port), and for a WiFi adapter, once the computer has joined its network, the usual factory addresses; it asks each to identify itself (`ATZ`), without contacting the vehicle; `use_adapter` then switches the session after checking that the adapter answers. For safety, `use_adapter` accepts only serial port names and local-network WiFi addresses, and clearing codes stays disabled.

To set a connection permanently, use the environment variable or CLI flag:

| Adapter | Setting |
|---|---|
| USB / Bluetooth (serial port) | `OBD2MCP_CONNECTION=serial:COM3` (Windows) / `serial:/dev/ttyUSB0` (Linux) / `serial:/dev/tty.usbserial-XXXX` (macOS) |
| WiFi | `OBD2MCP_CONNECTION=tcp:192.168.0.10:35000` |
| Mock (default) | `OBD2MCP_CONNECTION=mock` |

**Find the serial port name.** Ask your MCP client to run `list_serial_ports`, or run `node dist/index.js --list-ports` in a terminal. Both list the ports the operating system reports, with the exact `serial:` value to use, without opening a port or contacting the vehicle. If you are unsure which entry is the adapter, unplug or unpair it and list again. A known USB-serial chip (FTDI, CH340, PL2303 or CP210x) is a hint, not proof that the port is an OBD-II adapter. Listing requires the optional `serialport` dependency; WiFi adapters are not listed.

**Units:** answers and the readable report use metric units by default; set `OBD2MCP_UNITS=imperial` (Claude Desktop: *Units* = `imperial`) for °F, mph, miles and psi. Tool data itself stays metric, so reports and comparisons stay consistent.

Serial baud rate defaults to 38400; override with `OBD2MCP_BAUD=115200` if your adapter needs it. Bluetooth adapters must first be paired at the OS level so they expose a serial port.

A malformed connection, port number or baud rate stops startup with a message naming the setting. Write an IPv6 address in brackets, for example `tcp:[fe80::1]:35000`.

A WiFi adapter that does not accept the connection within 10 seconds returns a timeout error. Check that the computer is on the adapter's network, then ask Claude to reconnect (the `reconnect` tool); no restart is needed.

If the port, pairing, permissions or vehicle replies cause trouble, see [connection troubleshooting](./docs/troubleshooting.md).

**Tried it with a real car?** Please [report your setup](https://github.com/shoka-jp/obd2-mcp/issues/new?template=hardware-report.yml), whether it worked or not. Reports are listed in [reported setups](./docs/compatibility.md); none have been verified by the project yet.

**Quick compatibility check:** with the adapter plugged in and the ignition on, run `obd2-mcp --check` (with the release package: `npm exec --yes --package=<release .tgz URL> -- obd2-mcp --check`; add `--wifi` for a WiFi adapter, or `--connection serial:COM3`). It finds the adapter, runs the read-only reads one by one and prints a summary to paste into the report: adapter, protocol, voltage and a pass/fail line per step, without the VIN, port names or addresses.

Claude Code example with a real adapter:

```bash
claude mcp add obd2 --env OBD2MCP_CONNECTION=serial:COM3 -- node "/absolute/path/to/obd2-mcp/dist/index.js"
```

## Guided prompts

Not sure what to ask? The server provides six ready-made prompts. Claude Desktop lists them in the attachment (+) menu under the server's name, and Claude Code offers them as slash commands such as `/mcp__obd2__check_engine_light`.

| Prompt | What it does |
|---|---|
| `check_engine_light` | Reads the diagnostic report, explains each code in plain words, keeps the freeze frame separate from live readings, and lists inexpensive checks before a workshop visit. Optional: your symptoms and reply language. |
| `workshop_handover` | Turns the diagnostic report into a short note for a mechanic, with unknowns and errors kept visible and the VIN and personal details left out. |
| `inspection_check` | Before an emissions (smog) inspection, or after a repair or battery change: reads the warning light, codes, permanent codes and readiness monitors, explains the usual OBD criteria (for example how many incomplete monitors are typically allowed by model year) as typical rules rather than a verdict, and what to do if monitors are not ready yet. Notes that Japan's 車検 OBD inspection reads manufacturer-defined codes this tool cannot. Never suggests clearing codes. Optional: model year, fuel and region, and reply language. |
| `after_repair_check` | After a repair or a part replacement: reads codes, permanent codes and readiness monitors, compares with a report from before the repair when there is one (`compare_diagnostic_reports`), and explains whether the fault has shown up again, why a remaining permanent code means the fix is not confirmed yet rather than failed, and what driving is still needed. Does not judge the workshop's work. Optional: what was repaired and reply language. |
| `used_car_check` | For a used car you are considering: with the seller's permission, reads codes, permanent codes (`read_permanent_dtcs`) and readiness monitors, points out signs that codes were cleared recently as questions rather than proof, suggests reading again after the test drive, and lists questions for the seller and a pre-purchase inspection. Optional: what the seller says and reply language. [Walkthrough](docs/used-car-check.md) |
| `connect_adapter` | Finds a USB, Bluetooth or WiFi adapter with `find_adapter`, connects with `use_adapter` after asking, checks the connection, and explains how to keep the setting. Written for users who are not technical: it does not ask for a port name. |

The server also sends usage instructions when a client connects, so Claude knows to label mock data, check supported sensors first and leave codes uncleared even without a prompt. The prompts only instruct Claude; every vehicle access still goes through the read-only tools. They tell Claude not to clear codes or request the VIN, and to label mock data and missing values.

## One-call evidence report

With the server configured in your MCP client, ask: **"Run read_diagnostic_report and turn its observations, missing values and errors into a workshop handover note. Keep freeze-frame values separate from live readings."**

`read_diagnostic_report` collects stored, pending and permanent codes, freeze frame, live sensors and readiness in one response, with collection timestamps and structured JSON. It reuses the individual readers and preserves their null values and errors if part of the collection fails. Collection is sequential, so the readings can come from different moments.

To select only the live sensors you need, pass PID **names**, for example `{"pids":["rpm","coolant_temp"]}`. Omit `pids` or pass an empty array to use the same default set as `read_live_data`. An unknown name is retained as a per-sensor error, and other requested sensors are still read. This selection affects live data only; codes, permanent codes, freeze frame and readiness are collected as usual. A car without permanent-code support (common before about 2010) gets `null` there with a note, and the rest of the report is unaffected.

The report does not request VIN or clear codes, and omits the connection source field. Review its contents before sharing, since adapter error text can still contain device details. Save or format the returned report in your MCP client for a workshop discussion; it is not a vehicle-specific diagnosis. To get a readable version to print or send, ask *"Format the report for my mechanic"* (`format_diagnostic_report`, English or Japanese), or attach `obd2://report/latest.md`.

**See what changed.** Collect a report again later, for example after a test drive or a repair, and ask *"Compare it with the previous report."* `compare_diagnostic_reports` lists new and gone codes, the warning light, readiness monitors that completed or were reset, and live values side by side, and points out signs that codes were cleared in between. It uses reports already collected and never contacts the vehicle. To compare across days, set a **report history folder** (Claude Desktop: *Report history folder* in the extension settings; other clients: `OBD2MCP_REPORT_DIR`): reports from your real car are then saved there as JSON and the latest ten come back after a restart, so *"Compare with last week's report"* just works. Reports contain no VIN; reports from the simulated car are not saved. Without a folder, save `obd2://report/latest` and Claude can pass it to the tool as `earlier_report_json`. In the mock, try: collect a report, clear the codes, collect another and compare.

## Discover available live sensors

Ask your MCP client to run `read_supported_pids` before choosing live sensors. It reads the Mode 01 support bitmaps for the `01`–`60` hexadecimal range used by this server, following continuation flags. It returns `supported_sensor_names` for use as the `pids` argument of `read_live_data` or `read_diagnostic_report`.

Each sensor is `supported` (the vehicle advertises support), `not_advertised` (its bit or continuation is absent), or `unknown` (the required reply could not be read). Incomplete discovery returns `complete: false`, a tool error, the successful earlier results and the failed request. `NO DATA`, truncated and ambiguous replies are never treated as proof of no support. Discovery is refreshed on each call and does not read sensor values, request VIN or clear codes.

Use only a **nonempty** list of supported names for the next read: passing `pids: []` still selects the existing default set. Advertised support does not guarantee a reading, and `complete` covers only this stated PID range. This feature has mock/protocol test coverage; real vehicle and adapter compatibility remains unverified.

Protocol references: [ELM327 datasheet, “Talking to the Vehicle”](https://elmelectronics.com/wp-content/uploads/2020/05/ELM327DSL.pdf) and [python-OBD command tables](https://python-obd.readthedocs.io/en/latest/Command%20Tables/).

## Tools

| Tool | What it does |
|---|---|
| `read_supported_pids` | Discover advertised support for this server's live sensors; preserve unknowns and partial failures. |
| `read_diagnostic_report` | Collect a timestamped evidence report from five readers (codes, permanent codes, freeze frame, live data, readiness), optionally selecting live sensors and including unavailable fields and errors. |
| `read_dtcs` | Stored + pending trouble codes, MIL state, DTC count. A code list is `null` when the adapter returns no data; this is not a confirmed empty list. `code_info` tells, for each code, its system and whether SAE or the manufacturer defines its meaning. |
| `read_permanent_dtcs` | Permanent trouble codes (Mode 0A) that stay after codes are cleared until the car confirms the repair: a clue that codes were cleared recently, for example before buying a used car. `null` when the vehicle does not support it (common before about 2010); this is not a confirmed empty list. |
| `read_freeze_frame` | The DTC that set the freeze frame and the engine conditions at that moment |
| `read_live_data` | Live sensors: RPM, coolant temp, fuel trims, MAF, O2 voltages, EVAP purge, commanded lambda, fuel rate, time since codes were cleared, hybrid battery and more (37 PIDs). Common other names (`speed`, `coolant`, `battery`, `水温`) and PID codes (`010C`) also work; an unknown name gets a suggestion |
| `watch_live_data` | Watch up to 4 live sensors for 5–30 seconds while parked, to see how they change (for example coolant temperature while warming up, or idle rpm stability). Returns timestamped samples and min/max/first/last per sensor; unsupported sensors stay `null`. Read-only. |
| `read_readiness` | Emissions monitor completion status (inspection readiness), with counts and the list of incomplete monitors. Clearing codes or disconnecting the battery resets them. |
| `format_diagnostic_report` | Turn a diagnostic report from this session into readable Markdown, in English or Japanese, to save or hand to a workshop: codes, the freeze frame apart from live data, and readiness, with unavailable values and errors shown as such. No VIN, no adapter address; never contacts the vehicle. |
| `compare_diagnostic_reports` | Compare two diagnostic reports, for example before and after a test drive or a repair: new and gone codes, the warning light, readiness monitors that completed or were reset, live values side by side, and neutral observations such as signs that codes were cleared in between. Works on reports already collected (the last 10 of the session, or one saved earlier from `obd2://report/latest`) and never contacts the vehicle. |
| `read_battery_voltage` | The voltage at the OBD-II port as measured by the adapter (`ATRV`), with a rough guide for a 12 V battery with the engine off or running. Asks the adapter, not the car's modules, so it also works with the ignition off. Not a battery load test. |
| `read_vin` | Vehicle Identification Number from the ECU |
| `read_ecu_info` | The control modules that answer (engine, transmission and others), each with its name, calibration IDs (software version) and calibration verification numbers (mode 09). Useful when a workshop asks for software versions, for example to check whether an update applies. CAN vehicles only (most cars from 2008 on); fields a module does not support are listed, never guessed. Does not read the VIN. |
| `connection_status` | Adapter identity and port voltage if available. A connected adapter does not itself confirm communication with the vehicle. |
| `find_adapter` | Find a USB or Bluetooth ELM327 adapter automatically: opens only adapter-like ports briefly and sends the identification command `ATZ`; never contacts the vehicle. |
| `reconnect` | Reconnect to the current adapter after it stopped answering (timeout, unplugged, Bluetooth or WiFi dropped), without restarting the server or Claude Desktop. Sends nothing to the car. |
| `use_adapter` | Connect this session to a found adapter (or back to mock) without editing settings or restarting. Checks the adapter first and keeps the old connection on failure; accepts only serial ports and local-network WiFi addresses. |
| `list_serial_ports` | List this computer's serial ports and their `serial:` connection values to find a USB or Bluetooth adapter. Does not open a port; works in mock mode. |
| `clear_dtcs` | Clear codes — **disabled for real adapters by default**; warns that freeze frame evidence is erased and readiness monitors reset |

## Resources

Reference material you can attach to a conversation without asking Claude to call a tool. In Claude Desktop, find them under obd2-mcp in the attachment (+) menu. Resources never contact the adapter or the car.

| Resource | What it contains |
|---|---|
| `obd2://guide/adapters` | [Choosing and plugging in an adapter](./docs/adapters.md) (EN/JA) |
| `obd2://guide/troubleshooting` | [Troubleshooting a connection](./docs/troubleshooting.md) (EN/JA) |
| `obd2://guide/used-car-check` | [Checking a used car](./docs/used-car-check.md) (EN/JA) |
| `obd2://sensors` | Every live sensor name with its PID and unit, and whether it is in the default set or the freeze frame |
| `obd2://scenarios` | The simulated vehicle scenarios |
| `obd2://report/latest` | The latest `read_diagnostic_report` from this session, without the adapter's port or address; empty until one is collected and after a restart |
| `obd2://report/latest.md`, `obd2://report/latest.ja.md` | The same report as readable Markdown in English or Japanese, to save or hand to a workshop |
| `obd2://reports/{number}` | A report from this session by its `session_report_number` (the last 10 are kept), without the adapter's port or address; listed after it is collected. Save one before a repair or a test drive to compare later |
| `obd2://code/{code}` | A trouble code's system and whether SAE or the manufacturer defines its meaning (no meanings bundled); completes codes read in this session |
| `obd2://sensor/{name}` | One sensor's PID, unit and description; completes sensor names |

Clients that support argument completion also suggest languages for the prompts' `language` argument.

## Pairs with automotive-ai-skills 🔧

This server is the *tool* layer. The knowledge layer — how to reason from codes to causes, what to test before buying parts, when to see a professional — lives in [automotive-ai-skills](https://github.com/shoka-jp/automotive-ai-skills):

```text
/plugin marketplace add shoka-jp/automotive-ai-skills
/plugin install automotive-ai-skills@automotive-ai-skills
claude mcp add obd2 -- node "/absolute/path/to/obd2-mcp/dist/index.js"
```

With both installed, Claude reads the codes from your car *and* runs the diagnostic workflow on them.

## Safety and scope

- **Real vehicle code clearing is disabled by default.** To enable mode 04, set `OBD2MCP_ENABLE_CLEAR=1` before starting the server, set the tool's `confirm` argument to true, and approve the separate MCP form confirmation. Clients without form elicitation cannot clear real codes. This relies on the client displaying the confirmation to a human; the server cannot verify the identity of the approver. Mock clearing remains available for testing.
- **Tool annotations.** Every tool has a display title. The readers are annotated read-only and `clear_dtcs` is annotated destructive, so MCP clients can present or confirm them differently. Annotations are hints for the client and do not replace the safeguards above.
- **Response limitations.** Multiple or mixed ECU replies are reported as errors instead of combining or guessing values (`read_ecu_info` separates modules by address). Diesel (compression-ignition) engines get their own readiness monitors. VIN reading accepts the CAN-formatted response with data-item count `01` followed by exactly 17 valid VIN characters; other response formats return an error. Following an adapter timeout or disconnect, ask Claude to reconnect; restarting the server is the fallback. Real-vehicle and adapter compatibility must be verified independently.
- **Diagnosis support, not a verdict.** Codes identify failed tests, not failed parts. Verify with physical tests before spending money, and defer safety-critical work (brakes, fuel, SRS, high-voltage) to professionals.
- Never drive while interacting with an AI assistant. Read with the vehicle parked.
- **Found a safety or security problem?** Report it privately as described in [SECURITY.md](./SECURITY.md), not in a public issue.

## Development

```bash
git clone https://github.com/shoka-jp/obd2-mcp.git
cd obd2-mcp
npm ci
npm test        # builds + runs the stdio smoke test against the mock vehicle
npm run test:package  # tests an isolated installation of the actual npm tarball
npm run build:mcpb    # stages the Claude Desktop extension in build/mcpb (see docs/releasing.md)
node dist/index.js --help  # command-line options and environment variables
```

The mock vehicle answers at the ELM327 protocol level, so tests exercise the full parsing stack (including multi-frame ISO-TP VIN responses).

## Roadmap

See the [product roadmap](./docs/roadmap.md) for current release status, proposed improvements, and ways to help. Priorities are open to feedback and are not a release schedule.

## Support the project

If this server is useful to you:

- [Follow shoka-jp](https://github.com/shoka-jp) for automotive AI and MCP development.
- Star this repository to bookmark it, and share it with someone who works with vehicle diagnostics.
- [Report a reproducible issue](https://github.com/shoka-jp/obd2-mcp/issues) with your adapter type, operating system, connection mode, and expected versus actual behavior. Remove VINs and other personal information from logs.
- [Sponsor the maintainer](https://github.com/sponsors/shoka-jp) to support this open-source work.

## License

[MIT](./LICENSE) © 2026 Sho Kamakura
