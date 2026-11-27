import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

test("--help prints usage without starting the server", () => {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag, "--connection", "tcp:127.0.0.1:1"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^obd2-mcp \d+\.\d+\.\d+/);
    assert.match(result.stdout, /--list-ports/);
    assert.match(result.stdout, /serial:<port>/);
    assert.match(result.stdout, /catalyst, healthy, misfire, lean/);
    assert.match(result.stdout, /--demo \[--scenario <name>\]/);
    assert.doesNotMatch(result.stderr, /obd2-mcp ready/);
  }
});

test("--version prints the package version", () => {
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  for (const flag of ["--version", "-v"]) {
    const result = run([flag]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), version);
  }
});

test("unknown arguments stop startup instead of silently using the mock vehicle", () => {
  const typo = run(["--list-port"]);
  assert.equal(typo.status, 1);
  assert.match(typo.stderr, /Unknown argument: --list-port\. Run obd2-mcp --help/);
  assert.doesNotMatch(typo.stderr, /obd2-mcp ready/);

  const equals = run(["--connection=serial:COM3"]);
  assert.equal(equals.status, 1);
  assert.match(equals.stderr, /Write the value after a space, e\.g\. --connection serial:COM3/);

  const positional = run(["serial:COM3", "extra"]);
  assert.equal(positional.status, 1);
  assert.match(positional.stderr, /Unknown arguments: serial:COM3 extra/);
});
