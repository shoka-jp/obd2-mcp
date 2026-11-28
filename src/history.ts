import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseSavedReport, MAX_SAVED_REPORT_CHARS } from "./compare.js";

/**
 * Optional report history: when the user names a folder (OBD2MCP_REPORT_DIR,
 * or "Report history folder" in Claude Desktop), every diagnostic report from
 * a real vehicle is saved there as JSON, and the most recent ones are loaded
 * at start-up. That lets compare_diagnostic_reports compare across days, for
 * example before and after a repair, without the user saving files by hand.
 *
 * Reports from the simulated vehicle are not saved. Reports contain no VIN and
 * no adapter port or address. Nothing leaves the computer.
 */

const FILE = /^obd2-report-(\d{8}T\d{6}(?:\d{3})?Z)\.json$/;

export function reportDir(env: NodeJS.ProcessEnv): string | undefined {
  const dir = env.OBD2MCP_REPORT_DIR?.trim();
  return dir ? dir : undefined;
}

/** File name for a report, from its start time, e.g. obd2-report-20261128T091500123Z.json. */
export function reportFileName(startedAt: string): string {
  const stamp = startedAt.replace(/[-:]/g, "").replace(".", "");
  return `obd2-report-${/^\d{8}T\d{6}\d{0,3}Z$/.test(stamp) ? stamp : new Date().toISOString().replace(/[-:.]/g, "")}.json`;
}

/** Save one report; returns the file name, or an error message the caller reports instead of failing the read. */
export function saveReport(dir: string, report: Record<string, unknown>): { file: string } | { error: string } {
  try {
    mkdirSync(dir, { recursive: true });
    const { session_report_number: _number, loaded_from: _from, saved_as: _saved, history_error: _error, ...stored } = report;
    const file = reportFileName(String(report.started_at ?? ""));
    writeFileSync(join(dir, file), JSON.stringify(stored, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    return { file };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return { error: `Could not save the report to the history folder${code ? ` (${code})` : ""}.` };
  }
}

/** The most recent saved reports, oldest first. Unreadable or unexpected files are skipped. */
export function loadReports(dir: string, limit: number): Array<{ file: string; report: Record<string, unknown> }> {
  let names: string[];
  try {
    names = readdirSync(dir).filter(name => FILE.test(name)).sort();
  } catch {
    return [];
  }
  const loaded: Array<{ file: string; report: Record<string, unknown> }> = [];
  for (const file of names.slice(-limit)) {
    try {
      const path = join(dir, file);
      if (statSync(path).size > MAX_SAVED_REPORT_CHARS) continue;
      const parsed = parseSavedReport(readFileSync(path, "utf8"));
      if ("report" in parsed && parsed.report.simulated !== true) loaded.push({ file, report: parsed.report });
    } catch {
      // Skip a file that cannot be read.
    }
  }
  return loaded;
}
