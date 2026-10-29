// Run from the repository root after npm ci && npm run build:
// node examples/mock-demo.mjs
// Always uses simulated data; never connects to a vehicle or clears codes.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'documented-demo', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js', '--connection', 'mock'],
});
try {
  await client.connect(transport);
  for (const name of ['connection_status', 'read_dtcs', 'read_freeze_frame', 'read_live_data']) {
    const result = await client.callTool({ name, arguments: {} });
    if (result.isError) throw new Error(JSON.stringify(result));
    console.log(JSON.stringify({ tool: name, result }, null, 2));
  }
} finally {
  await client.close();
}
