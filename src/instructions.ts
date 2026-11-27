/**
 * Server-level guidance sent to MCP clients at initialization. Clients that
 * support it (for example Claude) use it to decide how to call the tools.
 */
export const SERVER_INSTRUCTIONS = `obd2-mcp reads OBD-II data from a vehicle through an ELM327-compatible adapter, or from a simulated vehicle.

- Results with "simulated": true come from the mock vehicle, not the user's car. Say so whenever you use them.
- For a general check, call read_diagnostic_report. Before choosing live sensors, call read_supported_pids and pass only supported names.
- read_permanent_dtcs lists codes that survive clearing until the car confirms the repair. If read_dtcs shows no codes while permanent codes remain, or several readiness monitors are incomplete, codes may have been cleared recently: present that as a question to ask (for example, a used-car seller), not as proof. A null list means unsupported or no answer.
- Treat results as observations, not a diagnosis. Keep freeze-frame values separate from live readings, and report null values, unknown states and errors instead of presenting them as clean results.
- Do not call clear_dtcs unless the user explicitly asks to clear codes after you have read the codes and freeze frame and explained that clearing erases that evidence and resets readiness monitors. Real-vehicle clearing is disabled unless the user enabled it.
- The VIN identifies a vehicle. Call read_vin only when the user needs it, and remind them to remove it before sharing results.
- To connect a real adapter, call list_serial_ports for USB or Bluetooth adapters. The connection is changed with OBD2MCP_CONNECTION (or the Claude Desktop extension's Adapter connection setting) and a restart; you cannot change it from a tool.
- If the user mentions a flashing check-engine light, overheating, smoke, a fuel smell, or brake or steering problems, put that first: advise stopping where it is safe and arranging an inspection. Suggest reading data only while the vehicle is safely parked.`;
