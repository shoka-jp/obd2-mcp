// Stage a Claude Desktop extension (MCP Bundle) directory from the built package.
// Usage: npm run build:mcpb [-- <output directory>]  (default: build/mcpb)
// Pack the result with: npx @anthropic-ai/mcpb pack build/mcpb obd2-mcp-<version>.mcpb
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2] ?? 'build/mcpb');
const npmCli = process.env.npm_execpath;
assert(npmCli, 'Run this script through npm run build:mcpb');
assert(existsSync(join(root, 'dist/index.js')), 'dist/index.js is missing; npm run build:mcpb builds it first');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const path of ['dist', 'package.json', 'package-lock.json', 'LICENSE', 'README.md']) {
  cpSync(join(root, path), join(out, path), { recursive: true });
}
cpSync(join(root, 'mcpb/icon.png'), join(out, 'icon.png'));
// Guides served as MCP resources (src/resources.ts).
for (const guide of ['adapters.md', 'troubleshooting.md', 'used-car-check.md']) {
  cpSync(join(root, 'docs', guide), join(out, 'docs', guide));
}

const manifest = JSON.parse(readFileSync(join(root, 'mcpb/manifest.json'), 'utf8'));
manifest.version = pkg.version;
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// Production dependencies only, including the optional serialport package.
// Install scripts are skipped: serialport ships prebuilt N-API binaries.
execFileSync(process.execPath, [npmCli, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: out, stdio: 'inherit', timeout: 300000,
});
rmSync(join(out, 'package-lock.json'));

// The bundle is built once and installed on every desktop platform, so it must
// carry serialport binaries for Windows and macOS as well as the build machine.
const prebuildDir = join(out, 'node_modules/@serialport/bindings-cpp/prebuilds');
assert(existsSync(prebuildDir), 'serialport prebuilt binaries are missing from the bundle');
const prebuilds = readdirSync(prebuildDir);
console.log(`serialport prebuilds: ${prebuilds.join(', ')}`);
for (const [label, ok] of [
  ['Windows x64', prebuilds.some(name => name.startsWith('win32-') && name.includes('x64'))],
  ['macOS arm64', prebuilds.some(name => name.startsWith('darwin-') && name.includes('arm64'))],
  ['macOS x64', prebuilds.some(name => name.startsWith('darwin-') && name.includes('x64'))],
]) {
  assert(ok, `serialport has no prebuilt binary for ${label}`);
}
console.log(`Staged ${manifest.name} ${manifest.version} for packing in ${out}`);
