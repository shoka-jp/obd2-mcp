# Product roadmap

[日本語](./roadmap.ja.md) | [README](../README.md)

The goal is to make a vehicle's recorded observations easier to understand and share with a workshop, while keeping uncertainty and potentially destructive actions visible. This is a direction for discussion, not a release schedule or a commitment to deliver every item. Order may change with feedback and evidence.

## Available today

| Where | What you can try |
|---|---|
| GitHub release **v0.3.0** | A no-car mock demo, four simulated scenarios and nine MCP tools, including `read_diagnostic_report` for workshop evidence and `read_supported_pids` for advertised live sensor support in the Mode 01 PID 01–60 range. [Try the demo](./try-mock.md). |

The report uses sequential reads and does not request VIN or clear codes; it is not a diagnosis. Mock tests do not establish compatibility with a real vehicle or adapter. See the [safety and scope notes](../README.md#safety-and-scope).

## Priorities

### 1. Make the report easy to try and trust

- **Release verification:** follow the [release checklist](./releasing.md) for each package and document the verified install path.
- **Clearer handover:** explore an easy-to-read, shareable report that preserves unavailable values, errors, timestamps and the difference between freeze-frame and live readings. Keep the structured MCP response usable.
- **More useful simulations:** add focused mock scenarios, such as an EVAP-related example and partial or unavailable readings, with expected observations and limitations. Simulated outcomes must stay clearly labeled.

### 2. Reduce uncertainty when connecting a real adapter

- **Supported PID discovery:** available in v0.3.0 for `0100`, `0120` and `0140`, with explicit unknown states and partial results. Next, collect reproducible real-adapter evidence before considering broader ranges or automatic sensor selection.
- **Evidence from real setups:** document reproducible, privacy-reviewed reports by operating system, connection type, adapter and vehicle context. Mark only combinations actually tested; mock coverage is not hardware validation.
- **Connection guidance:** improve troubleshooting for pairing, port selection, timeouts and reconnects based on reproducible reports. Preserve the existing advice to restart after a timeout or disconnect until recovery is implemented and tested.

### 3. Expand diagnostic evidence carefully

- Investigate read-only Mode 09 calibration IDs and Mode 06 on-board monitoring results, including unsupported and multi-ECU responses.
- Explore oxygen-sensor sampling for catalyst-related investigations only with clear sampling limits and without treating a pattern as proof of a failed component.

These are proposals, not supported features. Vehicle, protocol and adapter capabilities vary; a missing reading must not be presented as a clean result. Real-vehicle code clearing remains disabled by default and separately confirmation-gated.

## Help shape the next step

[Open an issue](https://github.com/shoka-jp/obd2-mcp/issues/new/choose) with the task you were trying to complete, expected and actual behavior, and whether you used the mock or a real adapter. For hardware reports, include the operating system, adapter and connection type. Remove VINs, names, contact details, credentials and other sensitive information from logs before sharing. Small reproducible examples and documentation improvements are welcome; see [contributing](../CONTRIBUTING.md).
