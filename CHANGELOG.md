# Changelog

## [Unreleased]

### Changed

- Smaller results, so conversations use fewer tokens: tool results are compact JSON instead of indented; the diagnostic report says once whether it is simulated instead of in every section (about half the size); `read_supported_pids` returns `supported_sensor_names`, `not_advertised_sensor_names` and `unknown_sensor_names` instead of an object per sensor (about a quarter of the size); `watch_live_data` and `read_diagnostic_report` no longer repeat the list of sensor names in their descriptions. Resources and saved reports stay indented for people to read.

### Added

- Odometer: the new `odometer` sensor (Mode 01 PID A6, also `mileage` and `走行距離`) is the distance recorded by the engine computer, on newer cars that support it. `read_supported_pids` now follows the support ranges past `0140` (`0160`, `0180`, `01A0`) when the car advertises them, so it reports whether the odometer is available; `pid_range` is now `01-C0`. A car that does not advertise those ranges gets no extra requests. `used_car_check` reads the odometer and asks the user to compare it with the dashboard, as a question for the seller and not proof of tampering; the readable report labels it in Japanese.
- `read_readiness` adds `this_drive_cycle` from Mode 01 PID 41 when the car answers it: the same monitors for the current drive only, each `complete`, `incomplete` or `not_enabled` (its conditions have not been met on this drive), with counts. It helps when driving to complete monitors after a repair or before an inspection. A car without PID 41 gets `null` and `this_drive_cycle_error`, and the rest of the readiness result is unchanged. The readable report shows the progress, and `after_repair_check` uses it.
- `obd2-mcp --check`: a read-only compatibility check from the terminal. It finds the adapter (or uses `--connection`; `--wifi` also tries WiFi addresses), runs the adapter, supported-sensor, code, permanent-code, freeze-frame, readiness and control-module reads one by one, and prints a Markdown summary with the adapter, protocol, voltage and a result and time per step, to paste into the real setup report. It never reads the VIN or clears codes, and leaves out port names and network addresses. The report form has a field for it.
- US units: `OBD2MCP_UNITS=imperial` (Claude Desktop setting *Units*) shows °F, mph, miles, psi and gallons per hour in the readable report, the `obd2://report/latest.md` resources and the demo summary, and tells the assistant to answer in US units. `format_diagnostic_report` also takes `units`. Tool data stays metric so reports, comparisons and the history folder stay consistent. Metric remains the default.
- Report history: with a folder set (Claude Desktop setting *Report history folder*, or `OBD2MCP_REPORT_DIR`), every `read_diagnostic_report` from a real vehicle is saved there as JSON (`obd2-report-<time>.json`, no VIN, no adapter address), and the latest ten are loaded at start-up as reports 1, 2, … marked `loaded_from`. `compare_diagnostic_reports` and `obd2://reports/{number}` then work across restarts and days. Reports from the simulated vehicle are not saved; a folder that cannot be written adds `history_error` without failing the read. History stays off by default.
- Sensor names are forgiving: `read_live_data`, `watch_live_data` and `read_diagnostic_report` accept common other names (`speed`, `coolant`, `battery`, `lambda`, and Japanese names such as `水温` and `回転数`) and Mode 01 PID codes (`0C`, `010C`), and say which name they used (`names_used`). An unknown name gets up to three suggestions ("Did you mean: coolant_temp?") instead of the list of every sensor.
- Readiness monitors for diesel (compression-ignition) engines: instead of an error, `read_readiness` reports NMHC catalyst, NOx/SCR, boost pressure, exhaust gas sensor, particulate filter and EGR/VVT with `engine_type: "compression_ignition"` (petrol engines report `spark_ignition`). The same response is parsed; nothing new is sent. Report comparison and the readable report (English and Japanese labels) handle the diesel monitors, `inspection_check` explains them, and a new `diesel` mock scenario (P2463, particulate filter incomplete) shows them.
- `find_adapter` can find WiFi adapters: with `include_wifi: true`, after the user has joined the adapter's WiFi network, it also tries the usual factory addresses (`192.168.0.10:35000`, and `192.168.0.74:23` for OBDLink MX WiFi), sending only `ATZ`. Without it, no network connection is made. The `connect_adapter` prompt uses it, so WiFi users no longer need to type an address.
- On Linux without `udevadm` (minimal installs, containers, some WSL setups), listing serial ports and `find_adapter` now look for `/dev/ttyUSB*`, `/dev/ttyACM*` and `/dev/rfcomm*` directly instead of failing; the descriptions are then unknown. `find_adapter` also checks `ttyUSB`/`ttyACM` devices whose USB chip it does not recognise.
- Add the `reconnect` tool: after a timeout, an adapter unplugged and plugged back in, or a dropped Bluetooth or WiFi link, it closes the connection, opens it again and initializes the adapter, so a restart of the server or Claude Desktop is no longer needed. Nothing is sent to the car. Error hints, the troubleshooting guide and the server instructions now point to it. Events from a closed connection are ignored, so a late "closed" from the old link cannot break the new one, and `use_adapter` closes the current connection first when switching to the same adapter again (Windows does not let a port be opened twice).
- Add the `read_battery_voltage` tool: the voltage at the OBD-II port as measured by the adapter (`ATRV`), with a rough guide for a 12 V battery with the engine off or running. It asks the adapter, not the car's control modules, so it also works with the ignition off; one reading is not a battery test.
- Add 12 live sensors (37 in total), read only when asked by name; the default set is unchanged: `fuel_pressure` (01 0A), `fuel_rail_pressure` (23), `commanded_egr` (2C), `evap_purge` (2E), `absolute_load` (43), `commanded_lambda` (44), `relative_throttle` (45), `accelerator_pedal` (49), `time_with_mil` (4D), `time_since_clear` (4E), `hybrid_battery_remaining` (5B) and `fuel_rate` (5E). All are in the 01–60 range that `read_supported_pids` already checks. `used_car_check` also reads time since codes were cleared and time with the warning light on, `compare_diagnostic_reports` treats a drop in time since codes were cleared as a clear, and the server instructions say `hybrid_battery_remaining` is not a battery-health figure. The mock car supports eight of them (not fuel pressure, EGR or a hybrid battery), and clearing codes resets its time counters.
- Add the `format_diagnostic_report` tool and the `obd2://report/latest.md` and `obd2://report/latest.ja.md` resources: a diagnostic report as readable Markdown, in English or Japanese, to save, print or hand to a workshop. It shows the warning light, stored, pending and permanent codes (with whether SAE or the manufacturer defines them), the freeze frame apart from live data, and readiness monitors; values that were unavailable or failed and section errors stay visible, never shown as normal. It contains no VIN and no adapter address, prints only well-formed values, and never contacts the vehicle. The `workshop_handover` prompt hands over this text unchanged and adds a short covering note. This is the roadmap's "clearer handover" item.
- Add the `read_ecu_info` tool: the control modules that answer OBD-II requests (engine, transmission and others), each with its name, calibration IDs (software version) and calibration verification numbers, from mode 09 PIDs 0A, 04 and 06. Useful when a workshop asks for software versions. Several modules can answer one request, so these reads turn message headers on (`ATH1`), group the answers by CAN address (11-bit and 29-bit) and turn headers off again (`ATH0`); if that fails, the next request re-initializes the adapter. Requests are now serialized, so no other read runs while headers are on. If the protocol is not known yet, one `0100` request finds it first. Older protocols, a vehicle without mode 09 support, fields a module does not advertise, refusals and broken answers are reported as such, per module, never guessed. It does not read the VIN, and its description and the server instructions say not to infer tuning or needed updates from the numbers. The mock now has an engine and a transmission module (the `partial` scenario has only an engine with its name). Tested with the mock only.

