/**
 * What the format of a trouble code says about it (SAE J2012 / ISO 15031-6
 * structure), without claiming a specific meaning. A code's exact meaning is
 * defined by SAE for generic codes and by each manufacturer otherwise; this
 * module only reports the system and which of those applies.
 */

export type DtcDefinition = "sae" | "manufacturer" | "varies";

export type DtcInfo = {
  system: "powertrain" | "chassis" | "body" | "network";
  /** Who defines the meaning: SAE (same on every make), the manufacturer, or it depends on the exact code. */
  definition: DtcDefinition;
};

const SYSTEMS = { P: "powertrain", C: "chassis", B: "body", U: "network" } as const;

export function describeDtc(code: string): DtcInfo | null {
  const m = /^([PCBU])([0-3])([0-9A-F])[0-9A-F]{2}$/.exec(code);
  if (!m) return null;
  const letter = m[1] as keyof typeof SYSTEMS;
  const type = m[2];
  const third = m[3];
  let definition: DtcDefinition;
  if (letter === "P") {
    // P0 and P2 are SAE-defined, P1 is manufacturer-defined, and P3 is split:
    // P3000-P33FF manufacturer-defined, P3400 and above SAE-defined.
    if (type === "0" || type === "2") definition = "sae";
    else if (type === "1") definition = "manufacturer";
    else definition = parseInt(third, 16) <= 3 ? "manufacturer" : "sae";
  } else {
    // B, C and U: 0 is SAE-defined, 1 and 2 are manufacturer-defined, and 3 depends on the code.
    definition = type === "0" ? "sae" : type === "3" ? "varies" : "manufacturer";
  }
  return { system: SYSTEMS[letter], definition };
}

/** code_info for a result: one entry per distinct code, or undefined when there are none. */
export function codeInfo(codes: Array<string | null | undefined>): Record<string, DtcInfo> | undefined {
  const out: Record<string, DtcInfo> = {};
  for (const code of codes) {
    if (!code || code in out) continue;
    const info = describeDtc(code);
    if (info) out[code] = info;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
