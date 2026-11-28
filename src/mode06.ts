/**
 * Mode 06 on-board monitor test results (SAE J1979 / ISO 15031-5, CAN format).
 *
 * Each answer is 46 followed by 9-byte records:
 *   OBDMID, TID, UASID, test value (2 bytes), minimum (2), maximum (2).
 * The monitor ID (MID) names the system (catalyst bank 1, oxygen sensor
 * bank 1 sensor 2, misfire cylinder 3, …); TIDs from 80 up are defined by the
 * manufacturer. Pass or fail is decided from the raw numbers, so it does not
 * depend on knowing the unit; the unit and scaling (UASID) are only applied to
 * show the numbers, and only for well-known UASIDs.
 */

const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");

/** Support queries: 0600, 0620, … 06E0. */
export const SUPPORT_MIDS = [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0];

/** MIDs this server can request, from its answer to a support query (06 00, 06 20, …). */
export function supportedMids(payload: number[], base: number): Set<number> {
  if (payload.length !== 6 || payload[0] !== 0x46 || payload[1] !== base) throw new Error(`Invalid answer to 06${hex(base)}`);
  const mids = new Set<number>();
  for (let bit = 0; bit < 32; bit++) {
    if (payload[2 + Math.floor(bit / 8)] & (0x80 >> (bit % 8))) mids.add(base + bit + 1);
  }
  return mids;
}

/** A negative response (7F 06 code): the module does not support the request. */
export const isNegative06 = (payload: number[]) => payload[0] === 0x7f && payload[1] === 0x06;

const bank = (n: number) => `bank ${n}`;
const o2 = (index: number) => `bank ${Math.floor(index / 4) + 1} sensor ${(index % 4) + 1}`;

/** The monitor a MID belongs to, as a group name and a readable label. */
export function describeMid(mid: number): { group: string; monitor: string } {
  if (mid >= 0x01 && mid <= 0x10) return { group: "oxygen_sensor", monitor: `Oxygen sensor ${o2(mid - 0x01)}` };
  if (mid >= 0x21 && mid <= 0x24) return { group: "catalyst", monitor: `Catalyst ${bank(mid - 0x20)}` };
  if (mid >= 0x31 && mid <= 0x34) return { group: "egr_vvt", monitor: `EGR ${bank(mid - 0x30)}` };
  if (mid >= 0x35 && mid <= 0x38) return { group: "egr_vvt", monitor: `Variable valve timing ${bank(mid - 0x34)}` };
  const evap: Record<number, string> = {
    0x39: "EVAP leak test (cap off, 0.150 in)",
    0x3a: "EVAP leak test (0.090 in)",
    0x3b: "EVAP leak test (0.040 in)",
    0x3c: "EVAP leak test (0.020 in)",
    0x3d: "EVAP purge flow",
  };
  if (evap[mid]) return { group: "evaporative_system", monitor: evap[mid] };
  if (mid >= 0x41 && mid <= 0x50) return { group: "oxygen_sensor_heater", monitor: `Oxygen sensor heater ${o2(mid - 0x41)}` };
  if (mid >= 0x61 && mid <= 0x64) return { group: "heated_catalyst", monitor: `Heated catalyst ${bank(mid - 0x60)}` };
  if (mid >= 0x71 && mid <= 0x74) return { group: "secondary_air", monitor: `Secondary air ${mid - 0x70}` };
  if (mid >= 0x81 && mid <= 0x84) return { group: "fuel_system", monitor: `Fuel system ${bank(mid - 0x80)}` };
  if (mid >= 0x85 && mid <= 0x86) return { group: "boost_pressure", monitor: `Boost pressure ${bank(mid - 0x84)}` };
  if (mid >= 0x90 && mid <= 0x91) return { group: "nox", monitor: `NOx adsorber ${bank(mid - 0x8f)}` };
  if (mid >= 0x98 && mid <= 0x99) return { group: "nox", monitor: `NOx catalyst ${bank(mid - 0x97)}` };
  if (mid === 0xa1) return { group: "misfire", monitor: "Misfire (general)" };
  if (mid >= 0xa2 && mid <= 0xad) return { group: "misfire", monitor: `Misfire cylinder ${mid - 0xa1}` };
  if (mid >= 0xb0 && mid <= 0xb1) return { group: "pm_filter", monitor: `Particulate filter ${bank(mid - 0xaf)}` };
  return { group: "other", monitor: `Monitor ${hex(mid)}` };
}

export const MONITOR_GROUPS = [
  "misfire",
  "catalyst",
  "oxygen_sensor",
  "oxygen_sensor_heater",
  "evaporative_system",
  "egr_vvt",
  "secondary_air",
  "fuel_system",
  "heated_catalyst",
  "boost_pressure",
  "nox",
  "pm_filter",
] as const;