## [0.8.0] - 2026-11-27

See what changed: compare two diagnostic reports (before and after a test drive, a repair or some days of driving), check a car after a repair, and find permanent codes in every report.

### Changed

- `read_diagnostic_report` now also includes permanent codes (Mode 0A) as a `read_permanent_dtcs` section, so one report shows whether a code is still waiting for the car to confirm a repair. This adds one Mode 0A request per report, the same read-only request that `read_permanent_dtcs` already sends; a car that does not answer or reports it unsupported gets `null` with a note, and the other sections are unaffected. `compare_diagnostic_reports` now compares permanent codes: a stored code that is gone while still permanent usually means codes were cleared, and a permanent code that disappears means the car confirmed the repair. Reports from 0.7.x show permanent codes as unknown. The `used_car_check`, `after_repair_check` and `workshop_handover` prompts use the report's permanent codes.

### Added

- Add the `compare_diagnostic_reports` tool to see what changed between two diagnostic reports, for example before and after a test drive, a repair or some days of driving. It reports new and gone stored and pending codes, the warning light, the freeze frame code, readiness monitors that completed or were reset, and live values side by side, with neutral observations: for example, warm-ups or distance since codes were cleared going down means codes were cleared in between. By default it compares the two most recent reports of the session; a session keeps the last 10, and each `read_diagnostic_report` result now carries a `session_report_number`. A report saved from `obd2://report/latest` in an earlier session can be passed as `earlier_report_json`; only well-formed values (codes, known sensor and monitor names, numbers, timestamps) are read from it. Sections that failed are reported as unknown, never as a change. It works on reports already collected and never contacts the adapter or the vehicle. The `used_car_check` prompt uses it after the test drive.
- Add the `after_repair_check` guided prompt: after a repair or a part replacement, it reads codes, permanent codes and readiness monitors, compares with a report from before the repair when there is one (in the session, or saved and passed as `earlier_report_json`), and explains whether the fault has shown up again, that a remaining permanent code means the fix is not confirmed yet rather than failed, and what driving is still needed. It does not judge the workshop or promise that the repair worked.
- Add the resource template `obd2://reports/{number}`: a report from this session by its `session_report_number`, without the adapter's port or address. Collected reports are listed as resources, and the number completes in clients that support it, so a report can be saved before a repair or a test drive.

