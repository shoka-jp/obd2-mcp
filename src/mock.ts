import type { Transport } from "./transport.js";
import { encodeDtc } from "./dtc.js";
import { PID_BY_CODE, PID_BY_NAME } from "./pids.js";

/**
 * A simulated vehicle that answers at the ELM327 protocol level, so the whole
 * parsing stack is exercised. The scenario mirrors the P0420 walkthrough in
 * the automotive-ai-skills examples: a warm idling 2016 sedan with a stored
 * catalyst-efficiency code, MIL on, and mildly positive fuel trims.
 */
interface MockState {
  storedDtcs: string[];
  pendingDtcs: string[];
  /** Mode 0A permanent DTCs: survive a scan-tool clear until the ECU confirms the repair. */
  permanentDtcs: string[];
  milOn: boolean;
  vin: string;
  freezeDtc: string | null;
  readinessIncomplete: number;
  continuousIncomplete: number;
  /** Byte C of PID 01: which non-continuous monitors the engine has. */
  readinessSupported: number;
  /** A compression-ignition (diesel) engine: byte B bit 3, and diesel meanings for bytes C and D. */
  diesel: boolean;
  /** live values by PID name */
  live: Record<string, number>;
  /** freeze frame values by PID name */
  freeze: Record<string, number>;
  /** Control modules answering mode 09; empty lists mean the module does not support that PID. */
  modules: MockModule[];
  /** Mode 06 results of the engine module by MID: [TID, UASID, value, min, max] (signed when UASID >= 80). */
  monitorTests: Record<number, MonitorRecord[]>;
}

type MonitorRecord = [tid: number, uasid: number, value: number, min: number, max: number];

interface MockModule {
  /** 11-bit CAN response header, e.g. 7E8 for the engine. */
  header: string;
  name: string;
  calibrationIds: string[];
  cvns: string[];
}

function defaultState(): MockState {
  return {
    storedDtcs: ["P0420"],
    pendingDtcs: [],
    permanentDtcs: ["P0420"],
    milOn: true,
    vin: "1HGFC2F59GA000042",
    freezeDtc: "P0420",
    readinessIncomplete: 0x04,
    continuousIncomplete: 0,
    readinessSupported: 0xe5,
    diesel: false,
    live: {
      rpm: 748,
      coolant_temp: 89,
      engine_load: 23.5,
      stft_b1: 1.6,
      ltft_b1: 3.1,
      stft_b2: 0.8,
      ltft_b2: 2.3,
      intake_air_temp: 31,
      intake_map: 32,
      maf: 3.1,
      throttle: 14.9,
      vehicle_speed: 0,
      timing_advance: 12,
      o2_b1s1_voltage: 0.45,
      o2_b1s2_voltage: 0.66,
      fuel_level: 62,
      warmups_since_clear: 18,
      distance_since_clear: 350,
      baro: 100,
      catalyst_temp_b1s1: 421,
      module_voltage: 14.32,
      ambient_temp: 26,
      oil_temp: 96,
      run_time: 640,
      distance_with_mil: 128,
      evap_purge: 12.2,
      absolute_load: 21.2,
      commanded_lambda: 1,
      relative_throttle: 3.1,
      accelerator_pedal: 0,
      time_with_mil: 95,
      time_since_clear: 1180,
      fuel_rate: 0.75,
      odometer: 84213.6,
    },
    freeze: {
      engine_load: 34.5,
      coolant_temp: 88,
      stft_b1: 2.3,
      ltft_b1: 3.1,
      intake_map: 41,
      rpm: 2210,
      vehicle_speed: 98,
    },
    modules: [
      { header: "7E8", name: "ECM-EngineControl", calibrationIds: ["MOCK-ECM-A540"], cvns: ["4E1F2A3C"] },
      { header: "7E9", name: "TCM-TransmissionCtl", calibrationIds: ["MOCK-TCM-A120"], cvns: [] },
    ],
    monitorTests: {
      0x01: [[0x05, 0x10, 72, 0, 100], [0x06, 0x10, 64, 0, 100]], // O2 B1S1 switch times (ms)
      0x02: [[0x07, 0x0a, 817, 0, 3600]], // O2 B1S2 minimum voltage, 0.10 V of at most 0.44 V
      0x21: [[0x80, 0x06, 2689, 0, 2131]], // catalyst bank 1 above its limit: the P0420 test
      0x3b: [[0x80, 0x01, 18, 0, 80]],
      0x3c: [[0x80, 0x01, 22, 0, 80]],
      0x81: [[0x80, 0x83, 310, -2500, 2500]], // fuel system bank 1, signed
      0xa2: [[0x0b, 0x24, 0, 0, 0], [0x0c, 0x24, 0, 0, 0]],
      0xa3: [[0x0b, 0x24, 0, 0, 0], [0x0c, 0x24, 0, 0, 0]],
      0xa4: [[0x0b, 0x24, 1, 0, 0], [0x0c, 0x24, 0, 0, 0]],
      0xa5: [[0x0b, 0x24, 0, 0, 0], [0x0c, 0x24, 0, 0, 0]],
    },
  };
}

