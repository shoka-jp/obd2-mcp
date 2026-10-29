import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));

function run(args, connection) {
  const env = { ...process.env };
  delete env.OBD2MCP_CONNECTION;
  if (connection !== undefined) env.OBD2MCP_CONNECTION = connection;
  const result = spawnSync(process.execPath, [entry, ...args], {
    env,
    encoding: "utf8",
    timeout: 5000,
  });
  assert.ifError(result.error);
  return result;
}

test("a missing --connection value fails instead of starting the mock vehicle", () => {
  const result = run(["--connection"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing value for --connection/);
  assert.doesNotMatch(result.stderr, /obd2-mcp ready/);
});

test("a missing CLI value does not fall back to the environment", () => {
  const result = run(["--connection"], "mock");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing value for --connection/);
  assert.doesNotMatch(result.stderr, /obd2-mcp ready/);
});

test("omitting --connection still uses the default mock vehicle", () => {
  const result = run([]);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /obd2-mcp ready/);
});

test("an explicit mock connection overrides an invalid environment value", () => {
  const result = run(["--connection", "mock"], "invalid");
  assert.equal(result.status, 0);
  assert.match(result.stderr, /obd2-mcp ready/);
});