## [0.7.0] - 2026-11-27

More of MCP: watch how sensors change while parked, check readiness before an emissions inspection, see whether SAE or the manufacturer defines each trouble code, and attach guides and the latest report as MCP resources.

### Added

- MCP resources a user can attach without a tool call: the adapter, troubleshooting and used-car guides (EN/JA, now bundled in the `.mcpb`), the live sensor catalogue (`obd2://sensors`), the mock scenarios (`obd2://scenarios`), and the latest diagnostic report from this session without the adapter's port or address (`obd2://report/latest`). Resource templates `obd2://code/{code}` (system and who defines the meaning; completes codes read this session) and `obd2://sensor/{name}` (completes sensor names). Prompts' `language` argument suggests common languages in clients that support completion. Resources never contact the adapter or the car.
- `read_dtcs`, `read_permanent_dtcs` and `read_freeze_frame` now return `code_info` for each code: its system (powertrain, chassis, body, network) and whether its meaning is defined by SAE (the same on every make), by the manufacturer, or depends on the code. The server instructions ask the client not to state a meaning from memory for manufacturer-defined codes, but to say it depends on the make and suggest the manufacturer's information or a workshop. The vehicle requests are unchanged.
- Add the `inspection_check` guided prompt for an emissions (smog) inspection, or after a repair or battery change. It reads the warning light, codes, permanent codes and readiness monitors (and, if supported, warm-ups and distance since codes were cleared), explains the usual OBD criteria as typical rules (EPA guidance: up to two incomplete monitors for model years 1996–2000, one for 2001 and newer; stricter in some states such as California), explains how monitors complete with normal driving, and notes that Japan's 車検 OBD inspection reads manufacturer-defined codes that this tool cannot. It never suggests clearing codes or disconnecting the battery and does not promise a pass.
- Add the read-only `watch_live_data` tool: read up to four live sensors repeatedly for 5–30 seconds (every 1–5 seconds) while parked, to see how values change, for example coolant temperature while the engine warms up or idle rpm stability. It returns timestamped samples and min, max, first, last and failed reads per sensor; unsupported sensors stay `null`, unknown names are rejected before anything is sent, and a lost connection stops the watch and returns what was read. When the client asks for progress, it sends an MCP progress notification after each sample, so the client can show it and keep waiting. It sends only the Mode 01 requests that `read_live_data` already sends for those sensors.

## [0.6.2] - 2026-11-27

Listing serial ports on Linux without `udevadm` now explains what to do instead of failing with a bare error, and the README mentions the official MCP Registry listing.

### Fixed

- Turn a missing `udevadm` error (`spawn udevadm ENOENT`) during serial port listing on Linux (such as in minimal containers or WSL) into an actionable message that keeps the original error text and explains how to check `/dev/ttyUSB*` and set `serial:<path>` directly. Thanks @techkayacodes.

### Documentation

- README (EN/JA): mention the listing in the official MCP Registry as `io.github.shoka-jp/obd2-mcp`.

## [0.6.1] - 2026-11-27

The used-car check now reads how many warm-ups and kilometres have passed since codes were cleared, a guide explains which adapters work on a computer, and obd2-mcp is listed in the official MCP Registry.

