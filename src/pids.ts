export interface PidDef {
  /** Mode 01 PID as two hex chars, e.g. "0C" */
  pid: string;
  name: string;
  desc: string;
  bytes: number;
  unit: string;
  parse: (b: number[]) => number;
  /** Inverse of parse — used by the mock vehicle. */
  encode: (v: number) => number[];
}

const pct = (a: number) => (a * 100) / 255;
const pctEnc = (v: number) => [Math.round((v * 255) / 100)];
const temp = (a: number) => a - 40;
const tempEnc = (v: number) => [Math.round(v + 40)];
const trim = (a: number) => ((a - 128) * 100) / 128;
const trimEnc = (v: number) => [Math.round((v * 128) / 100 + 128)];
const word = (b: number[]) => b[0] * 256 + b[1];
const wordEnc = (raw: number): number[] => [Math.floor(raw / 256) & 0xff, raw & 0xff];

export const PIDS: PidDef[] = [
  { pid: "04", name: "engine_load", desc: "Calculated engine load", bytes: 1, unit: "%", parse: b => pct(b[0]), encode: pctEnc },
  { pid: "05", name: "coolant_temp", desc: "Engine coolant temperature", bytes: 1, unit: "degC", parse: b => temp(b[0]), encode: tempEnc },
  { pid: "06", name: "stft_b1", desc: "Short term fuel trim, bank 1", bytes: 1, unit: "%", parse: b => trim(b[0]), encode: trimEnc },
  { pid: "07", name: "ltft_b1", desc: "Long term fuel trim, bank 1", bytes: 1, unit: "%", parse: b => trim(b[0]), encode: trimEnc },
  { pid: "08", name: "stft_b2", desc: "Short term fuel trim, bank 2", bytes: 1, unit: "%", parse: b => trim(b[0]), encode: trimEnc },
  { pid: "09", name: "ltft_b2", desc: "Long term fuel trim, bank 2", bytes: 1, unit: "%", parse: b => trim(b[0]), encode: trimEnc },
  { pid: "0A", name: "fuel_pressure", desc: "Fuel pressure (gauge)", bytes: 1, unit: "kPa", parse: b => b[0] * 3, encode: v => [Math.round(v / 3)] },
  { pid: "0B", name: "intake_map", desc: "Intake manifold absolute pressure", bytes: 1, unit: "kPa", parse: b => b[0], encode: v => [Math.round(v)] },
  { pid: "0C", name: "rpm", desc: "Engine RPM", bytes: 2, unit: "rpm", parse: b => word(b) / 4, encode: v => wordEnc(Math.round(v * 4)) },
  { pid: "0D", name: "vehicle_speed", desc: "Vehicle speed", bytes: 1, unit: "km/h", parse: b => b[0], encode: v => [Math.round(v)] },
  { pid: "0E", name: "timing_advance", desc: "Timing advance before TDC", bytes: 1, unit: "deg", parse: b => b[0] / 2 - 64, encode: v => [Math.round((v + 64) * 2)] },
  { pid: "0F", name: "intake_air_temp", desc: "Intake air temperature", bytes: 1, unit: "degC", parse: b => temp(b[0]), encode: tempEnc },
  { pid: "10", name: "maf", desc: "Mass air flow rate", bytes: 2, unit: "g/s", parse: b => word(b) / 100, encode: v => wordEnc(Math.round(v * 100)) },
  { pid: "11", name: "throttle", desc: "Throttle position", bytes: 1, unit: "%", parse: b => pct(b[0]), encode: pctEnc },
  { pid: "14", name: "o2_b1s1_voltage", desc: "O2 sensor bank 1 sensor 1 voltage", bytes: 2, unit: "V", parse: b => b[0] / 200, encode: v => [Math.round(v * 200), 0xff] },
  { pid: "15", name: "o2_b1s2_voltage", desc: "O2 sensor bank 1 sensor 2 voltage", bytes: 2, unit: "V", parse: b => b[0] / 200, encode: v => [Math.round(v * 200), 0xff] },
  { pid: "1F", name: "run_time", desc: "Run time since engine start", bytes: 2, unit: "s", parse: word, encode: v => wordEnc(Math.round(v)) },
  { pid: "21", name: "distance_with_mil", desc: "Distance travelled with MIL on", bytes: 2, unit: "km", parse: word, encode: v => wordEnc(Math.round(v)) },
  { pid: "23", name: "fuel_rail_pressure", desc: "Fuel rail pressure (gauge)", bytes: 2, unit: "kPa", parse: b => word(b) * 10, encode: v => wordEnc(Math.round(v / 10)) },
  { pid: "2C", name: "commanded_egr", desc: "Commanded EGR", bytes: 1, unit: "%", parse: b => pct(b[0]), encode: pctEnc },
  { pid: "2E", name: "evap_purge", desc: "Commanded evaporative purge", bytes: 1, unit: "%", parse: b => pct(b[0]), encode: pctEnc },
  { pid: "2F", name: "fuel_level", desc: "Fuel tank level", bytes: 1, unit: "%", parse: b => pct(b[0]), encode: pctEnc },
  { pid: "30", name: "warmups_since_clear", desc: "Warm-ups since codes cleared", bytes: 1, unit: "count", parse: b => b[0], encode: v => [Math.round(v)] },
  { pid: "31", name: "distance_since_clear", desc: "Distance travelled since codes cleared", bytes: 2, unit: "km", parse: word, encode: v => wordEnc(Math.round(v)) },
  { pid: "33", name: "baro", desc: "Barometric pressure", bytes: 1, unit: "kPa", parse: b => b[0], encode: v => [Math.round(v)] },
  { pid: "3C", name: "catalyst_temp_b1s1", desc: "Catalyst temperature bank 1 sensor 1", bytes: 2, unit: "degC", parse: b => word(b) / 10 - 40, encode: v => wordEnc(Math.round((v + 40) * 10)) },
  { pid: "42", name: "module_voltage", desc: "Control module voltage", bytes: 2, unit: "V", parse: b => word(b) / 1000, encode: v => wordEnc(Math.round(v * 1000)) },
  { pid: "43", name: "absolute_load", desc: "Absolute load value", bytes: 2, unit: "%", parse: b => (word(b) * 100) / 255, encode: v => wordEnc(Math.round((v * 255) / 100)) },
  { pid: "44", name: "commanded_lambda", desc: "Commanded air-fuel equivalence ratio (lambda)", bytes: 2, unit: "lambda", parse: b => (word(b) * 2) / 65536, encode: v => wordEnc(Math.round((v * 65536) / 2)) },
  { pid: "45", name: "relative_throttle", desc: "Relative throttle position", bytes: 1, unit: "%", parse: b => pct(b[0]), encode: pctEnc },
  { pid: "46", name: "ambient_temp", desc: "Ambient air temperature", bytes: 1, unit: "degC", parse: b => temp(b[0]), encode: tempEnc },
  { pid: "49", name: "accelerator_pedal", desc: "Accelerator pedal position D", bytes: 1, unit: "%", parse: b => pct(b[0]), encode: pctEnc },
  { pid: "4D", name: "time_with_mil", desc: "Time run with MIL on", bytes: 2, unit: "min", parse: word, encode: v => wordEnc(Math.round(v)) },
  { pid: "4E", name: "time_since_clear", desc: "Time since trouble codes cleared", bytes: 2, unit: "min", parse: word, encode: v => wordEnc(Math.round(v)) },
  { pid: "5B", name: "hybrid_battery_remaining", desc: "Hybrid battery pack remaining life (meaning varies by manufacturer)", bytes: 1, unit: "%", parse: b => pct(b[0]), encode: pctEnc },
  { pid: "5C", name: "oil_temp", desc: "Engine oil temperature", bytes: 1, unit: "degC", parse: b => temp(b[0]), encode: tempEnc },
  { pid: "5E", name: "fuel_rate", desc: "Engine fuel rate", bytes: 2, unit: "L/h", parse: b => word(b) / 20, encode: v => wordEnc(Math.round(v * 20)) },
];

