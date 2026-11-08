# Changelog

## [0.3.0] - Unreleased

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
