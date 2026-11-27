import { PID_BY_NAME } from "./pids.js";

/**
 * Compare two read_diagnostic_report results: before and after a test drive,
 * a repair or a few days of driving. Pure computation on reports already
 * collected; nothing here contacts the adapter or the vehicle.
 *
 * Only well-formed values are copied into the result (trouble codes, known
 * sensor and monitor names, numbers, ISO timestamps), so a report pasted back
 * by the user cannot carry free text into the comparison.
 */

export type Report = Record<string, unknown>;

const MONITORS = [
  "misfire",
  "fuel_system",
  "components",
  "catalyst",
  "heated_catalyst",
  "evaporative_system",
  "secondary_air_system",
  "ac_refrigerant",
  "oxygen_sensor",
  "oxygen_sensor_heater",
  "egr_system",
] as const;
const MONITOR_STATES = new Set(["complete", "incomplete", "not_supported"]);
const CODE = /^[PCBU][0-3][0-9A-F]{3}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
/** Largest saved report accepted as earlier_report_json. */
export const MAX_SAVED_REPORT_CHARS = 200_000;

type Section = { is_error: boolean; data: Record<string, unknown> };
type Known<T> = { known: true; value: T } | { known: false; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function section(report: Report, name: string, label: string): Known<Record<string, unknown>> {
  const sections = isObject(report.sections) ? report.sections : {};
  const raw = sections[name];
  if (!isObject(raw) || !isObject(raw.data)) return { known: false, reason: `the ${label} report has no ${name} section` };
  const sec = raw as Section;
  if (sec.is_error === true) return { known: false, reason: `${name} failed in the ${label} report` };
  return { known: true, value: sec.data };
}

function codeList(report: Report, key: "stored_dtcs" | "pending_dtcs" | "permanent_dtcs", label: string): Known<string[]> {
  const sec = section(report, key === "permanent_dtcs" ? "read_permanent_dtcs" : "read_dtcs", label);
  if (!sec.known) return sec;
  const list = sec.value[key];
  if (!Array.isArray(list)) {
    return { known: false, reason: key === "permanent_dtcs"
      ? `the car did not answer the permanent code request in the ${label} report, or does not support it`
      : `the ${label} report has no data for ${key} (the adapter returned no answer)` };
  }
  const codes = list.filter((c): c is string => typeof c === "string" && CODE.test(c));
  if (codes.length !== list.length) return { known: false, reason: `the ${label} report has malformed ${key}` };
  return { known: true, value: [...new Set(codes)] };
}

function milState(report: Report, label: string): Known<boolean> {
  for (const name of ["read_dtcs", "read_readiness"]) {
    const sec = section(report, name, label);
    if (sec.known && typeof sec.value.mil_on === "boolean") return { known: true, value: sec.value.mil_on };
  }
  return { known: false, reason: `the ${label} report has no warning light state` };
}

function freezeFrameCode(report: Report, label: string): Known<string | null> {
  const sec = section(report, "read_freeze_frame", label);
  if (!sec.known) return sec;
  const frame = sec.value.freeze_frame;
  if (frame === null) {
    // "No freeze frame stored." is a confirmed answer; "Freeze frame unavailable" is not.
    const note = typeof sec.value.note === "string" ? sec.value.note : "";
    return /^No freeze frame stored/.test(note)
      ? { known: true, value: null }
      : { known: false, reason: `the vehicle did not answer the freeze frame request in the ${label} report` };
  }
  if (isObject(frame) && typeof frame.dtc === "string" && CODE.test(frame.dtc)) return { known: true, value: frame.dtc };
  return { known: false, reason: `the ${label} report has a malformed freeze frame` };
}

function monitors(report: Report, label: string): Known<Record<string, string>> {
  const sec = section(report, "read_readiness", label);
  if (!sec.known) return sec;
  const raw = sec.value.readiness_monitors;
  if (!isObject(raw)) return { known: false, reason: `the ${label} report has no readiness monitors` };
  const out: Record<string, string> = {};
  for (const name of MONITORS) {
    const state = raw[name];
    if (typeof state === "string" && MONITOR_STATES.has(state)) out[name] = state;
  }
  return Object.keys(out).length > 0 ? { known: true, value: out } : { known: false, reason: `the ${label} report has no readable readiness monitors` };
}

/** Live readings by sensor name: a number, or null when that read failed. Unknown names are dropped. */
function liveValues(report: Report): Record<string, number | null> | null {
  const sections = isObject(report.sections) ? report.sections : {};
  const raw = sections.read_live_data;
  if (!isObject(raw) || !isObject(raw.data) || !isObject(raw.data.live_data)) return null;
  const out: Record<string, number | null> = {};
  for (const [name, entry] of Object.entries(raw.data.live_data)) {
    if (!PID_BY_NAME.has(name)) continue;
    out[name] = isObject(entry) && typeof entry.value === "number" && Number.isFinite(entry.value) ? entry.value : null;
  }
  return out;
}

function describe(report: Report, number?: number) {
  return {
    ...(number !== undefined ? { report_number: number } : {}),
    started_at: typeof report.started_at === "string" && ISO_TIME.test(report.started_at) ? report.started_at : null,
    simulated: typeof report.simulated === "boolean" ? report.simulated : null,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
const list = (codes: string[]) => codes.join(", ");

function diffCodes(a: Known<string[]>, b: Known<string[]>) {
  if (!a.known) return { status: "unknown" as const, reason: a.reason };
  if (!b.known) return { status: "unknown" as const, reason: b.reason };
  return {
    status: "compared" as const,
    earlier: a.value,
    later: b.value,
    new: b.value.filter(c => !a.value.includes(c)),
    gone: a.value.filter(c => !b.value.includes(c)),
  };
}

export interface CompareInput {
  report: Report;
  /** Session report number, when the report was collected in this session. */
  number?: number;
}

export function compareReports(earlierInput: CompareInput, laterInput: CompareInput) {
  const earlier = earlierInput.report;
  const later = laterInput.report;
  const e = describe(earlier, earlierInput.number);
  const l = describe(later, laterInput.number);
  const hoursBetween = e.started_at && l.started_at ? round((Date.parse(l.started_at) - Date.parse(e.started_at)) / 3_600_000) : null;

  const milE = milState(earlier, "earlier");
  const milL = milState(later, "later");
  const warningLight = milE.known && milL.known
    ? { status: "compared" as const, earlier: milE.value, later: milL.value, changed: milE.value !== milL.value }
    : { status: "unknown" as const, reason: !milE.known ? milE.reason : (milL as { reason: string }).reason };

  const stored = diffCodes(codeList(earlier, "stored_dtcs", "earlier"), codeList(later, "stored_dtcs", "later"));
  const pending = diffCodes(codeList(earlier, "pending_dtcs", "earlier"), codeList(later, "pending_dtcs", "later"));
  const permanent = diffCodes(codeList(earlier, "permanent_dtcs", "earlier"), codeList(later, "permanent_dtcs", "later"));

  const ffE = freezeFrameCode(earlier, "earlier");
  const ffL = freezeFrameCode(later, "later");
  const freezeFrame = ffE.known && ffL.known
    ? { status: "compared" as const, earlier: ffE.value, later: ffL.value, changed: ffE.value !== ffL.value }
    : { status: "unknown" as const, reason: !ffE.known ? ffE.reason : (ffL as { reason: string }).reason };

  const monE = monitors(earlier, "earlier");
  const monL = monitors(later, "later");
  let readiness;
  if (monE.known && monL.known) {
    const becameComplete: string[] = [];
    const becameIncomplete: string[] = [];
    const stillIncomplete: string[] = [];
    const otherChanges: Array<{ monitor: string; earlier: string; later: string }> = [];
    for (const name of MONITORS) {
      const a = monE.value[name];
      const b = monL.value[name];
      if (!a || !b) continue;
      if (a === "incomplete" && b === "complete") becameComplete.push(name);
      else if (a === "complete" && b === "incomplete") becameIncomplete.push(name);
      else if (a === "incomplete" && b === "incomplete") stillIncomplete.push(name);
      else if (a !== b) otherChanges.push({ monitor: name, earlier: a, later: b });
    }
    readiness = {
      status: "compared" as const,
      became_complete: becameComplete,
      became_incomplete: becameIncomplete,
      still_incomplete: stillIncomplete,
      ...(otherChanges.length ? { support_changed: otherChanges } : {}),
    };
  } else {
    readiness = { status: "unknown" as const, reason: !monE.known ? monE.reason : (monL as { reason: string }).reason };
  }

  const liveE = liveValues(earlier) ?? {};
  const liveL = liveValues(later) ?? {};
  const liveData: Record<string, { unit: string; earlier: number | null; later: number | null; change: number | null }> = {};
  for (const name of new Set([...Object.keys(liveE), ...Object.keys(liveL)])) {
    const a = name in liveE ? liveE[name] : null;
    const b = name in liveL ? liveL[name] : null;
    liveData[name] = {
      unit: PID_BY_NAME.get(name)!.unit,
      earlier: a,
      later: b,
      change: a !== null && b !== null ? round(b - a) : null,
    };
  }

  const observations: string[] = [];
  if (e.simulated !== null && l.simulated !== null && e.simulated !== l.simulated) {
    observations.push("One report comes from the simulated vehicle and the other does not, so their differences say nothing about the car.");
  }
  if (hoursBetween !== null && hoursBetween < 0) {
    observations.push("The \"earlier\" report was collected after the \"later\" one; the changes below are described in the order given.");
  }
  const counterDrop = (["warmups_since_clear", "distance_since_clear"] as const)
    .filter(name => liveData[name]?.change !== null && liveData[name]?.change !== undefined && liveData[name].change! < 0);
  const gone = stored.status === "compared" ? stored.gone : [];
  const reset = readiness.status === "compared" ? readiness.became_incomplete : [];
  const codesGone = gone.length > 0;
  const lightWentOff = warningLight.status === "compared" && warningLight.earlier && !warningLight.later;
  const monitorsReset = reset.length > 0;
  const clearNoted = counterDrop.length > 0 || (monitorsReset && (codesGone || lightWentOff));
  if (counterDrop.length > 0) {
    observations.push(`${counterDrop.map(n => `${n} went down (${liveData[n].earlier} to ${liveData[n].later})`).join(" and ")}: trouble codes were cleared between the reports, by a scan tool, a battery disconnect or a repair. Ask what was done.`);
  } else if (monitorsReset && (codesGone || lightWentOff)) {
    observations.push(`Monitors were reset (${list(reset)}) while codes disappeared or the warning light went off: this is consistent with codes being cleared between the reports (scan tool, battery disconnect or repair). Ask what was done.`);
  } else if (monitorsReset) {
    observations.push(`Monitors became incomplete: ${list(reset)}. Monitors reset when codes are cleared or the battery is disconnected.`);
  }
  if (stored.status === "compared" && stored.new.length > 0) {
    observations.push(`New stored code(s): ${list(stored.new)}. The car confirmed a fault since the earlier report.`);
  }
  if (pending.status === "compared" && pending.new.length > 0) {
    observations.push(`New pending code(s): ${list(pending.new)}. The car detected a possible fault since the earlier report; a pending code is not confirmed yet and can become a stored code if it happens again.`);
  }
  // A stored code that is gone while the same code is still permanent: the car did not erase it by itself.
  const stillPermanent = permanent.status === "compared" ? gone.filter(c => permanent.later.includes(c)) : [];
  if (stillPermanent.length > 0) {
    observations.push(clearNoted
      ? `${list(stillPermanent)}: no longer stored but still a permanent code, so the car has not yet confirmed that the fault is fixed.`
      : `${list(stillPermanent)}: no longer stored but still a permanent code. This usually means codes were cleared (scan tool, battery disconnect or repair) and the car has not yet confirmed that the fault is fixed.`);
  }
  const goneUnexplained = gone.filter(c => !stillPermanent.includes(c));
  if (goneUnexplained.length > 0 && counterDrop.length === 0 && !monitorsReset) {
    observations.push(`Stored code(s) no longer reported: ${list(goneUnexplained)}. Under the OBD-II rules a car usually keeps a stored code for about 40 warm-ups after the fault stops, so if little driving happened in between, ask whether codes were cleared.`);
  }
  if (permanent.status === "compared" && permanent.gone.length > 0) {
    observations.push(`Permanent code(s) no longer reported: ${list(permanent.gone)}. The car's own monitor found that fault no longer present, which is how a repair is confirmed.`);
  }
  if (permanent.status === "compared" && permanent.new.length > 0) {
    observations.push(`New permanent code(s): ${list(permanent.new)}. The car turned the warning light on for this fault; clearing codes or disconnecting the battery does not remove it until the car confirms the repair.`);
  }
  if (warningLight.status === "compared" && warningLight.changed) {
    observations.push(warningLight.later ? "The warning light came on since the earlier report." : "The warning light went off since the earlier report.");
  }
  if (readiness.status === "compared" && readiness.became_complete.length > 0) {
    observations.push(`Monitors completed since the earlier report: ${list(readiness.became_complete)}.`);
  }
  if (freezeFrame.status === "compared" && freezeFrame.changed) {
    observations.push(freezeFrame.later
      ? `The freeze frame now belongs to ${freezeFrame.later}${freezeFrame.earlier ? ` (was ${freezeFrame.earlier})` : ""}.`
      : "The freeze frame stored in the earlier report is gone.");
  }
  if (observations.length === 0) {
    observations.push("No change in the warning light, stored, pending or permanent codes, freeze frame or readiness monitors that both reports could show.");
  }

  return {
    earlier: e,
    later: l,
    hours_between: hoursBetween,
    observations,
    warning_light: warningLight,
    stored_dtcs: stored,
    pending_dtcs: pending,
    permanent_dtcs: permanent,
    freeze_frame_dtc: freezeFrame,
    readiness,
    live_data: liveData,
    notes: [
      "This compares observations from two reports; it is not a diagnosis. A section that failed or had no data is reported as unknown, never as a change.",
      "Live values depend on engine conditions. Compare them only when both reports were read in similar conditions, for example both at warm idle; null means that read failed.",
      "Reports collected before permanent codes were part of the report (obd2-mcp 0.7.x) show permanent_dtcs as unknown.",
    ],
  };
}

/**
 * Parse a report the user saved earlier (the obd2://report/latest resource or a
 * read_diagnostic_report result). Returns an error message instead of throwing.
 */
export function parseSavedReport(text: string): { report: Report } | { error: string } {
  if (text.length > MAX_SAVED_REPORT_CHARS) return { error: `The saved report is too long (more than ${MAX_SAVED_REPORT_CHARS} characters).` };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { error: "The saved report is not valid JSON. Paste the whole report exactly as saved from obd2://report/latest or read_diagnostic_report." };
  }
  if (isObject(value) && value.available === false) {
    return { error: "This is the empty placeholder from obd2://report/latest: no report had been collected when it was saved." };
  }
  if (!isObject(value) || value.schema_version !== 1 || !isObject(value.sections)) {
    return { error: "This does not look like an obd2-mcp diagnostic report (schema_version 1 with sections)." };
  }
  const known = ["read_dtcs", "read_permanent_dtcs", "read_freeze_frame", "read_live_data", "read_readiness"].filter(name => name in (value as { sections: Record<string, unknown> }).sections);
  if (known.length === 0) return { error: "The saved report has none of the expected sections (read_dtcs, read_permanent_dtcs, read_freeze_frame, read_live_data, read_readiness)." };
  return { report: value };
}