### Added

- Add Mode 01 PIDs `30` (`warmups_since_clear`) and `31` (`distance_since_clear`) with mock values, Mode `04` reset behavior, and unit tests. `read_live_data` now knows 25 PIDs; the default set is unchanged. Thanks @playlikeboy.
- The `used_car_check` prompt and server instructions use these PIDs: few warm-ups or little distance since codes were cleared is the most direct sign of a recent clear, presented as a question for the seller. The demo summary shows them too (`--scenario cleared` prints 1 warm-up and 12 km), and the [used-car walkthrough](docs/used-car-check.md) explains them.
- Add the `partial` mock scenario (`P0128` with coolant at 72 °C, five unsupported sensors reported as `not_advertised` / unavailable, and no freeze frame). Thanks @playlikeboy.

### Fixed

- Reset `distance_with_mil` (PID `21`) to `0` when the mock vehicle clears trouble codes via Mode `04` (only when supported), as a real engine computer does. Thanks @playlikeboy.

### Changed

- List each release in the official MCP Registry (`io.github.shoka-jp/obd2-mcp`) so MCP clients and directories can find it. A new release-workflow job fills in `server.json` with the release's `.mcpb` URL and SHA-256 and publishes it with GitHub OIDC, without stored secrets; it can also be run manually for an existing release.
- When `find_adapter` sees no port that looks like an adapter, its `next_step` now also explains that a Bluetooth LE-only adapter (often sold for iPhone) never appears as a port on a computer and cannot be used. The `connect_adapter` prompt description now matches its connect-by-asking flow.

### Documentation

- Add [docs/adapters.md](docs/adapters.md) (EN/JA), a guide for choosing and plugging in an adapter: which connection types work on a computer (USB, classic Bluetooth, WiFi) and which do not (Bluetooth LE only), where the OBD-II port usually is, and unplugging it afterwards to protect the battery. It recommends no product. The README, troubleshooting guide and get-started image now point to it and describe connecting by asking Claude, and the `connect_adapter` row reflects the `find_adapter`/`use_adapter` flow.

## [0.6.0] - 2026-11-27

Easier for people without IT skills: connect by asking, get a next step when something fails, and check a used car before buying.

### Connect and recover without IT skills

