# Product roadmap

[日本語](./roadmap.ja.md) | [README](../README.md)

The goal is to make a vehicle's recorded observations easier to understand and share with a workshop, while keeping uncertainty and potentially destructive actions visible. This is a direction for discussion, not a release schedule or a commitment to deliver every item. Order may change with feedback and evidence.

## Available today

| Where | What you can try |
|---|---|
| GitHub release **v0.9.0** | A no-car mock demo with eight simulated scenarios, twenty MCP tools, six guided prompts, MCP resources and 38 live sensors. Connect a real adapter by asking (`find_adapter` and `use_adapter`, also WiFi adapters, no port names or restart), and recover from a dropped connection with `reconnect`. `read_diagnostic_report` collects codes, permanent codes, the freeze frame, live data and readiness for a workshop; `format_diagnostic_report` turns it into readable English or Japanese (also in US units), `compare_diagnostic_reports` shows what changed between two reports, and an optional history folder keeps reports across days. `read_monitor_tests` gives the car's own self-test results (Mode 06) with misfire counts per cylinder, readiness shows progress on the current drive and supports diesel engines, and `read_ecu_info`, `read_battery_voltage` and the odometer add software versions, port voltage and the recorded distance. Guided prompts cover a warning light, a used-car check, an emissions inspection, a check after a repair and a workshop handover. `obd2-mcp --check` prints a compatibility summary for the [real setup report](https://github.com/shoka-jp/obd2-mcp/issues/new?template=hardware-report.yml). Install it in Claude Desktop from the `.mcpb` file or register the release package with `npx`; see the [adapter guide](./adapters.md), [troubleshooting](./troubleshooting.md) and the [used-car walkthrough](./used-car-check.md). [Try the demo](./try-mock.md). |

The report uses sequential reads and does not request VIN or clear codes; it is not a diagnosis. Mock tests do not establish compatibility with a real vehicle or adapter. See the [safety and scope notes](../README.md#safety-and-scope).

## Priorities

### 1. Make the report easy to try and trust

- **Release verification:** follow the [release checklist](./releasing.md) for each package and document the verified install path.
- **Clearer handover:** a readable report in English or Japanese (`format_diagnostic_report`, `obd2://report/latest.md`) keeps unavailable values, errors, timestamps and the freeze frame apart from live readings, next to the structured MCP response. Next, improve it from workshop feedback.
- **More useful simulations:** an EVAP example (`evap`, P0456) has been available since v0.4.0, a recently cleared car (`cleared`) since v0.6.0, and a car with unsupported sensors and no freeze frame (`partial`) since v0.6.1. Next, base new scenarios on real-vehicle reports, with expected observations and limitations. Simulated outcomes must stay clearly labeled.

### 2. Reduce uncertainty when connecting a real adapter

- **Supported PID discovery:** available since v0.3.0 for `0100`, `0120` and `0140`, with explicit unknown states and partial results; since v0.9.0 it follows the later ranges up to `01A0` when the car advertises them, for the odometer. Next, collect reproducible real-adapter evidence before considering automatic sensor selection.
- **Evidence from real setups:** document reproducible, privacy-reviewed reports by operating system, connection type, adapter and vehicle context. Reports come in through the [real setup report](https://github.com/shoka-jp/obd2-mcp/issues/new?template=hardware-report.yml) form and are listed in [reported setups](./compatibility.md). Mark only combinations actually tested; mock coverage is not hardware validation.
- **Connection guidance:** improve troubleshooting for pairing, port selection, timeouts and reconnects based on reproducible reports. After a timeout or disconnect, the `reconnect` tool reopens the connection without a restart (tested with the mock and a local TCP adapter); collect real-adapter reports of how well it recovers.

### 3. Expand diagnostic evidence carefully

- Permanent trouble codes (Mode 0A) are available since v0.6.0 as `read_permanent_dtcs`. Next, collect real-vehicle reports of how different cars answer it.
- Mode 09 module information (names, calibration IDs and verification numbers from every module that answers, on CAN vehicles) is available as `read_ecu_info`, tested with the mock only. Next, collect real-vehicle reports of how modules answer.
- Mode 06 on-board monitor test results (each self-test with its limits, and misfire counts per cylinder, on CAN vehicles) are available as `read_monitor_tests` since v0.9.0, tested with the mock only. Next, collect real-vehicle reports, and consider names for common manufacturer-defined tests only from published manufacturer tables.
- Explore oxygen-sensor sampling for catalyst-related investigations only with clear sampling limits and without treating a pattern as proof of a failed component.

These are proposals, not supported features. Vehicle, protocol and adapter capabilities vary; a missing reading must not be presented as a clean result. Real-vehicle code clearing remains disabled by default and separately confirmation-gated.

## Help shape the next step

[Open an issue](https://github.com/shoka-jp/obd2-mcp/issues/new/choose) with the task you were trying to complete, expected and actual behavior, and whether you used the mock or a real adapter. For hardware reports, include the operating system, adapter and connection type. Remove VINs, names, contact details, credentials and other sensitive information from logs before sharing. Small reproducible examples and documentation improvements are welcome; see [contributing](../CONTRIBUTING.md).