export const MOCK_SCENARIOS = ["catalyst", "healthy", "misfire", "lean", "evap", "cleared", "partial", "diesel"] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

function scenarioState(scenario: MockScenario): MockState {
  const state = defaultState();
  if (scenario === "healthy") {
    state.storedDtcs = [];
    state.permanentDtcs = [];
    state.milOn = false;
    state.freezeDtc = null;
    state.readinessIncomplete = 0;
    state.live.distance_with_mil = 0;
    state.live.time_with_mil = 0;
    state.monitorTests[0x21] = [[0x80, 0x06, 689, 0, 2131]];
  } else if (scenario === "misfire") {
    state.storedDtcs = ["P0301"];
    state.permanentDtcs = ["P0301"];
    state.freezeDtc = "P0301";
    state.monitorTests[0x21] = [[0x80, 0x06, 689, 0, 2131]];
    state.monitorTests[0xa2] = [[0x0b, 0x24, 46, 0, 0], [0x0c, 0x24, 38, 0, 0]];
    state.live.rpm = 690;
    state.freeze.rpm = 1850;
  } else if (scenario === "lean") {
    state.storedDtcs = ["P0171"];
    state.permanentDtcs = ["P0171"];
    state.freezeDtc = "P0171";
    state.live.stft_b1 = 18;
    state.live.ltft_b1 = 15;
    state.freeze.stft_b1 = 19;
    state.freeze.ltft_b1 = 16;
    state.monitorTests[0x21] = [[0x80, 0x06, 689, 0, 2131]];
    state.monitorTests[0x81] = [[0x80, 0x83, 3300, -2500, 2500]]; // above the lean limit
  } else if (scenario === "cleared") {
    // Codes were cleared shortly before (for example before a sale): nothing
    // stored and the MIL off, but the permanent P0420 remains and several
    // monitors have not re-run yet.
    state.storedDtcs = [];
    state.milOn = false;
    state.freezeDtc = null;
    state.readinessIncomplete = 0x25; // catalyst, evaporative system and O2 sensor incomplete
    state.live.distance_with_mil = 0;
    state.live.warmups_since_clear = 1;
    state.live.distance_since_clear = 12;
    state.live.time_since_clear = 22;
    state.live.time_with_mil = 0;
    state.live.run_time = 410;
    // Clearing also erased the Mode 06 results; most tests have not run again yet.
    for (const records of Object.values(state.monitorTests)) for (const r of records) r.fill(0, 2);
    state.monitorTests[0x01] = [[0x05, 0x10, 70, 0, 100], [0x06, 0x10, 66, 0, 100]];
  } else if (scenario === "partial") {
    state.storedDtcs = ["P0128"];
    state.permanentDtcs = ["P0128"];
    state.milOn = true;
    state.live.coolant_temp = 72;
    state.freezeDtc = null;
    for (const pid of ["maf", "stft_b2", "ltft_b2", "oil_temp", "ambient_temp"]) {
      delete state.live[pid];
    }
    // Only the engine answers, and only with its name. No Mode 06 either.
    state.modules = [{ header: "7E8", name: "ECM-EngineControl", calibrationIds: [], cvns: [] }];
    state.monitorTests = {};
  } else if (scenario === "diesel") {
    // A diesel with a particulate filter that cannot regenerate on short trips.
    state.diesel = true;
    state.storedDtcs = ["P2463"];
    state.permanentDtcs = ["P2463"];
    state.freezeDtc = "P2463";
    state.readinessSupported = 0xeb; // NMHC catalyst, NOx/SCR, boost, exhaust gas sensor, PM filter, EGR/VVT
    state.readinessIncomplete = 0x40; // PM filter
    state.vin = "JMZKF6W7A00000042";
    for (const pid of ["o2_b1s1_voltage", "o2_b1s2_voltage", "stft_b1", "ltft_b1", "stft_b2", "ltft_b2", "evap_purge", "commanded_lambda"]) {
      delete state.live[pid];
      delete state.freeze[pid];
    }
    state.live.rpm = 820;
    state.live.intake_map = 104;
    state.live.catalyst_temp_b1s1 = 265;
    state.freeze.rpm = 1650;
    state.freeze.vehicle_speed = 42;
    state.monitorTests = {
      0x21: [[0x80, 0x06, 540, 0, 2131]], // NMHC catalyst
      0xb0: [[0x80, 0x01, 0, 0, 0]], // particulate filter: not run
    };
  } else if (scenario === "evap") {
    state.storedDtcs = ["P0456"];
    state.permanentDtcs = ["P0456"];
    state.freezeDtc = "P0456";
    state.monitorTests[0x21] = [[0x80, 0x06, 689, 0, 2131]];
    state.monitorTests[0x3c] = [[0x80, 0x01, 96, 0, 80]]; // very small leak test failed
  }
  return state;
}