- Connect a real adapter by asking, without knowing a port name or editing settings. New `find_adapter` finds a USB or Bluetooth ELM327 by opening only adapter-like ports (known USB-serial chips, Bluetooth serial ports) and asking each to identify itself with `ATZ`, retrying USB adapters at 115200 and 9600 baud; it never contacts the vehicle. New `use_adapter` switches the session to that adapter (or a WiFi adapter, or back to mock) after checking that it answers, keeps the previous connection on failure, and accepts only serial port names and local-network WiFi addresses. The change lasts until restart; clearing codes stays disabled for real adapters. The `connect_adapter` prompt and server instructions use this flow and tell the client not to ask non-technical users for port names.
- Tool errors from the adapter or vehicle now include a plain-language `hint` with a next step (for example "turn the ignition ON" for `UNABLE TO CONNECT`, joining the adapter's WiFi for a refused TCP connection, or unplugging and restarting after a timeout). The original error text is kept, and the server instructions ask the client to explain hints simply, one step at a time.

### Used-car check

- Add the read-only `read_permanent_dtcs` tool (Mode 0A): permanent trouble codes stay after a scan-tool clear until the car confirms the repair, which helps tell whether codes were cleared recently, for example before buying a used car. It returns `null` with a note when the vehicle gives no answer or rejects the request (common before about 2010), instead of failing or reporting an empty list. It is a separate tool, so `read_dtcs` and `read_diagnostic_report` send the same requests as before. The mock vehicle keeps its permanent code after `clear_dtcs`, as a real engine computer does, and the server instructions explain how to present the result.
- Add the `used_car_check` guided prompt: with the seller's permission, read codes, permanent codes, readiness monitors and (if supported) the distance with the warning light on and engine run time. It presents signs of recently cleared codes as questions for the seller rather than proof, explains that a battery replacement resets monitors but not permanent codes, suggests reading again after the test drive, and lists what a pre-purchase inspection should check. It never clears codes and does not judge the price or whether to buy. A new walkthrough, [docs/used-car-check.md](docs/used-car-check.md) (EN/JA), covers the viewing, trying it with the `cleared` mock scenario, and what a remaining permanent code means after a repair.
- Add the `cleared` mock scenario: codes cleared recently, with no stored codes and the MIL off, but a permanent P0420 and incomplete catalyst, evaporative-system and oxygen-sensor monitors. Try `used_car_check` without a car.
- `read_readiness` (and the readiness section of `read_diagnostic_report`) now also returns `supported_count`, `complete_count` and `incomplete_monitors`, so "several monitors incomplete" is explicit and `not_supported` monitors are never counted. The vehicle requests are unchanged.
- The demo accepts `--scenario <name>` (for example `--demo --summary --scenario cleared`) to show any mock scenario without an MCP client. The summary now also shows permanent codes and incomplete readiness monitors, and explains the "no stored codes but a permanent code" pattern as a reason to ask, not proof.

### Documentation

- Add a "Check a used car before buying" row to the README start table (EN/JA), and update the roadmap for the used-car check.

## [0.5.0] - 2026-11-27

### Security and requirements

- Security: update the MCP TypeScript SDK to 1.32.2 and zod to 4, with seven transitive packages, resolving the open Dependabot alerts. obd2-mcp only uses the stdio transport, so the reported HTTP server and OAuth issues were not reachable, but the packages shipped inside the `.mcpb` and npm package.
- Update `serialport` to 13 for USB and Bluetooth adapters. **Node.js 20 or later is now required** (22 and 24 are tested), also for the Claude Desktop extension. Checked with the simulated ELM327 over a Linux pseudo-terminal and by loading the native module on Windows and macOS; not yet checked with a real adapter.

### New readings

- Add Mode 01 PIDs `1F` (`run_time`, seconds since engine start) and `21` (`distance_with_mil`, km driven with the warning light on), with mock values and unit tests. `read_live_data` now knows 23 PIDs; the default set is unchanged. Thanks @playlikeboy.

### Documentation and community

- Add a bilingual security and vehicle-safety policy (`SECURITY.md`) with a private reporting route and obd2-mcp-specific scope (commands without safeguards, misleading results, prompt injection through tool output, identifying data, supply chain), linked from the READMEs and the new-issue page.
- Add a bilingual "Real setup report" issue form and a reported-setups page, so people can share adapter and vehicle results safely (no VIN, parked, read-only) and others can see which combinations have been tried.
- Redraw the README getting-started images (EN/JA) for the current path: install with the Claude Desktop extension or `npx`, try the mock car with a guided prompt, then connect an adapter.
- Update the mock walkthrough with the no-Git demo command and the Claude Desktop extension and `npx` setup, and point to the `check_engine_light` prompt.
- Lead the demo results page with the no-Git release-package command, and link the guided prompt and the real setup report.
- Explain in the contribution guide how AI-assisted maintenance works: the `autopilot` label, what may be merged automatically, and that contributor PRs and good first issues stay with people.

### Build and CI

- Run the mock tests, package check and serial port listing on Windows and macOS in CI, in addition to Linux.
- Turn on Dependabot version updates for npm packages and GitHub Actions: weekly, at least 7 days after a release (30 for major versions), always waiting for the maintainer's review.
- Build with TypeScript 7.

## [0.4.0] - 2026-11-26

### Easier to install, connect and start

- Install in Claude Desktop with one file: each GitHub release now includes `obd2-mcp-<version>.mcpb`, a Claude Desktop extension whose settings select the adapter connection, mock scenario and baud rate. CI validates and packs it, starts it like Claude Desktop with default, cleared and changed settings, and attaches it to published releases.
- Register the GitHub release package in Claude Code or Claude Desktop with `npx`, without Git or a local build. The README includes the Windows `cmd /c` form.
- Find a USB or Bluetooth adapter's connection value with the read-only `list_serial_ports` tool or `--list-ports` command. They do not open a port, omit serial numbers and other device identifiers, and work in mock mode.
- Add guided prompts — `check_engine_light`, `workshop_handover` and `connect_adapter` — shown in Claude Desktop's menu and as Claude Code slash commands. They accept optional symptoms and a reply language, and instruct Claude not to clear codes or request the VIN.
- Add a "Choose how to start" table to both READMEs that points to the demo, the Claude Desktop extension, `npx` registration, real-adapter setup and building from source.
- Add an English/Japanese connection troubleshooting guide covering port discovery, Bluetooth pairing and BLE limits, serial permissions, WiFi networks, adapter-versus-vehicle errors and how to report a setup.
- Add `--help` and `--version`.

### Safer and clearer behavior

- Send server instructions at initialization so MCP clients know how to use the tools safely: label mock data, check supported sensors first, keep missing values visible, avoid clearing codes and the VIN unless asked, and how to change the adapter.
- Stop startup with a hint on unknown or misspelled arguments (for example `--list-port` or `--connection=serial:COM3`). They were previously ignored, which started the mock vehicle.
- Add a next step to common serial-port open errors (permission denied, port in use, wrong port name) while keeping the original error text.
- Register every tool with a display title and MCP annotations: readers are read-only and `clear_dtcs` is destructive. The `read_vin` description now asks users to remove the VIN before sharing results publicly.
- Time out a WiFi (TCP) adapter connection after 10 seconds instead of waiting for the operating system's TCP timeout, and keep the first connection error in later restart messages.
- Stop startup with a message naming the setting for an invalid `OBD2MCP_BAUD`, TCP host or port, or an empty serial path, and accept bracketed IPv6 addresses such as `tcp:[fe80::1]:35000`.
- Treat blank `OBD2MCP_CONNECTION` and `OBD2MCP_MOCK_SCENARIO` values as unset, so a cleared setting falls back to the mock vehicle instead of stopping startup.
- Report the package version from `package.json` in the MCP server and demo instead of a hard-coded value.

### Mock vehicle and tests

- Add the `evap` mock scenario (`P0456` evaporative emission system small leak with MIL on and matching freeze frame). Thanks @playlikeboy.
- Add focused tests for the Mode 01 live-data conversion formulas in `src/pids.ts`, with known byte fixtures and a round-trip check for every PID. Thanks @playlikeboy.

### Release process

- Publishing a GitHub release now attaches the npm tarball, the `.mcpb` extension and `SHA256SUMS` automatically after the package and bundle checks pass.

## [0.3.0] - 2026-11-09

- Add read-only `read_supported_pids` discovery for Mode 01 PIDs 01–60, with per-sensor support states, partial failure evidence and matching mock bitmaps.
- Allow `read_diagnostic_report` callers to select live sensor names while retaining the default set for existing calls.
- Reject mixed multi-frame responses and ambiguous VIN payloads instead of dropping bytes or returning a potentially incorrect VIN.
- Add a bilingual first-use feedback form and browser-only contribution guidance.

- Add `read_diagnostic_report` to collect codes, freeze frame, live data and readiness into one timestamped MCP response with structured JSON.
- Preserve reader failures, unknown code lists and per-sensor errors in the report. Omit connection source fields and do not request VIN or clear codes during collection.
- Describe a freeze-frame `NO DATA` response as unavailable, preserving the distinction from a confirmed absent record.
- Preserve reader-specific notes alongside the mock simulation flag.
- Document the issue-to-PR workflow and add structured issue and PR templates.

## [0.2.0] - 2026-11-04

- Add selectable catalyst, healthy, misfire, and lean mock scenarios.
- Add `--demo` to run a safe mock demonstration without an MCP client.
- Validate adapter responses and share concurrent initialization.
- Disable real-vehicle code clearing by default and require client confirmation.
- Add illustrated English and Japanese getting-started guides.
- Add concise English/Japanese mock summaries and a GitHub release package trial command.

- Build before packing so clean-source tarballs include the executable JavaScript.
- Include demo guides, the example client, and contribution instructions in npm packages.
- Add an isolated package-installation check and a Linux CI matrix for Node.js 22/24.
- Add GitHub Sponsors funding metadata and a bilingual release checklist.

## [0.1.0] - 2026-07-03

Initial release.

### Added

- MCP server (stdio) exposing 7 tools: `read_dtcs`, `read_freeze_frame`,
  `read_live_data` (22 mode-01 PIDs), `read_readiness`, `read_vin`,
  `connection_status`, `clear_dtcs` (confirmation-gated)
- ELM327 session handling: initialization, multi-frame (ISO-TP) response
  reassembly, CAN and legacy DTC formats, NO DATA handling
- Transports: serial (USB/Bluetooth via optional `serialport`),
  TCP (WiFi adapters), and a built-in mock vehicle
- Mock vehicle scenario matching the automotive-ai-skills P0420 example:
  stored P0420, MIL on, freeze frame at 98 km/h, realistic live data
  with idle jitter
- Stdio smoke test covering the full stack (17 assertions)
