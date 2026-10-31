import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('demo uses mock data even if a real connection is configured', () => {
  const run = spawnSync(process.execPath, ['dist/index.js', '--demo'], {
    env: { ...process.env, OBD2MCP_CONNECTION: 'tcp:127.0.0.1:1' },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /"simulated": true/);
  assert.match(run.stdout, /P0420/);
  assert.doesNotMatch(run.stdout, /clear_dtcs/);
});

test('demo rejects an explicit connection argument', () => {
  const run = spawnSync(process.execPath, ['dist/index.js', '--demo', '--connection', 'serial:/not-a-vehicle'], {
    encoding: 'utf8', timeout: 15000,
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /do not combine/);
});
