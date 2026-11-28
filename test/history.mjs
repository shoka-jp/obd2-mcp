import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Elm327 } from '../dist/elm327.js';
import { MockTransport } from '../dist/mock.js';
import { buildServer } from '../dist/server.js';
import { loadReports, reportDir, reportFileName } from '../dist/history.js';

function folder(t) {
  const dir = mkdtempSync(join(tmpdir(), 'obd2-history-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A server whose vehicle answers like the mock but counts as a real car (mock = false), so reports are saved. */
async function session(t, { dir, simulated = false, scenario = 'catalyst' }) {
  const server = buildServer(new Elm327(new MockTransport(scenario)), simulated, { reportDir: dir });
  const client = new Client({ name: 'history-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  t.after(async () => { await client.close(); await server.close(); });
  const call = async (name, args = {}) => JSON.parse((await client.callTool({ name, arguments: args })).content[0].text);
  return { client, call };
}

test('the setting: blank means off', () => {
  assert.equal(reportDir({}), undefined);
  assert.equal(reportDir({ OBD2MCP_REPORT_DIR: '  ' }), undefined);
  assert.equal(reportDir({ OBD2MCP_REPORT_DIR: ' /tmp/x ' }), '/tmp/x');
  assert.equal(reportFileName('2026-11-28T09:15:00.123Z'), 'obd2-report-20261128T091500123Z.json');
});

test('real-vehicle reports are saved and come back after a restart for comparison', async t => {
  const dir = folder(t);
  const first = await session(t, { dir });
  const a = await first.call('read_diagnostic_report', { pids: ['rpm'] });
  await new Promise(r => setTimeout(r, 5));
  const b = await first.call('read_diagnostic_report', { pids: ['rpm'] });
  assert.match(a.saved_as, /^obd2-report-\d{8}T\d{9}Z\.json$/);
  const files = readdirSync(dir).sort();
  assert.deepEqual(files, [a.saved_as, b.saved_as].sort());
  const stored = JSON.parse(readFileSync(join(dir, a.saved_as), 'utf8'));
  for (const key of ['session_report_number', 'saved_as', 'source', 'loaded_from']) assert.equal(key in stored, false, key);
  assert.doesNotMatch(JSON.stringify(stored), /1HGFC2F59GA000042|"source"/);

  // A new server (for example after Claude Desktop restarts) loads them as reports 1 and 2.
  const second = await session(t, { dir });
  const one = JSON.parse((await second.client.readResource({ uri: 'obd2://reports/1' })).contents[0].text);
  assert.equal(one.loaded_from, files[0]);
  assert.equal(one.session_report_number, 1);
  const c = await second.call('read_diagnostic_report', { pids: ['rpm'] });
  assert.equal(c.session_report_number, 3);
  const compared = await second.call('compare_diagnostic_reports');
  assert.equal(compared.earlier.report_number, 2);
  assert.equal(compared.later.report_number, 3);
  assert.equal(readdirSync(dir).length, 3);
});

test('simulated reports are not saved, and history is off without a folder', async t => {
  const dir = folder(t);
  const mock = await session(t, { dir, simulated: true });
  const report = await mock.call('read_diagnostic_report', { pids: ['rpm'] });
  assert.equal(report.saved_as, undefined);
  assert.deepEqual(readdirSync(dir), []);
  const off = await session(t, { dir: null });
  assert.equal((await off.call('read_diagnostic_report', { pids: ['rpm'] })).saved_as, undefined);
});

test('a folder that cannot be written does not stop the report', async t => {
  const dir = folder(t);
  const notAFolder = join(dir, 'file');
  writeFileSync(notAFolder, 'x');
  const { call } = await session(t, { dir: notAFolder });
  const report = await call('read_diagnostic_report', { pids: ['rpm'] });
  assert.match(report.history_error, /^Could not save the report to the history folder/);
  assert.deepEqual(report.sections.read_dtcs.data.stored_dtcs, ['P0420']);
});

test('loading keeps the newest valid real-vehicle reports, oldest first', t => {
  const dir = folder(t);
  const report = (simulated, stamp) => JSON.stringify({ schema_version: 1, started_at: stamp, simulated, sections: { read_dtcs: { is_error: false, data: { stored_dtcs: [] } } } });
  for (let i = 0; i < 12; i++) writeFileSync(join(dir, `obd2-report-202611${String(10 + i).padStart(2, '0')}T090000000Z.json`), report(false, `2026-11-${10 + i}T09:00:00.000Z`));
  writeFileSync(join(dir, 'obd2-report-20261130T090000000Z.json'), 'not json');
  writeFileSync(join(dir, 'obd2-report-20261131T090000000Z.json'), report(true, '2026-11-31T09:00:00.000Z'));
  writeFileSync(join(dir, 'notes.txt'), 'ignored');
  const loaded = loadReports(dir, 10);
  assert.equal(loaded.length, 8, 'the last ten files include two that are skipped');
  assert.equal(loaded[0].file, 'obd2-report-20261114T090000000Z.json');
  assert.equal(loaded.at(-1).file, 'obd2-report-20261121T090000000Z.json');
  assert.deepEqual(loadReports(join(dir, 'missing'), 10), []);
});
