# Changelog

## [0.4.0] - Unreleased

- Build a Claude Desktop extension (`obd2-mcp-<version>.mcpb`) in CI and attach it to published GitHub releases. Its settings select the adapter connection, mock scenario and baud rate. CI packs the bundle and starts it like Claude Desktop with default, cleared and changed settings.
- Treat blank `OBD2MCP_CONNECTION` and `OBD2MCP_MOCK_SCENARIO` values as unset, so a cleared setting falls back to the mock vehicle instead of stopping startup.
- Add guided MCP prompts — `check_engine_light`, `workshop_handover` and `connect_adapter` — that Claude Desktop shows in its menu and Claude Code offers as slash commands. They accept optional symptoms and a reply language, and instruct Claude not to clear codes or request the VIN.
- Add the read-only `list_serial_ports` tool and `--list-ports` command to find the `serial:` connection value for a USB or paired Bluetooth adapter. They do not open a port, omit serial numbers and other device identifiers, and work in mock mode.
- Document registering the v0.3.0 GitHub release package in Claude Code and Claude Desktop with `npx`, without Git or a local build, including the Windows `cmd /c` form.
- Register every tool with a display title and MCP annotations: readers are read-only and `clear_dtcs` is destructive. The `read_vin` description now asks users to remove the VIN before sharing results publicly.
- Time out a WiFi (TCP) adapter connection after 10 seconds instead of waiting for the operating system's TCP timeout, and keep the first connection error in later restart messages.
- Stop startup with a message naming the setting for an invalid `OBD2MCP_BAUD`, TCP host or port, or an empty serial path, and accept bracketed IPv6 addresses such as `tcp:[fe80::1]:35000`.

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