export const PID_BY_NAME = new Map(PIDS.map(p => [p.name, p]));
export const PID_BY_CODE = new Map(PIDS.map(p => [p.pid, p]));

/** Sensible default set for a first look at a running engine. */
export const DEFAULT_PIDS = [
  "rpm",
  "coolant_temp",
  "engine_load",
  "stft_b1",
  "ltft_b1",
  "intake_air_temp",
  "maf",
  "throttle",
  "vehicle_speed",
  "module_voltage",
];

/** Freeze frame subset (mode 02, frame 00). */
export const FREEZE_PIDS = ["engine_load", "coolant_temp", "stft_b1", "ltft_b1", "intake_map", "rpm", "vehicle_speed"];

/**
 * Other names people and assistants use for the sensors, mapped to this
 * server's names. Keys are normalised by normalisePidInput.
 */
const ALIASES: Record<string, string> = {
  speed: "vehicle_speed", vss: "vehicle_speed", car_speed: "vehicle_speed", 車速: "vehicle_speed", 速度: "vehicle_speed",
  engine_rpm: "rpm", engine_speed: "rpm", revs: "rpm", 回転数: "rpm", エンジン回転数: "rpm",
  coolant: "coolant_temp", coolant_temperature: "coolant_temp", ect: "coolant_temp", engine_temp: "coolant_temp", engine_temperature: "coolant_temp", water_temp: "coolant_temp", 水温: "coolant_temp", 冷却水温: "coolant_temp",
  iat: "intake_air_temp", intake_temp: "intake_air_temp", intake_air_temperature: "intake_air_temp", air_temp: "intake_air_temp", 吸気温: "intake_air_temp",
  map: "intake_map", manifold_pressure: "intake_map", intake_pressure: "intake_map",
  load: "engine_load", calculated_load: "engine_load", 負荷: "engine_load", エンジン負荷: "engine_load",
  tps: "throttle", throttle_position: "throttle", スロットル: "throttle",
  stft: "stft_b1", short_term_fuel_trim: "stft_b1", ltft: "ltft_b1", long_term_fuel_trim: "ltft_b1",
  battery: "module_voltage", voltage: "module_voltage", battery_voltage: "module_voltage", control_module_voltage: "module_voltage", バッテリー電圧: "module_voltage",
  fuel: "fuel_level", fuel_tank: "fuel_level", 燃料残量: "fuel_level",
  oil: "oil_temp", oil_temperature: "oil_temp", engine_oil_temp: "oil_temp", 油温: "oil_temp",
  ambient: "ambient_temp", outside_temp: "ambient_temp", ambient_air_temp: "ambient_temp", 外気温: "ambient_temp",
  lambda: "commanded_lambda", afr: "commanded_lambda", equivalence_ratio: "commanded_lambda",
  egr: "commanded_egr", purge: "evap_purge", evap: "evap_purge", pedal: "accelerator_pedal", accelerator: "accelerator_pedal",
  fuel_consumption: "fuel_rate", fuel_flow: "fuel_rate", 燃料消費率: "fuel_rate",
  hybrid_battery: "hybrid_battery_remaining", hv_battery: "hybrid_battery_remaining", soc: "hybrid_battery_remaining",
  rail_pressure: "fuel_rail_pressure", cat_temp: "catalyst_temp_b1s1", catalyst_temp: "catalyst_temp_b1s1",
  o2: "o2_b1s1_voltage", o2_voltage: "o2_b1s1_voltage", o2_sensor: "o2_b1s1_voltage",
  timing: "timing_advance", ignition_timing: "timing_advance",
  barometric_pressure: "baro", baro_pressure: "baro", runtime: "run_time", engine_run_time: "run_time",
};

