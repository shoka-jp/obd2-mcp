// Start an unpacked Claude Desktop extension the way Claude Desktop does and
// check its tools. Usage: node scripts/check-mcpb.mjs <unpacked bundle directory>
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const dir = resolve(process.argv[2] ?? '');
assert(existsSync(join(dir, 'manifest.json')), `no manifest.json in ${dir}`);
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
assert(existsSync(join(dir, manifest.server.entry_point)), 'entry point is missing from the bundle');
assert(existsSync(join(dir, manifest.icon)), 'icon is missing from the bundle');

// Packing applies default ignore rules, so check the packed result still has
// serialport's prebuilt binaries for the other desktop platforms.
const prebuildDir = join(dir, 'node_modules/@serialport/bindings-cpp/prebuilds');
const prebuilds = existsSync(prebuildDir) ? readdirSync(prebuildDir) : [];
for (const platform of ['win32-x64', 'darwin-x64+arm64', 'linux-x64']) {
  const files = prebuilds.includes(platform) ? readdirSync(join(prebuildDir, platform)) : [];
  assert(files.some(file => file.endsWith('.node')), `packed bundle has no serialport binary for ${platform}`);
}

// Substitute ${__dirname} and each setting's default, as the host does.
const substitute = (value, overrides = {}) => value
  .replaceAll('${__dirname}', dir)
  .replace(/\$\{user_config\.([a-z_]+)\}/g, (_, key) => {
    assert(key in manifest.user_config, `unknown user_config key ${key}`);
    return String(key in overrides ? overrides[key] : manifest.user_config[key].default);
  });
const { command, args, env } = manifest.server.mcp_config;
assert.equal(command, 'node');

async function withServer(overrides, check) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: args.map(arg => substitute(arg, overrides)),
    env: { PATH: process.env.PATH ?? '', ...Object.fromEntries(Object.entries(env).map(([k, v]) => [k, substitute(v, overrides)])) },
    stderr: 'inherit',
  });
  const client = new Client({ name: 'mcpb-check', version: '1' });
  await client.connect(transport);
  try {
    await check(client);
  } finally {
    await client.close();
  }
}

const json = result => {
  assert.notEqual(result.isError, true, result.content[0].text);
  return JSON.parse(result.content[0].text);
};

await withServer({}, async client => {
  const names = (await client.listTools()).tools.map(t => t.name).sort();
  assert.deepEqual(names, manifest.tools.map(t => t.name).sort(), 'manifest tools must match the server');
  const prompts = (await client.listPrompts()).prompts.map(p => p.name).sort();
  assert.deepEqual(prompts, ['check_engine_light', 'connect_adapter', 'used_car_check', 'workshop_handover']);
  const codes = json(await client.callTool({ name: 'read_dtcs', arguments: {} }));
  assert.equal(codes.simulated, true);
  assert.deepEqual(codes.stored_dtcs, ['P0420']);
  // Loads serialport's native binary from the bundle on this platform.
  const ports = json(await client.callTool({ name: 'list_serial_ports', arguments: {} }));
  assert.ok(Array.isArray(ports.ports));
});

// A setting cleared in the extension settings may arrive as an empty string.
await withServer({ connection: '', mock_scenario: '', baud: '' }, async client => {
  const codes = json(await client.callTool({ name: 'read_dtcs', arguments: {} }));
  assert.equal(codes.simulated, true);
  assert.match(codes.source, /^mock:catalyst/);
});

await withServer({ mock_scenario: 'healthy' }, async client => {
  const codes = json(await client.callTool({ name: 'read_dtcs', arguments: {} }));
  assert.deepEqual(codes.stored_dtcs, []);
});

console.log(`PASS: ${manifest.name} ${manifest.version} bundle starts with default, cleared and changed settings; ${manifest.tools.length} tools and 4 prompts match`);
