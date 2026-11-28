# Product roadmap

[日本語](./roadmap.ja.md) | [README](../README.md)

The goal is to make a vehicle's recorded observations easier to understand and share with a workshop, while keeping uncertainty and potentially destructive actions visible. This is a direction for discussion, not a release schedule or a commitment to deliver every item. Order may change with feedback and evidence.

## Available today

| Where | What you can try |
|---|---|
| GitHub release **v0.8.0** | A no-car mock demo with seven simulated scenarios, fifteen MCP tools, six guided prompts, MCP resources and 25 live sensors. Connect a real adapter by asking (`find_adapter` and `use_adapter`, no port names or restart), with plain-language next steps on errors. It also includes `read_diagnostic_report` for workshop evidence, `read_supported_pids` for advertised live sensor support in the Mode 01 PID 01–60 range, `list_serial_ports` to find an adapter's port, and a used-car check: `read_permanent_dtcs` (Mode 0A), the `used_car_check` prompt (which also reads warm-ups and distance since codes were cleared), the `cleared` scenario and a [walkthrough](./used-car-check.md). An [adapter guide](./adapters.md) explains which adapters work on a computer. `watch_live_data` shows how sensors change over up to 30 seconds while parked, the `inspection_check` prompt prepares for an emissions inspection, trouble codes say whether SAE or the manufacturer defines them, and guides and the latest report can be attached as MCP resources. The diagnostic report includes permanent codes, `compare_diagnostic_reports` shows what changed between two reports (for example before and after a test drive or a repair), and the `after_repair_check` prompt checks whether a fault has come back. Install it in Claude Desktop from the `.mcpb` file or register the release package with `npx`; a [connection troubleshooting guide](./troubleshooting.md) covers real adapters. [Try the demo](./try-mock.md). |

The report uses sequential reads and does not request VIN or clear codes; it is not a diagnosis. Mock tests do not establish compatibility with a real vehicle or adapter. See the [safety and scope notes](../README.md#safety-and-scope).

## Priorities

### 1. Make the report easy to try and trust

- **Release verification:** follow the [release checklist](./releasing.md) for each package and document the verified install path.
- **Clearer handover:** a readable report in English or Japanese (`format_diagnostic_report`, `obd2://report/latest.md`) keeps unavailable values, errors, timestamps and the freeze frame apart from live readings, next to the structured MCP response. Next, improve it from workshop feedback.
- **More useful simulations:** an EVAP example (`evap`, P0456) has been available since v0.4.0, a recently cleared car (`cleared`) since v0.6.0, and a car with unsupported sensors and no freeze frame (`partial`) since v0.6.1. Next, base new scenarios on real-vehicle reports, with expected observations and limitations. Simulated outcomes must stay clearly labeled.

### 2. Reduce uncertainty when connecting a real adapter

- **Supported PID discovery:** available since v0.3.0 for `0100`, `0120` and `0140`, with explicit unknown states and partial results. Next, collect reproducible real-adapter evidence before considering broader ranges or automatic sensor selection.
- **Evidence from real setups:** document reproducible, privacy-reviewed reports by operating system, connection type, adapter and vehicle context. Reports come in through the [real setup report](https://github.com/shoka-jp/obd2-mcp/issues/new?template=hardware-report.yml) form and are listed in [reported setups](./compatibility.md). Mark only combinations actually tested; mock coverage is not hardware validation.
- **Connection guidance:** improve troubleshooting for pairing, port selection, timeouts and reconnects based on reproducible reports. After a timeout or disconnect, the `reconnect` tool reopens the connection without a restart (tested with the mock and a local TCP adapter); collect real-adapter reports of how well it recovers.

### 3. Expand diagnostic evidence carefully

- Permanent trouble codes (Mode 0A) are available since v0.6.0 as `read_permanent_dtcs`. Next, collect real-vehicle reports of how different cars answer it.
- Mode 09 module information (names, calibration IDs and verification numbers from every module that answers, on CAN vehicles) is available as `read_ecu_info`, tested with the mock only. Next, collect real-vehicle reports of how modules answer, and investigate Mode 06 on-board monitoring results.
- Explore oxygen-sensor sampling for catalyst-related investigations only with clear sampling limits and without treating a pattern as proof of a failed component.

These are proposals, not supported features. Vehicle, protocol and adapter capabilities vary; a missing reading must not be presented as a clean result. Real-vehicle code clearing remains disabled by default and separately confirmation-gated.

## Help shape the next step

[Open an issue](https://github.com/shoka-jp/obd2-mcp/issues/new/choose) with the task you were trying to complete, expected and actual behavior, and whether you used the mock or a real adapter. For hardware reports, include the operating system, adapter and connection type. Remove VINs, names, contact details, credentials and other sensitive information from logs before sharing. Small reproducible examples and documentation improvements are welcome; see [contributing](../CONTRIBUTING.md).
