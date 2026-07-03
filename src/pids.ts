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
  { pid: "0B", name: "intake_map", desc: "Intake manifold absolute pressure", bytes: 1, unit: "kPa", parse: b => b[0], encode: v => [Math.round(v)] },
  { pid: "0C", name: "rpm", desc: "Engine RPM", bytes: 2, unit: "rpm", parse: b => word(b) / 4, encode: v => wordEnc(Math.round(v * 4)) },
  { pid: "0D", name: "vehicle_speed", desc: "Vehicle speed", bytes: 1, unit: "km/h", parse: b => b[0], encode: v => [Math.round(v)] },
  { pid: "0E", name: "timing_advance", desc: "Timing advance before TDC", bytes: 1, unit: "deg", parse: b => b[0] / 2 - 64, encode: v => [Math.round((v + 64) * 2)] },
  { pid: "0F", name: "intake_air_temp", desc: "Intake air temperature", bytes: 1, unit: "degC", parse: b => temp(b[0]), encode: tempEnc },
  { pid: "10", name: "maf", desc: "Mass air flow rate", bytes: 2, unit: "g/s", parse: b => word(b) / 100, encode: v => wordEnc(Math.round(v * 100)) },
  { pid: "11", name: "throttle", desc: "Throttle position", bytes: 1, unit: "%", parse: b => pct(b[0]), encode: pctEnc },
  { pid: "14", name: "o2_b1s1_voltage", desc: "O2 sensor bank 1 sensor 1 voltage", bytes: 2, unit: "V", parse: b => b[0] / 200, encode: v => [Math.round(v * 200), 0xff] },
  { pid: "15", name: "o2_b1s2_voltage", desc: "O2 sensor bank 1 sensor 2 voltage", bytes: 2, unit: "V", parse: b => b[0] / 200, encode: v => [Math.round(v * 200), 0xff] },
  { pid: "2F", name: "fuel_level", desc: "Fuel tank level", bytes: 1, unit: "%", parse: b => pct(b[0]), encode: pctEnc },
  { pid: "33", name: "baro", desc: "Barometric pressure", bytes: 1, unit: "kPa", parse: b => b[0], encode: v => [Math.round(v)] },
  { pid: "3C", name: "catalyst_temp_b1s1", desc: "Catalyst temperature bank 1 sensor 1", bytes: 2, unit: "degC", parse: b => word(b) / 10 - 40, encode: v => wordEnc(Math.round((v + 40) * 10)) },
  { pid: "42", name: "module_voltage", desc: "Control module voltage", bytes: 2, unit: "V", parse: b => word(b) / 1000, encode: v => wordEnc(Math.round(v * 1000)) },
  { pid: "46", name: "ambient_temp", desc: "Ambient air temperature", bytes: 1, unit: "degC", parse: b => temp(b[0]), encode: tempEnc },
  { pid: "5C", name: "oil_temp", desc: "Engine oil temperature", bytes: 1, unit: "degC", parse: b => temp(b[0]), encode: tempEnc },
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