function normalisePidInput(input: string): string {
  return input.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

/**
 * Resolve a sensor name as typed: this server's names, common other names
 * ("speed", "coolant", "水温"), or the Mode 01 PID ("0C", "010C"). Unknown
 * names get up to three suggestions instead of the whole list.
 */
export function resolvePidName(input: string): { name: string } | { suggestions: string[] } {
  const key = normalisePidInput(input);
  if (PID_BY_NAME.has(key)) return { name: key };
  if (ALIASES[key]) return { name: ALIASES[key] };
  const code = /^(?:01_?)?([0-9a-f]{2})$/i.exec(key.replace(/_/g, ""));
  if (code && PID_BY_CODE.has(code[1].toUpperCase())) return { name: PID_BY_CODE.get(code[1].toUpperCase())!.name };
  const scored = PIDS.map(p => ({
    name: p.name,
    score: p.name.includes(key) || (key.length >= 3 && key.includes(p.name)) ? 0 : editDistance(key, p.name),
  }))
    .filter(s => s.score <= Math.max(2, Math.floor(key.length / 3)))
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  return { suggestions: scored.slice(0, 3).map(s => s.name) };
}

/** The error text for a sensor name that could not be resolved. */
export function unknownPidMessage(input: string, suggestions: string[]): string {
  return `Unknown sensor name "${input}".${suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""} The read_live_data description lists every name.`;
}