const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
const join = (bytes: number[]) => bytes.map(hex).join(" ");

export class MockTransport implements Transport {
  private state: MockState;
  /** ATH1: show CAN headers and ISO-TP frame bytes, as a real ELM327 does. */
  private headers = false;
  /** The protocol is found on the first OBD request after ATZ (ATDPN answers A0 until then). */
  private protocolFound = false;

  constructor(private scenario: MockScenario = "catalyst") {
    if (!MOCK_SCENARIOS.includes(scenario)) throw new Error(`Unknown mock scenario: ${scenario}. Choose: ${MOCK_SCENARIOS.join(", ")}`);
    this.state = scenarioState(scenario);
  }

  describe(): string {
    return `mock:${this.scenario} (simulated vehicle — no real car connected)`;
  }

  open(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  sendRaw(cmd: string): Promise<string> {
    return Promise.resolve(this.respond(cmd.trim().toUpperCase().replace(/\s+/g, "")));
  }

  private respond(cmd: string): string {
    // AT commands
    if (cmd === "ATZ") {
      this.headers = false;
      this.protocolFound = false;
      return "ELM327 v1.5 (obd2-mcp mock)\r";
    }
    if (cmd === "ATH1" || cmd === "ATH0") {
      this.headers = cmd === "ATH1";
      return "OK\r";
    }
    if (cmd === "ATDPN") return this.protocolFound ? "A6\r" : "A0\r";
    if (cmd === "ATI") return "ELM327 v1.5 (obd2-mcp mock)\r";
    if (cmd === "ATRV") return "14.2V\r";
    if (cmd.startsWith("AT")) return "OK\r";
    this.protocolFound = true;

    // Mode 09 module information: each module answers for itself.
    if (["0900", "0904", "0906", "090A"].includes(cmd)) return this.moduleInfo(parseInt(cmd.slice(2), 16));
    const answer = this.answer(cmd);
    if (!this.headers || answer === "NO DATA\r" || answer === "?\r") return answer;
    // With headers on, the engine module answers as a single frame or ISO-TP frames.
    const payload = headerlessPayload(answer);
    return lines(interleave([isoTpFrames(payload).map(f => `${this.state.modules[0].header} ${join(f)}`)]));
  }

  private moduleInfo(pid: number): string {
    const answers: Array<{ header: string; payload: number[] }> = [];
    for (const [index, module] of this.state.modules.entries()) {
      const supported = new Set([0x0a, ...(index === 0 ? [0x02] : []), ...(module.calibrationIds.length ? [0x04] : []), ...(module.cvns.length ? [0x06] : [])]);
      let payload: number[] | null = null;
      if (pid === 0x00) {
        const bitmap = [0, 0, 0, 0];
        for (const p of supported) bitmap[Math.floor((p - 1) / 8)] |= 0x80 >> ((p - 1) % 8);
        payload = [0x49, 0x00, ...bitmap];
      } else if (pid === 0x0a) {
        payload = [0x49, 0x0a, 0x01, ...padded(module.name.replace("-", "\0-").slice(0, 20), 20)];
      } else if (pid === 0x04 && supported.has(0x04)) {
        payload = [0x49, 0x04, module.calibrationIds.length, ...module.calibrationIds.flatMap(id => padded(id, 16))];
      } else if (pid === 0x06 && supported.has(0x06)) {
        payload = [0x49, 0x06, module.cvns.length, ...module.cvns.flatMap(c => c.match(/../g)!.map(b => parseInt(b, 16)))];
      }
      if (payload) answers.push({ header: module.header, payload });
    }
    if (answers.length === 0) return "NO DATA\r";
    if (this.headers) return lines(interleave(answers.map(a => isoTpFrames(a.payload).map(f => `${a.header} ${join(f)}`))));
    // Without headers several modules' answers cannot be told apart, as on a real adapter.
    return answers.map(a => headerlessFrames(a.payload)).join("");
  }

  private answer(cmd: string): string {
    // Mode 03: stored DTCs (CAN style: count byte + pairs)
    if (cmd === "03") return this.dtcResponse(0x43, this.state.storedDtcs);
    // Mode 07: pending DTCs
    if (cmd === "07") {
      return this.dtcResponse(0x47, this.state.pendingDtcs);
    }
    // Mode 0A: permanent DTCs
    if (cmd === "0A") return this.dtcResponse(0x4a, this.state.permanentDtcs);
    // Mode 04: clear. Permanent DTCs deliberately stay, as on a real ECU:
    // they clear only after the monitor confirms the repair.
    if (cmd === "04") {
      this.state.storedDtcs = [];
      this.state.pendingDtcs = [];
      this.state.milOn = false;
      this.state.freezeDtc = null;
      this.state.readinessIncomplete = 0xe5;
      this.state.continuousIncomplete = 0x70;
      for (const records of Object.values(this.state.monitorTests)) for (const r of records) r.fill(0, 2);
      for (const pid of ["distance_with_mil", "warmups_since_clear", "distance_since_clear", "time_with_mil", "time_since_clear"]) {
        if (pid in this.state.live) {
          this.state.live[pid] = 0;
        }
      }
      return "44\r";
    }
    // Mode 01 support bitmaps: advertise exactly the implemented mock commands.
    if (/^01(00|20|40|60|80|A0)$/.test(cmd)) {
      const base = parseInt(cmd.slice(2), 16);
      const bytes = [0, 0, 0, 0];
      const implemented = [0x01, 0x41, ...[...PID_BY_CODE.values()].filter(def => def.name in this.state.live).map(def => parseInt(def.pid, 16))];
      const highest = Math.max(...implemented);
      // Each range advertises the next support query only if something lies beyond it.
      const continuation = [0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0].filter(pid => pid < highest);
      if (base > 0 && !continuation.includes(base)) return "NO DATA\r";
      const supported = [...implemented, ...continuation];
      for (const pid of supported) {
        const bit = pid - base - 1;
        if (bit >= 0 && bit < 32) bytes[Math.floor(bit / 8)] |= 0x80 >> (bit % 8);
      }
      return `41 ${hex(base)} ${join(bytes)}\r`;
    }
    // Mode 01 PID 01: MIL / DTC count / readiness
    if (cmd === "0101") {
      const a = (this.state.milOn ? 0x80 : 0) | (this.state.storedDtcs.length & 0x7f);
      const b = 0x07 | this.state.continuousIncomplete | (this.state.diesel ? 0x08 : 0); // continuous monitors; bit 3: diesel
      const c = this.state.readinessSupported; // catalyst, evap, O2 sensor, O2 heater, EGR supported (petrol default)
      const d = this.state.readinessIncomplete;
      return `41 01 ${join([a, b, c, d])}\r`;
    }
    // Mode 06: monitor test results, engine module only.
    if (/^06[0-9A-F]{2}$/.test(cmd)) return this.monitorTestAnswer(parseInt(cmd.slice(2), 16));
    // Mode 01 PID 41: monitor status this drive cycle (byte A reserved). The EVAP
    // test has not been enabled yet on this drive and the catalyst test is still running.
    if (cmd === "0141") {
      const b = 0x07 | this.state.continuousIncomplete | (this.state.diesel ? 0x08 : 0);
      const c = this.state.readinessSupported & ~0x04;
      const d = c & (0x01 | this.state.readinessIncomplete);
      return `41 41 ${join([0, b, c, d])}\r`;
    }
    // Mode 09 PID 02: VIN (ISO-TP multi-frame)
    if (cmd === "0902") {
      const vinBytes = [...Buffer.from(this.state.vin, "ascii")];
      return headerlessFrames([0x49, 0x02, 0x01, ...vinBytes]);
    }
    // Mode 02: freeze frame, frame 00
    if (cmd.startsWith("02") && cmd.endsWith("00") && cmd.length === 6) {
      if (!this.state.freezeDtc) return "NO DATA\r";
      const pid = cmd.slice(2, 4);
      if (pid === "02") {
        const [a, b] = encodeDtc(this.state.freezeDtc);
        return `42 02 00 ${join([a, b])}\r`;
      }
      const def = PID_BY_CODE.get(pid);
      if (def && def.name in this.state.freeze) {
        return `42 ${pid} 00 ${join(def.encode(this.state.freeze[def.name]))}\r`;
      }
      return "NO DATA\r";
    }
    // Mode 01: live data
    if (cmd.startsWith("01") && cmd.length === 4) {
      const pid = cmd.slice(2, 4);
      const def = PID_BY_CODE.get(pid);
      if (def && def.name in this.state.live) {
        const value = this.jitter(def.name, this.state.live[def.name]);
        return `41 ${pid} ${join(def.encode(value))}\r`;
      }
      return "NO DATA\r";
    }
    return "?\r";
  }

  private monitorTestAnswer(mid: number): string {
    const mids = Object.keys(this.state.monitorTests).map(Number);
    if (mids.length === 0) return "NO DATA\r";
    if (mid % 0x20 === 0) {
      const continuation = [0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0].filter(m => m < Math.max(...mids));
      if (mid > 0 && !continuation.includes(mid)) return "NO DATA\r";
      const bitmap = [0, 0, 0, 0];
      for (const m of [...mids, ...continuation]) {
        const bit = m - mid - 1;
        if (bit >= 0 && bit < 32) bitmap[Math.floor(bit / 8)] |= 0x80 >> (bit % 8);
      }
      return headerlessFrames([0x46, mid, ...bitmap]);
    }
    const records = this.state.monitorTests[mid];
    if (!records) return "NO DATA\r";
    const word = (n: number) => [(n >> 8) & 0xff, n & 0xff];
    return headerlessFrames([0x46, ...records.flatMap(([tid, uasid, value, min, max]) => [mid, tid, uasid, ...word(value), ...word(min), ...word(max)])]);
  }

  private dtcResponse(mode: number, codes: string[]): string {
    const pairs = codes.flatMap(c => encodeDtc(c));
    return `${hex(mode)} ${hex(codes.length)} ${join(pairs)}`.trim() + "\r";
  }

  /** Small realistic wobble on rpm, trims, and O2 so repeated reads look alive. */
  private jitter(name: string, base: number): number {
    if (name === "rpm") return base + Math.round(Math.random() * 24 - 12);
    if (name.startsWith("stft")) return base + (Math.random() * 1.6 - 0.8);
    if (name === "o2_b1s1_voltage") return 0.1 + Math.random() * 0.7; // switching sensor
    if (name === "maf") return base + (Math.random() * 0.3 - 0.15);
    return base;
  }
}

/** Exported for tests. */
export function mockPidNames(): string[] {
  return [...PID_BY_NAME.keys()];
}

/** An answer in the ELM327's headerless format: one line, or a length line and "0:", "1:" frame lines. */
function headerlessFrames(payload: number[]): string {
  if (payload.length <= 7) return `${join(payload)}\r`;
  let out = payload.length.toString(16).toUpperCase().padStart(3, "0") + "\r";
  for (let frame = 0; frame * 7 < payload.length; frame++) {
    out += `${frame.toString(16).toUpperCase()}: ${join(payload.slice(frame * 7, frame * 7 + 7))}\r`;
  }
  return out;
}

/** The bytes of a headerless single-line or multi-frame answer. */
function headerlessPayload(answer: string): number[] {
  const rows = answer.split("\r").filter(Boolean);
  const data = rows.length > 1 ? rows.slice(1).map(r => r.replace(/^[0-9A-F]+:\s*/, "")) : rows;
  return data.join(" ").trim().split(/\s+/).map(b => parseInt(b, 16));
}

/** ISO-TP frames (8 data bytes each, padded with 00) as shown with headers on. */
function isoTpFrames(payload: number[]): number[][] {
  const pad = (f: number[]) => [...f, ...Array(8 - f.length).fill(0)];
  if (payload.length <= 7) return [pad([payload.length, ...payload])];
  const frames = [[0x10 | (payload.length >> 8), payload.length & 0xff, ...payload.slice(0, 6)]];
  for (let i = 6, seq = 1; i < payload.length; i += 7, seq = (seq + 1) & 0x0f) {
    frames.push(pad([0x20 | seq, ...payload.slice(i, i + 7)]));
  }
  return frames;
}

/** Several modules' frames in round-robin order, as their answers overlap on the bus. */
function interleave(groups: string[][]): string[] {
  const out: string[] = [];
  for (let i = 0; groups.some(g => i < g.length); i++) {
    for (const g of groups) if (i < g.length) out.push(g[i]);
  }
  return out;
}

const lines = (rows: string[]) => rows.map(r => `${r}\r`).join("");

function padded(text: string, size: number): number[] {
  const bytes = [...Buffer.from(text, "ascii")].slice(0, size);
  return [...bytes, ...Array(size - bytes.length).fill(0)];
}
