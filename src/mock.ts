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
  milOn: boolean;
  vin: string;
  freezeDtc: string | null;
  readinessIncomplete: number;
  continuousIncomplete: number;
  /** live values by PID name */
  live: Record<string, number>;
  /** freeze frame values by PID name */
  freeze: Record<string, number>;
}

function defaultState(): MockState {
  return {
    storedDtcs: ["P0420"],
    pendingDtcs: [],
    milOn: true,
    vin: "1HGFC2F59GA000042",
    freezeDtc: "P0420",
    readinessIncomplete: 0x04,
    continuousIncomplete: 0,
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
      baro: 100,
      catalyst_temp_b1s1: 421,
      module_voltage: 14.32,
      ambient_temp: 26,
      oil_temp: 96,
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
  };
}

export const MOCK_SCENARIOS = ["catalyst", "healthy", "misfire", "lean"] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

function scenarioState(scenario: MockScenario): MockState {
  const state = defaultState();
  if (scenario === "healthy") {
    state.storedDtcs = [];
    state.milOn = false;
    state.freezeDtc = null;
    state.readinessIncomplete = 0;
  } else if (scenario === "misfire") {
    state.storedDtcs = ["P0301"];
    state.freezeDtc = "P0301";
    state.live.rpm = 690;
    state.freeze.rpm = 1850;
  } else if (scenario === "lean") {
    state.storedDtcs = ["P0171"];
    state.freezeDtc = "P0171";
    state.live.stft_b1 = 18;
    state.live.ltft_b1 = 15;
    state.freeze.stft_b1 = 19;
    state.freeze.ltft_b1 = 16;
  }
  return state;
}

const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
const join = (bytes: number[]) => bytes.map(hex).join(" ");

export class MockTransport implements Transport {
  private state: MockState;

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
    if (cmd === "ATZ") return "ELM327 v1.5 (obd2-mcp mock)\r";
    if (cmd === "ATI") return "ELM327 v1.5 (obd2-mcp mock)\r";
    if (cmd === "ATRV") return "14.2V\r";
    if (cmd.startsWith("AT")) return "OK\r";

    // Mode 03: stored DTCs (CAN style: count byte + pairs)
    if (cmd === "03") return this.dtcResponse(0x43, this.state.storedDtcs);
    // Mode 07: pending DTCs
    if (cmd === "07") {
      return this.dtcResponse(0x47, this.state.pendingDtcs);
    }
    // Mode 04: clear
    if (cmd === "04") {
      this.state.storedDtcs = [];
      this.state.pendingDtcs = [];
      this.state.milOn = false;
      this.state.freezeDtc = null;
      this.state.readinessIncomplete = 0xe5;
      this.state.continuousIncomplete = 0x70;
      return "44\r";
    }
    // Mode 01 PID 01: MIL / DTC count / readiness
    if (cmd === "0101") {
      const a = (this.state.milOn ? 0x80 : 0) | (this.state.storedDtcs.length & 0x7f);
      const b = 0x07 | this.state.continuousIncomplete; // spark ignition; continuous monitors
      const c = 0xe5; // catalyst, evap, O2 sensor, O2 heater, EGR supported
      const d = this.state.readinessIncomplete;
      return `41 01 ${join([a, b, c, d])}\r`;
    }
    // Mode 09 PID 02: VIN (ISO-TP multi-frame)
    if (cmd === "0902") {
      const vinBytes = [...Buffer.from(this.state.vin, "ascii")];
      const payload = [0x49, 0x02, 0x01, ...vinBytes];
      const total = payload.length;
      let out = total.toString(16).toUpperCase().padStart(3, "0") + "\r";
      for (let frame = 0; frame * 7 < payload.length; frame++) {
        const chunk = payload.slice(frame * 7, frame * 7 + 7);
        out += `${frame.toString(16).toUpperCase()}: ${join(chunk)}\r`;
      }
      return out;
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
