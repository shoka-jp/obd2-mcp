// Verify a clean source package, not the working tree's existing build output.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath;
assert(npmCli, 'Run this check through npm run test:package');
const temporary = mkdtempSync(join(tmpdir(), 'obd2-package-'));
const source = join(temporary, 'source');
const consumer = join(temporary, 'consumer');
const runNpm = (args, cwd) => execFileSync(process.execPath, [npmCli, ...args], {
  cwd, encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'inherit'],
});

try {
  mkdirSync(source);
  mkdirSync(consumer);
  for (const path of ['package.json', 'tsconfig.json', 'src', 'docs', 'examples',
    'README.md', 'README.ja.md', 'CHANGELOG.md', 'LICENSE', 'CONTRIBUTING.md']) {
    cpSync(join(root, path), join(source, path), { recursive: true });
  }
  // Reuse installed build tools only in the source staging directory.
  // The separate consumer installation cannot resolve this node_modules.
  symlinkSync(join(root, 'node_modules'), join(source, 'node_modules'), 'junction');
  assert(!existsSync(join(source, 'dist')), 'staging must start without build output');
  const [pack] = JSON.parse(runNpm(['pack', '--json', '--pack-destination', temporary], source));
  const included = new Set(pack.files.map(file => file.path));
  for (const required of ['dist/index.js', 'dist/server.js', 'dist/mock.js', 'dist/demo.js',
    'README.md', 'README.ja.md', 'CHANGELOG.md', 'LICENSE', 'CONTRIBUTING.md',
    'docs/demo-results.md', 'docs/try-mock.md', 'docs/images/get-started-en.svg',
    'docs/images/get-started-ja.svg', 'examples/mock-demo.mjs']) {
    assert(included.has(required), `package is missing ${required}`);
  }
  assert([...included].every(path => !path.startsWith('node_modules/')));
  const tarball = join(temporary, pack.filename);
  runNpm(['install', '--prefix', consumer, '--ignore-scripts', '--omit=dev',
    '--no-audit', '--no-fund', '--package-lock=false', tarball], consumer);
  const installed = join(consumer, 'node_modules', 'obd2-mcp');
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  assert.equal(manifest.bin['obd2-mcp'], 'dist/index.js');
  assert(existsSync(join(consumer, 'node_modules', '.bin', process.platform === 'win32' ? 'obd2-mcp.cmd' : 'obd2-mcp')),
    'npm must create the CLI executable');
  const demoOutput = execFileSync(process.execPath, ['dist/index.js', '--demo'], {
    cwd: installed, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, OBD2MCP_CONNECTION: 'tcp:127.0.0.1:1' },
  });
  assert.match(demoOutput, /"simulated": true/);
  assert.match(demoOutput, /P0420/);
  execFileSync(process.execPath, [join(root, 'test/smoke.mjs')], {
    cwd: installed, stdio: 'inherit', timeout: 30000,
  });
  const demo = execFileSync(process.execPath, ['examples/mock-demo.mjs'], {
    cwd: installed, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'inherit'],
  });
  assert(demo.includes('read_freeze_frame') && demo.includes('P0420'), 'installed demo must return mock diagnostic data');
  console.log('PASS: clean npm package, isolated installation, mock smoke test, and packaged demo');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
