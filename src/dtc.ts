const LETTERS = ["P", "C", "B", "U"] as const;

/** Decode a 2-byte DTC pair into e.g. "P0420". Returns null for the 0x0000 filler. */
export function decodeDtcPair(a: number, b: number): string | null {
  if (a === 0 && b === 0) return null;
  const letter = LETTERS[(a >> 6) & 0x03];
  const d1 = (a >> 4) & 0x03;
  const d2 = a & 0x0f;
  const d3 = (b >> 4) & 0x0f;
  const d4 = b & 0x0f;
  return `${letter}${d1}${d2.toString(16).toUpperCase()}${d3.toString(16).toUpperCase()}${d4.toString(16).toUpperCase()}`;
}

/** Encode "P0420" into its 2-byte pair. */
export function encodeDtc(code: string): [number, number] {
  const m = /^([PCBU])([0-3])([0-9A-F])([0-9A-F])([0-9A-F])$/i.exec(code.trim());
  if (!m) throw new Error(`Invalid DTC: ${code}`);
  const letterIdx = LETTERS.indexOf(m[1].toUpperCase() as (typeof LETTERS)[number]);
  const a = (letterIdx << 6) | (parseInt(m[2], 10) << 4) | parseInt(m[3], 16);
  const b = (parseInt(m[4], 16) << 4) | parseInt(m[5], 16);
  return [a, b];
}

/**
 * Parse the payload bytes that follow a mode 03/07/0A response byte.
 * CAN responses carry a leading count byte (odd total length); legacy
 * protocols return plain pairs. Both are handled.
 */
export function parseDtcPayload(bytes: number[]): string[] {
  let data = bytes;
  if (data.length % 2 === 1) {
    const count = data[0];
    if (data.length - 1 < count * 2) throw new Error(`Incomplete DTC response: expected ${count} codes`);
    if (data.slice(1 + count * 2).some(byte => byte !== 0)) throw new Error("Ambiguous DTC response: unexpected trailing data");
    data = data.slice(1, 1 + count * 2);
  }
  const out: string[] = [];
  for (let i = 0; i + 1 < data.length; i += 2) {
    const dtc = decodeDtcPair(data[i], data[i + 1]);
    if (dtc) out.push(dtc);
  }
  return out;
}
