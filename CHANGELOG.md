# Changelog

## [Unreleased]

- The demo accepts `--scenario <name>` (for example `--demo --summary --scenario cleared`) to show any mock scenario without an MCP client. The summary now also shows permanent codes and incomplete readiness monitors, and explains the "no stored codes but a permanent code" pattern as a reason to ask, not proof.
- `read_readiness` (and the readiness section of `read_diagnostic_report`) now also returns `supported_count`, `complete_count` and `incomplete_monitors`, so "several monitors incomplete" is explicit and `not_supported` monitors are never counted. The vehicle requests are unchanged.
- Add the `cleared` mock scenario: codes cleared recently, with no stored codes and the MIL off, but a permanent P0420 and incomplete catalyst, evaporative-system and oxygen-sensor monitors. Try `used_car_check` without a car.
- Add the `used_car_check` guided prompt: with the seller's permission, read codes, permanent codes, readiness monitors and (if supported) the distance with the warning light on and engine run time. It presents signs of recently cleared codes as questions for the seller rather than proof, explains that a battery replacement resets monitors but not permanent codes, suggests reading again after the test drive, and lists what a pre-purchase inspection should check. It never clears codes and does not judge the price or whether to buy. A new walkthrough, [docs/used-car-check.md](docs/used-car-check.md) (EN/JA), covers the viewing, trying it with the `cleared` mock scenario, and what a remaining permanent code means after a repair.
- Add the read-only `read_permanent_dtcs` tool (Mode 0A): permanent trouble codes stay after a scan-tool clear until the car confirms the repair, which helps tell whether codes were cleared recently, for example before buying a used car. It returns `null` with a note when the vehicle gives no answer or rejects the request (common before about 2010), instead of failing or reporting an empty list. It is a separate tool, so `read_dtcs` and `read_diagnostic_report` send the same requests as before. The mock vehicle keeps its permanent code after `clear_dtcs`, as a real engine computer does, and the server instructions explain how to present the result.

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
