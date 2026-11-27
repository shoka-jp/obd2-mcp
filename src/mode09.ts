/**
 * Mode 09 vehicle information from each control module (ECU): name, calibration
 * IDs and calibration verification numbers. Several modules can answer one
 * request, so these reads run with headers shown (Elm327.withHeaders) and the
 * answers are grouped by the responding module's CAN header.
 *
 * Only CAN (ISO 15765-4) is handled; on older protocols the headers and
 * message layout differ, and the result says the read is not supported there.
 */

export const CAN_PROTOCOLS: Record<string, { name: string; headerHexDigits: number }> = {
  "6": { name: "ISO 15765-4 CAN (11-bit ID, 500 kbaud)", headerHexDigits: 3 },
  "7": { name: "ISO 15765-4 CAN (29-bit ID, 500 kbaud)", headerHexDigits: 8 },
  "8": { name: "ISO 15765-4 CAN (11-bit ID, 250 kbaud)", headerHexDigits: 3 },
  "9": { name: "ISO 15765-4 CAN (29-bit ID, 250 kbaud)", headerHexDigits: 8 },
};

const OTHER_PROTOCOLS: Record<string, string> = {
  "1": "SAE J1850 PWM",
  "2": "SAE J1850 VPW",
  "3": "ISO 9141-2",
  "4": "ISO 14230-4 KWP (5 baud init)",
  "5": "ISO 14230-4 KWP (fast init)",
  A: "SAE J1939 CAN",
  B: "USER1 CAN",
  C: "USER2 CAN",
};

/** The protocol number from ATDPN ("A6" while automatic, "6" when fixed); null if unreadable or not yet found. */
export function protocolNumber(lines: string[]): string | null {
  const match = /^A?([0-9A-C])$/i.exec(lines.join("").trim());
  if (!match || match[1] === "0") return null;
  return match[1].toUpperCase();
}

export function protocolName(number: string): string {
  return CAN_PROTOCOLS[number]?.name ?? OTHER_PROTOCOLS[number] ?? `protocol ${number}`;
}

/**
 * Group headered CAN response lines by header and reassemble each module's
 * ISO-TP message (single frame, or first frame plus consecutive frames).
 * A problem in one module's frames becomes that module's Error, so it does not
 * hide the other modules' answers; a line that cannot be read at all throws.
 */
export function reassembleByHeader(lines: string[], headerHexDigits: number): Map<string, number[] | Error> {
  type Partial = { length: number; data: number[]; nextSeq: number };
  const done = new Map<string, number[] | Error>();
  const open = new Map<string, Partial>();
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, "").toUpperCase();
    if (!/^[0-9A-F]+$/.test(line) || line.length <= headerHexDigits || (line.length - headerHexDigits) % 2) {
      throw new Error(`Unexpected line in a headered response: ${raw}`);
    }
    const header = line.slice(0, headerHexDigits);
    if (done.get(header) instanceof Error) continue;
    const bytes: number[] = [];
    for (let i = headerHexDigits; i < line.length; i += 2) bytes.push(parseInt(line.slice(i, i + 2), 16));
    const fault = (message: string) => {
      open.delete(header);
      done.set(header, new Error(`${message} from ${header}`));
    };
    const kind = bytes[0] >> 4;
    if (kind === 0) {
      const length = bytes[0] & 0x0f;
      if (done.has(header) || open.has(header)) fault("More than one answer");
      else if (length === 0 || length > bytes.length - 1) fault("Invalid single frame");
      else done.set(header, bytes.slice(1, 1 + length));
    } else if (kind === 1) {
      if (done.has(header) || open.has(header)) fault("More than one answer");
      else if (bytes.length < 3) fault("Invalid first frame");
      else open.set(header, { length: ((bytes[0] & 0x0f) << 8) | bytes[1], data: bytes.slice(2), nextSeq: 1 });
    } else if (kind === 2) {
      const partial = open.get(header);
      if (!partial || (bytes[0] & 0x0f) !== partial.nextSeq) fault("Frame out of sequence");
      else {
        partial.data.push(...bytes.slice(1));
        partial.nextSeq = (partial.nextSeq + 1) & 0x0f;
      }
    } else {
      fault("Unexpected frame type");
    }
  }
  for (const [header, partial] of open) {
    done.set(header, partial.data.length < partial.length ? new Error(`Incomplete answer from ${header}`) : partial.data.slice(0, partial.length));
  }
  return done;
}

/** Mode 09 PIDs supported by one module, from its answer to 0900. */
export function supportedInfoPids(payload: number[]): Set<number> {
  if (payload.length !== 6 || payload[0] !== 0x49 || payload[1] !== 0x00) throw new Error("Invalid answer to 0900");
  const pids = new Set<number>();
  for (let bit = 0; bit < 32; bit++) {
    if (payload[2 + Math.floor(bit / 8)] & (0x80 >> (bit % 8))) pids.add(bit + 1);
  }
  return pids;
}

function items(payload: number[], pid: number, size: number): number[][] {
  if (payload.length < 3 || payload[0] !== 0x49 || payload[1] !== pid) throw new Error(`Invalid answer to 09${pid.toString(16).padStart(2, "0").toUpperCase()}`);
  const count = payload[2];
  const data = payload.slice(3);
  if (count === 0 || data.length !== count * size) throw new Error(`Unexpected length in the answer to 09${pid.toString(16).padStart(2, "0").toUpperCase()}`);
  return Array.from({ length: count }, (_, i) => data.slice(i * size, (i + 1) * size));
}

function ascii(bytes: number[], what: string): string {
  const text = String.fromCharCode(...bytes.filter(b => b !== 0x00)).trim();
  if (!/^[\x20-\x7E]+$/.test(text)) throw new Error(`Unreadable ${what}`);
  return text;
}

/** Calibration IDs (PID 04): up to 16 ASCII characters each, padded with zeros. */
export function calibrationIds(payload: number[]): string[] {
  return items(payload, 0x04, 16).map(b => ascii(b, "calibration ID"));
}

/** Calibration verification numbers (PID 06): 4 bytes each, shown as hex. */
export function calibrationVerificationNumbers(payload: number[]): string[] {
  return items(payload, 0x06, 4).map(b => b.map(x => x.toString(16).padStart(2, "0")).join("").toUpperCase());
}

/** ECU name (PID 0A): 20 ASCII characters, an acronym and a name such as "ECM-EngineControl". */
export function ecuName(payload: number[]): string {
  const [name] = items(payload, 0x0a, 20);
  return ascii(name, "module name");
}

/** A negative response (7F 09 code): the module does not support the request. */
export const isNegative = (payload: number[]) => payload[0] === 0x7f && payload[1] === 0x09;
