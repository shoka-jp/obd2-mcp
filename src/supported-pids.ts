import type { Elm327 } from "./elm327.js";
import { NoDataError } from "./elm327.js";
import { PIDS } from "./pids.js";

type Support = "supported" | "not_advertised" | "unknown";
type Block = {
  request: string;
  supported_pids: string[] | null;
  error?: string;
};

const hex = (value: number) => value.toString(16).toUpperCase().padStart(2, "0");

/** Read only the Mode 01 support ranges used by our live sensor definitions. */
export async function discoverSupportedPids(elm: Pick<Elm327, "obd">) {
  const support = new Map<number, Support>();
  const blocks: Block[] = [];
  let advertised = true;
  let complete = true;
  for (const base of [0x00, 0x20, 0x40]) {
    if (!advertised) {
      for (let pid = base + 1; pid <= base + 32; pid++) support.set(pid, "not_advertised");
      continue;
    }
    const request = `01${hex(base)}`;
    try {
      const bytes = await elm.obd(request, `41${hex(base)}`);
      if (bytes.length !== 4) throw new Error(`Invalid support bitmap for ${request}: expected 4 bytes, received ${bytes.length}`);
      const supported: string[] = [];
      // A7 represents base + 1; D0 represents base + 32 (the next support query).
      for (let bit = 0; bit < 32; bit++) {
        const present = (bytes[Math.floor(bit / 8)] & (0x80 >> (bit % 8))) !== 0;
        support.set(base + bit + 1, present ? "supported" : "not_advertised");
        if (present) supported.push(hex(base + bit + 1));
      }
      blocks.push({ request, supported_pids: supported });
      advertised = support.get(base + 32) === "supported";
    } catch (error) {
      blocks.push({
        request,
        supported_pids: null,
        error: error instanceof NoDataError
          ? "No data: support is unknown; the ignition may be off or the vehicle may not have responded."
          : String(error instanceof Error ? error.message : error),
      });
      complete = false;
      break; // Do not guess support for this or any later range.
    }
  }
  const sensors = PIDS.map(({ name, pid, unit }) => ({
    name, pid, unit, support: support.get(parseInt(pid, 16)) ?? "unknown",
  }));
  return {
    mode: "01",
    pid_range: "01-60",
    collected_at: new Date().toISOString(),
    complete,
    supported_sensor_names: sensors.filter(sensor => sensor.support === "supported").map(sensor => sensor.name),
    sensors,
    blocks,
    note: "Support flags describe what the responding vehicle advertises, not a successful sensor reading. Only the 01-60 range used by this server is covered. Unknown support must not be treated as unsupported. An empty pids array in a live read or diagnostic report still selects the defaults.",
  };
}
