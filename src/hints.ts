/**
 * Plain-language next steps for common adapter and vehicle errors. Most people
 * using obd2-mcp are car owners, not IT specialists: an error such as
 * "UNABLE TO CONNECT" should come with something they can do next. The
 * original error text is always kept; a hint is only added when it is known.
 */
const RESTART =
  "Unplug the adapter for a few seconds and plug it back in, then ask Claude to reconnect (the reconnect tool); no restart is needed. If that fails, restart the server (in Claude Desktop, turn the obd2-mcp extension off and on).";

const HINTS: Array<[RegExp, string]> = [
  [
    /UNABLE TO CONNECT|BUS INIT|BUS ERROR|CAN ERROR|STOPPED|DATA ERROR/i,
    "The adapter is working but could not talk to the car. Turn the ignition ON (the engine can stay off, or idle outdoors), push the adapter fully into the OBD-II port, wait a few seconds and try again. Some cars and some low-cost adapters do not work together.",
  ],
  [/NO DATA/i, "The car did not answer this request. Make sure the ignition is ON. If it still has no data, this car may not support this reading; that does not mean the result is clean."],
  [/Timeout waiting for adapter response|Adapter connection is unusable|adapter connection closed/i, `The adapter stopped answering. Check that it is plugged in and its light is on; for Bluetooth, that it is still paired and close to the computer. ${RESTART}`],
  [
    /ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|Timed out after \d+ ms connecting/i,
    "Could not reach the WiFi adapter. Connect this computer to the adapter's own WiFi network (often named OBDII or WiFi_OBDII), then check the address, commonly tcp:192.168.0.10:35000. While connected to it, this computer may have no internet.",
  ],
  [/Adapter rejected AT|Invalid adapter identity/i, "The device on this port answered, but not like an ELM327 adapter. It may be the wrong port: ask to find the adapter again (find_adapter), or check list_serial_ports."],
  [/Compression-ignition readiness/i, "Readiness monitors for diesel engines are not supported yet. Codes and live data can still be read."],
];

export function errorHint(message: string): string | undefined {
  // Errors that already carry a next step (serial open errors, missing
  // serialport package) are left as they are.
  if (/See docs\/troubleshooting\.md|optional dependency/.test(message)) return undefined;
  return HINTS.find(([pattern]) => pattern.test(message))?.[1];
}