/** Standard test IDs (below 80). Oxygen-sensor tests 01-0A, misfire counts 0B and 0C. */
function testName(mid: number, tid: number): string | undefined {
  if (mid >= 0xa1 && mid <= 0xad) {
    if (tid === 0x0b) return "Misfires, average of the last 10 drives";
    if (tid === 0x0c) return "Misfires, this or the last drive";
  }
  if (mid >= 0x01 && mid <= 0x10) {
    return [
      "Rich to lean sensor threshold voltage",
      "Lean to rich sensor threshold voltage",
      "Low sensor voltage for switch time calculation",
      "High sensor voltage for switch time calculation",
      "Rich to lean sensor switch time",
      "Lean to rich sensor switch time",
      "Minimum sensor voltage",
      "Maximum sensor voltage",
      "Time between sensor transitions",
      "Sensor period",
    ][tid - 1];
  }
  return undefined;
}

/** Well-known units and scaling IDs. Anything else is shown raw with unit null. */
const UASIDS: Record<number, { scale: number; unit: string | null; offset?: number }> = {
  0x01: { scale: 1, unit: null },
  0x02: { scale: 0.1, unit: null },
  0x03: { scale: 0.01, unit: null },
  0x04: { scale: 0.001, unit: null },
  0x05: { scale: 0.0000305, unit: null },
  0x06: { scale: 0.000305, unit: null },
  0x0a: { scale: 0.000122, unit: "V" },
  0x0b: { scale: 0.001, unit: "V" },
  0x0c: { scale: 0.01, unit: "V" },
  0x10: { scale: 1, unit: "ms" },
  0x11: { scale: 0.1, unit: "s" },
  0x12: { scale: 1, unit: "s" },
  0x16: { scale: 0.1, unit: "degC", offset: -40 },
  0x20: { scale: 0.0039062, unit: "ratio" },
  0x24: { scale: 1, unit: "counts" },
  0x25: { scale: 1, unit: "km" },
  0x81: { scale: 1, unit: null },
  0x82: { scale: 0.1, unit: null },
  0x83: { scale: 0.01, unit: null },
  0x84: { scale: 0.001, unit: null },
  0x85: { scale: 0.0000305, unit: null },
  0x86: { scale: 0.000305, unit: null },
};

const round = (n: number) => Number(n.toPrecision(6));

export type MonitorTest = {
  mid: string;
  monitor: string;
  tid: string;
  test?: string;
  manufacturer_defined?: true;
  value: number;
  min: number;
  max: number;
  unit: string | null;
  scaling?: "unknown";
  result: "pass" | "fail" | "not_run" | "counts";
};

/** Decode every record in one module's answer to 06<mid>. */
export function parseMonitorTests(payload: number[], mid: number): MonitorTest[] {
  if (payload[0] !== 0x46 || payload.length < 10 || (payload.length - 1) % 9) throw new Error(`Invalid answer to 06${hex(mid)}`);
  const { monitor } = describeMid(mid);
  const tests: MonitorTest[] = [];
  for (let i = 1; i < payload.length; i += 9) {
    const r = payload.slice(i, i + 9);
    if (r[0] !== mid) throw new Error(`Answer to 06${hex(mid)} contains monitor ${hex(r[0])}`);
    const [tid, uasid] = [r[1], r[2]];
    const signed = uasid >= 0x80;
    const word = (hi: number, lo: number) => {
      const raw = (hi << 8) | lo;
      return signed && raw >= 0x8000 ? raw - 0x10000 : raw;
    };
    const [value, min, max] = [word(r[3], r[4]), word(r[5], r[6]), word(r[7], r[8])];
    const misfireCount = mid >= 0xa1 && mid <= 0xad && (tid === 0x0b || tid === 0x0c);
    const result: MonitorTest["result"] = misfireCount
      ? "counts"
      : value === 0 && min === 0 && max === 0
        ? "not_run"
        : value < min || value > max
          ? "fail"
          : "pass";
    const scaling = UASIDS[uasid];
    const show = (raw: number) => (scaling ? round(raw * scaling.scale + (scaling.offset ?? 0)) : raw);
    const name = tid < 0x80 ? testName(mid, tid) : undefined;
    tests.push({
      mid: hex(mid),
      monitor,
      tid: hex(tid),
      ...(name ? { test: name } : {}),
      ...(tid >= 0x80 ? { manufacturer_defined: true as const } : {}),
      value: show(value),
      min: show(min),
      max: show(max),
      unit: scaling ? scaling.unit : null,
      ...(scaling ? {} : { scaling: "unknown" as const }),
      result,
    });
  }
  return tests;
}
