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

test('summary displays simulated observations, even with a real connection configured', () => {
  const run = spawnSync(process.execPath, ['dist/index.js', '--demo', '--summary'], {
    env: { ...process.env, OBD2MCP_CONNECTION: 'tcp:127.0.0.1:1' }, encoding: 'utf8', timeout: 15000,
  });
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /SIMULATED DEMO/);
  assert.match(run.stdout, /P0420/);
  assert.match(run.stdout, /not a diagnosis/);
  assert.doesNotMatch(run.stdout, /clear_dtcs/);
});

test('summary flag without demo fails', () => {
  const run = spawnSync(process.execPath, ['dist/index.js', '--summary'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /requires --demo/);
});

test('Japanese summary explains the mock code and preserves diagnostic evidence', () => {
  const run = spawnSync(process.execPath, ['dist/index.js', '--demo', '--summary', '--lang', 'ja'], {
    env: { ...process.env, OBD2MCP_CONNECTION: 'tcp:127.0.0.1:1' }, encoding: 'utf8', timeout: 15000,
  });
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /模擬デモ/);
  assert.match(run.stdout, /P0420の一般的な意味/);
  assert.match(run.stdout, /コードだけで故障部品は特定できません/);
  assert.match(run.stdout, /消去せず保存/);
  assert.doesNotMatch(run.stdout, /clear_dtcs/);
});

test('language option rejects missing, invalid, duplicate, and unsupported contexts', () => {
  for (const args of [
    ['--demo', '--summary', '--lang'],
    ['--demo', '--summary', '--lang', 'fr'],
    ['--demo', '--summary', '--lang', 'ja', '--lang', 'en'],
    ['--demo', '--lang', 'ja'],
    ['--lang', 'ja'],
  ]) {
    const run = spawnSync(process.execPath, ['dist/index.js', ...args], { encoding: 'utf8', timeout: 5000 });
    assert.equal(run.status, 1, `${args.join(' ')}: ${run.stderr}`);
    assert.match(run.stderr, /--lang/);
  }
});

test('demo --scenario shows the used-car signals for the cleared scenario', () => {
  for (const [lang, patterns] of [
    ['en', [/Scenario: cleared/, /Stored codes: none/, /Permanent codes: P0420/, /Incomplete readiness monitors: catalyst, evaporative_system, oxygen_sensor/, /Since codes were last cleared: 1 warm-up, 12 km/, /not proof/]],
    ['ja', [/模擬シナリオ: cleared/, /消去しても残るコード: P0420/, /未完了のレディネスモニター: catalyst/, /前回のコード消去から: 暖機1回・12 km/, /証拠ではなく/]],
  ]) {
    const run = spawnSync(process.execPath, ['dist/index.js', '--demo', '--summary', '--lang', lang, '--scenario', 'cleared'], {
      env: { ...process.env, OBD2MCP_CONNECTION: 'tcp:127.0.0.1:1' }, encoding: 'utf8', timeout: 15000,
    });
    assert.equal(run.status, 0, run.stderr);
    for (const pattern of patterns) assert.match(run.stdout, pattern, lang);
    assert.doesNotMatch(run.stdout, /clear_dtcs/);
  }
});

test('the default demo still shows the catalyst scenario with its permanent code', () => {
  const run = spawnSync(process.execPath, ['dist/index.js', '--demo', '--summary'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Scenario: catalyst/);
  assert.match(run.stdout, /Stored codes: P0420/);
  assert.match(run.stdout, /Permanent codes: P0420/);
  assert.doesNotMatch(run.stdout, /No stored codes, but a permanent code remains/);
});

test('--scenario rejects missing, unknown, duplicate and non-demo use', () => {
  for (const args of [
    ['--demo', '--scenario'],
    ['--demo', '--scenario', 'unknown'],
    ['--demo', '--scenario', 'cleared', '--scenario', 'healthy'],
    ['--scenario', 'cleared'],
    ['--list-ports', '--scenario', 'cleared'],
  ]) {
    const run = spawnSync(process.execPath, ['dist/index.js', ...args], { encoding: 'utf8', timeout: 5000 });
    assert.equal(run.status, 1, `${args.join(' ')}: ${run.stderr}`);
    assert.match(run.stderr, /--scenario/);
  }
});

