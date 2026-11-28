import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MockTransport } from '../dist/mock.js';
import { runCheck, scrub, REPORT_FORM } from '../dist/check.js';

const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));

test('scrub removes addresses, ports and VIN-like text', () => {
  assert.equal(scrub('connect ECONNREFUSED 192.168.0.10:35000'), 'connect ECONNREFUSED <address>');
  assert.equal(scrub('Could not open serial:/dev/ttyUSB0@38400: busy'), 'Could not open <port>: busy');
  assert.equal(scrub('COM7 timed out'), '<port> timed out');
  assert.equal(scrub('VIN 1HGFC2F59GA000042 read'), 'VIN <VIN> read');
  assert.ok(scrub('x'.repeat(500)).length <= 160);
});

test('a check of the simulated car: every step, read-only, marked simulated', async () => {
  const mock = new MockTransport('catalyst');
  const sent = [];
  const transport = { describe: () => mock.describe(), open: () => mock.open(), close: () => mock.close(), sendRaw: c => { sent.push(c); return mock.sendRaw(c); } };
  const text = await runCheck({ transport, mock: true, kind: 'mock', how: 'test' });
  assert.match(text, /^### obd2-mcp check\n/);
  assert.match(text, /- Connection: mock \(test\)/);
  assert.match(text, /- Adapter: ELM327 v1\.5/);
  assert.match(text, /- Protocol: ISO 15765-4 CAN \(11-bit ID, 500 kbaud\)/);
  assert.match(text, /\*\*Simulated vehicle: this is not a real setup\.\*\*/);
  for (const step of ['Adapter answers', 'Supported sensors', 'Trouble codes', 'Permanent codes', 'Freeze frame', 'Readiness', 'Control modules', 'Monitor tests']) {
    assert.match(text, new RegExp(`\\| ${step}[^|]*\\| OK`), step);
  }
  assert.ok(text.includes(REPORT_FORM));
  assert.match(text, /\| Monitor tests \(06 with headers\) \| OK: 6 pass, 1 fail, 0 not run, misfire counts for 4 cylinders \|/);
  assert(!sent.includes('0902'), 'no VIN');
  assert(!sent.includes('04'), 'no clearing');
  assert.doesNotMatch(text, /1HGFC2F59GA000042|mock:catalyst/);
});

test('failures are reported per step without addresses', async () => {
  const mock = new MockTransport('catalyst');
  const transport = {
    describe: () => 'tcp:192.168.0.10:35000', open: () => mock.open(), close: () => mock.close(),
    sendRaw: async c => (c === '0900' ? 'CAN ERROR 192.168.0.10\r' : c === '0A' ? 'NO DATA\r' : mock.sendRaw(c)),
  };
  const text = await runCheck({ transport, mock: false, kind: 'tcp', how: 'test' });
  assert.match(text, /\| Control modules \(09 with headers\) \| failed: Adapter error for "0900": CAN ERROR <address> \|/);
  assert.match(text, /\| Permanent codes \(0A\) \| no answer or not supported \|/);
  assert.match(text, /\| Trouble codes \(03, 07\) \| OK: 1 stored/);
  assert.doesNotMatch(text, /192\.168/);
  assert.doesNotMatch(text, /Simulated vehicle/);
});

function run(args) {
  const env = { ...process.env };
  delete env.OBD2MCP_CONNECTION;
  return spawnSync(process.execPath, [entry, ...args], { env, encoding: 'utf8', timeout: 20000 });
}

test('the --check command', () => {
  const ok = run(['--check', '--connection', 'mock']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /### obd2-mcp check/);
  assert.match(ok.stderr, /read-only; no VIN, no clearing/);
  assert.match(run(['--check', '--demo']).stderr, /--check cannot be combined with --demo/);
  assert.match(run(['--wifi']).stderr, /--wifi requires --check/);
  assert.match(run(['--help']).stdout, /obd2-mcp --check \[--connection <spec>\] \[--wifi\]/);
});
