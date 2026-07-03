import type { Transport } from "./transport.js";

export class NoDataError extends Error {
  constructor(cmd: string) {
    super(`Vehicle returned NO DATA for "${cmd}" (parameter not supported, or ignition off)`);
  }
}

const FATAL_PATTERNS = ["UNABLE TO CONNECT", "CAN ERROR", "BUS INIT", "BUS ERROR", "STOPPED", "DATA ERROR"];

/** ELM327 session: initialization, command hygiene, and OBD response parsing. */
export class Elm327 {
  private initialized = false;

  constructor(private transport: Transport) {}

  describe(): string {
    return this.transport.describe();
  }

  async init(): Promise<string> {
    await this.transport.open();
    const identity = clean(await this.transport.sendRaw("ATZ", 12000)).join(" ");
    for (const cmd of ["ATE0", "ATL0", "ATS0", "ATH0", "ATSP0"]) {
      await this.transport.sendRaw(cmd);
    }
    this.initialized = true;
    return identity;
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialized) await this.init();
  }

  /** Send an AT command; return the cleaned response as one line. */
  async at(cmd: string): Promise<string> {
    await this.ensureInit();
    return clean(await this.transport.sendRaw(cmd)).join(" ");
  }

  /**
   * Send an OBD request ("03", "0101", "020200"…) and return the payload bytes
   * that follow `expectPrefix` (hex, no spaces) in the reassembled response.
   */
  async obd(cmd: string, expectPrefix: string): Promise<number[]> {
    await this.ensureInit();
    const lines = clean(await this.transport.sendRaw(cmd));
    if (lines.some(l => l.includes("NO DATA"))) throw new NoDataError(cmd);
    for (const l of lines) {
      for (const p of FATAL_PATTERNS) {
        if (l.includes(p)) throw new Error(`Adapter error for "${cmd}": ${l}`);
      }
    }
    // Reassemble hex. In multi-frame (ISO-TP) responses the adapter prints a
    // bare length line ("014") followed by "0: …", "1: …" frame lines — drop
    // the length line, strip the frame indices, and concatenate the rest.
    const multiFrame = lines.some(l => l.includes(":"));
    let hex = "";
    for (const l of lines) {
      if (multiFrame && !l.includes(":")) continue;
      const compact = l.replace(/^[0-9A-F]{1,2}:/i, "").replace(/[^0-9A-Fa-f]/g, "");
      hex += compact.toUpperCase();
    }
    const at = hex.indexOf(expectPrefix.toUpperCase());
    if (at === -1) {
      throw new Error(`Unexpected response to "${cmd}": ${lines.join(" | ") || "(empty)"}`);
    }
    const payload = hex.slice(at + expectPrefix.length);
    const bytes: number[] = [];
    for (let i = 0; i + 2 <= payload.length; i += 2) {
      bytes.push(parseInt(payload.slice(i, i + 2), 16));
    }
    return bytes;
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}

/** Split a raw adapter response into trimmed, useful lines (echo and noise removed). */
function clean(raw: string): string[] {
  return raw
    .split(/[\r\n]+/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && l !== "SEARCHING..." && !/^AT/i.test(l));
}
