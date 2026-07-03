# obd2-mcp

**English** | [日本語](./README.ja.md)

[![npm](https://img.shields.io/npm/v/obd2-mcp)](https://www.npmjs.com/package/obd2-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

An MCP server that lets AI assistants read your car's OBD-II data through cheap ELM327 adapters — trouble codes, live sensors, freeze frame, readiness monitors, and VIN.

Ask Claude *"why is my check-engine light on?"* and it reads the actual codes from your actual car, pulls the freeze frame before anything gets erased, checks the fuel trims, and reasons about causes — instead of you transcribing scanner output by hand.

**No hardware? It still works.** A built-in mock vehicle (a warm idling sedan with a stored P0420, MIL on, and realistic live data) lets you try everything before buying an adapter.

## Quick start (mock mode — no hardware)

**Claude Code:**

```bash
claude mcp add obd2 -- npx -y obd2-mcp
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "obd2": {
      "command": "npx",
      "args": ["-y", "obd2-mcp"]
    }
  }
}
```

Then ask: *"Read my car's trouble codes and tell me what to check before I spend money."*

## Connecting a real car

You need an ELM327-compatible adapter (USB, Bluetooth-serial, or WiFi — typically $5–30) plugged into the OBD-II port (all gasoline cars since 1996 in the US, roughly 2001+ elsewhere; ignition on).

Set the connection via environment variable or CLI flag:

| Adapter | Setting |
|---|---|
| USB / Bluetooth (serial port) | `OBD2MCP_CONNECTION=serial:COM3` (Windows) / `serial:/dev/ttyUSB0` (Linux) / `serial:/dev/tty.usbserial-XXXX` (macOS) |
| WiFi | `OBD2MCP_CONNECTION=tcp:192.168.0.10:35000` |
| Mock (default) | `OBD2MCP_CONNECTION=mock` |

Serial baud rate defaults to 38400; override with `OBD2MCP_BAUD=115200` if your adapter needs it. Bluetooth adapters must first be paired at the OS level so they expose a serial port.

Claude Code example with a real adapter:

```bash
claude mcp add obd2 --env OBD2MCP_CONNECTION=serial:COM3 -- npx -y obd2-mcp
```

## Tools

| Tool | What it does |
|---|---|
| `read_dtcs` | Stored + pending trouble codes, MIL state, DTC count |
| `read_freeze_frame` | The DTC that set the freeze frame and the engine conditions at that moment |
| `read_live_data` | Live sensors: RPM, coolant temp, fuel trims, MAF, O2 voltages, and more (22 PIDs) |
| `read_readiness` | Emissions monitor completion status (inspection readiness) |
| `read_vin` | Vehicle Identification Number from the ECU |
| `connection_status` | Adapter identity and battery voltage at the port |
| `clear_dtcs` | Clear codes — **requires explicit confirmation**; warns that freeze frame evidence is erased and readiness monitors reset |

## Pairs with automotive-ai-skills 🔧

This server is the *tool* layer. The knowledge layer — how to reason from codes to causes, what to test before buying parts, when to see a professional — lives in [automotive-ai-skills](https://github.com/shoka-jp/automotive-ai-skills):

```text
/plugin marketplace add shoka-jp/automotive-ai-skills
/plugin install automotive-ai-skills@automotive-ai-skills
claude mcp add obd2 -- npx -y obd2-mcp
```

With both installed, Claude reads the codes from your car *and* runs the diagnostic workflow on them.

## Safety and scope

- **Read-only by design.** v0.1 performs no ECU writes, coding, or actuator tests. The only state-changing operation is `clear_dtcs` (standard mode 04), which is gated behind explicit confirmation because it erases evidence.
- **Diagnosis support, not a verdict.** Codes identify failed tests, not failed parts. Verify with physical tests before spending money, and defer safety-critical work (brakes, fuel, SRS, high-voltage) to professionals.
- Never drive while interacting with an AI assistant. Read with the vehicle parked.

## Development

```bash
git clone https://github.com/shoka-jp/obd2-mcp.git
cd obd2-mcp
npm install
npm test        # builds + runs the stdio smoke test against the mock vehicle
```

The mock vehicle answers at the ELM327 protocol level, so tests exercise the full parsing stack (including multi-frame ISO-TP VIN responses).

## Roadmap

- [ ] Mode 06 (on-board monitoring test results)
- [ ] Mode 09 calibration IDs
- [ ] PID auto-discovery (0100/0120/0140 support bitmaps)
- [ ] O2 sensor sweep sampling for catalyst diagnosis
- [ ] Configurable mock scenarios (misfire, lean condition, EVAP leak)

## License

[MIT](./LICENSE) © 2026 Sho Kamakura
