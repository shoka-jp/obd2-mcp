/**
 * Display units. Tool results stay metric (SAE J1979 units) so reports,
 * comparisons and the history folder are consistent; with the imperial
 * setting, the readable report shows US units and the server instructions ask
 * the assistant to convert when it answers.
 */

export type UnitSystem = "metric" | "imperial";

/** OBD2MCP_UNITS: "imperial" (or "us") for US units; anything else, or unset, is metric. */
export function unitSystem(env: NodeJS.ProcessEnv): UnitSystem {
  return /^(imperial|us|usc)$/i.test(env.OBD2MCP_UNITS?.trim() ?? "") ? "imperial" : "metric";
}

const IMPERIAL: Record<string, { unit: string; convert: (v: number) => number }> = {
  degC: { unit: "degF", convert: v => (v * 9) / 5 + 32 },
  "km/h": { unit: "mph", convert: v => v / 1.609344 },
  km: { unit: "mi", convert: v => v / 1.609344 },
  kPa: { unit: "psi", convert: v => v * 0.1450377 },
  "L/h": { unit: "gal/h", convert: v => v / 3.785411784 },
};

/** A metric value in the chosen system, rounded to two decimals. */
export function displayValue(value: number, unit: string, system: UnitSystem): { value: number; unit: string } {
  const rule = system === "imperial" ? IMPERIAL[unit] : undefined;
  const shown = rule ? rule.convert(value) : value;
  return { value: Math.round(shown * 100) / 100, unit: rule ? rule.unit : unit };
}

/** One sentence for the server instructions when the user prefers US units. */
export const IMPERIAL_INSTRUCTION =
  "- The user prefers US units. Tool results are metric; when you answer, give temperatures in °F, speeds in mph, distances in miles, pressures in psi and fuel rate in gallons per hour (you can show the metric value in brackets). format_diagnostic_report already uses US units.";
