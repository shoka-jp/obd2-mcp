import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PhoneSession } from '../src/core/session';
import { WifiTransport, type SocketLike } from '../src/core/transport';

// elmulator is an independent MIT-licensed ELM327 simulator. It is a test
// dependency, not part of the app: https://github.com/qadanm/elmulator
async function startEmulator(scenario: string): Promise<{ port: number; stop(): Promise<void> }> {
  const child = spawn(process.env.ELMULATOR_PYTHON ?? 'python3', [
    '-m', 'elmulator', 'serve', scenario, '--host', '127.0.0.1', '--port', '0', '--split', '1,3,2',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  try {
    const port = await new Promise<number>((resolvePort, reject) => {
      let stdout = '';
      const timer = setTimeout(() => reject(new Error(`Emulator startup timed out: ${stderr}`)), 10000);
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        const match = /^LISTENING (\d+)$/m.exec(stdout);
        if (match) { clearTimeout(timer); resolvePort(Number(match[1])); }
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Emulator exited (${code}): ${stderr}`)); });
    });
    return { port, stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      await new Promise<void>(resolveExit => {
        const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
        child.once('exit', () => { clearTimeout(timer); resolveExit(); });
        child.kill('SIGTERM');
      });
    } };
  } catch (error) {
    child.kill('SIGKILL');
    throw error;
  }
}

function sessionForLoopback(port: number): PhoneSession {
  // Production rejects loopback addresses. The injected Node socket connects
  // only this test to the loopback emulator while exercising the same TCP
  // framing, request queue, command allowlist and ELM parsing as the phone.
  const transport = new WifiTransport('192.168.0.10', port,
    () => createConnection({ host: '127.0.0.1', port }) as unknown as SocketLike, false);
  return new PhoneSession(transport, false);
}

test('reads independent emulator responses over TCP with split writes', async t => {
  const fixture = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/headerless.scenario.json');
  const emulator = await startEmulator(fixture);
  const session = sessionForLoopback(emulator.port);
  t.after(async () => { await session.close(); await emulator.stop(); });
  await session.connect();
  const result = await session.read();
  assert.equal(result.milOn, true);
  assert.deepEqual(result.stored, ['P0300']);
  assert.deepEqual(result.pending, []);
  assert.equal(result.rpm, 1726);
  assert.equal(result.coolant, 83);
  assert.equal(result.freezeCode, 'P0300');
  assert.equal(result.freezeRpm, 1750);
  assert.equal(result.freezeCoolant, 80);
  assert.equal(result.incomplete, false);
});

test('unrecognized header-bearing responses stay unknown', async t => {
  // This independent bundled scenario includes CAN headers even after the
  // app requests ATH0. Do not turn unexpected frames into a clean result.
  const emulator = await startEmulator('p0420_basic');
  const session = sessionForLoopback(emulator.port);
  t.after(async () => { await session.close(); await emulator.stop(); });
  await session.connect();
  const result = await session.read();
  assert.equal(result.milOn, null);
  assert.equal(result.stored, null);
  assert.equal(result.pending, null);
  assert.equal(result.rpm, null);
  assert.equal(result.coolant, null);
  assert.equal(result.incomplete, true);
});
