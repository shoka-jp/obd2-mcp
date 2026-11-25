import assert from "node:assert/strict";
import test from "node:test";
import { parseBaud, parseConnection } from "../dist/connection.js";

const describe = (argv, env = {}) => parseConnection(["node", "index.js", ...argv], env).transport.describe();

test("valid serial, tcp and mock settings are accepted", () => {
  assert.equal(describe([], { OBD2MCP_CONNECTION: "serial:COM3" }), "serial:COM3@38400");
  assert.equal(describe([], { OBD2MCP_CONNECTION: "serial:/dev/ttyUSB0", OBD2MCP_BAUD: "115200" }), "serial:/dev/ttyUSB0@115200");
  assert.equal(describe(["--connection", "tcp:192.168.0.10:35000"]), "tcp:192.168.0.10:35000");
  assert.equal(describe([], { OBD2MCP_CONNECTION: "tcp:[fe80::1]:35000" }), "tcp:[fe80::1]:35000");
  assert.equal(parseConnection(["node", "index.js"], {}).mock, true);
});

test("a blank baud rate uses the default", () => {
  assert.equal(parseBaud(undefined), 38400);
  assert.equal(parseBaud(""), 38400);
  assert.equal(parseBaud(" 9600 "), 9600);
});

test("an invalid baud rate stops startup and names the setting", () => {
  for (const value of ["fast", "38400baud", "0", "-9600", "96.5", "1e5"]) {
    assert.throws(() => parseBaud(value), /Invalid OBD2MCP_BAUD/, value);
    assert.throws(() => describe([], { OBD2MCP_CONNECTION: "serial:COM3", OBD2MCP_BAUD: value }), /Invalid OBD2MCP_BAUD/, value);
  }
});

test("the baud rate is ignored for tcp and mock connections", () => {
  assert.equal(describe([], { OBD2MCP_CONNECTION: "tcp:192.168.0.10:35000", OBD2MCP_BAUD: "fast" }), "tcp:192.168.0.10:35000");
  assert.equal(parseConnection(["node", "index.js"], { OBD2MCP_BAUD: "fast" }).mock, true);
});

test("an empty serial path is rejected", () => {
  assert.throws(() => describe([], { OBD2MCP_CONNECTION: "serial:" }), /Invalid serial spec/);
  assert.throws(() => describe([], { OBD2MCP_CONNECTION: "serial:  " }), /Invalid serial spec/);
});

test("an invalid tcp host or port is rejected before connecting", () => {
  const cases = {
    "tcp:192.168.0.10": /missing port/,
    "tcp::35000": /missing host/,
    "tcp:[]:35000": /missing host/,
    "tcp:192.168.0.10:": /port must be/,
    "tcp:192.168.0.10:abc": /port must be/,
    "tcp:192.168.0.10:0": /port must be/,
    "tcp:192.168.0.10:65536": /port must be/,
    "tcp:192.168.0.10:35000.5": /port must be/,
  };
  for (const [spec, message] of Object.entries(cases)) {
    assert.throws(() => describe([], { OBD2MCP_CONNECTION: spec }), message, spec);
  }
});

test("unknown connection kinds and missing CLI values are still rejected", () => {
  assert.throws(() => describe([], { OBD2MCP_CONNECTION: "bluetooth:car" }), /Invalid connection/);
  assert.throws(() => describe(["--connection"], { OBD2MCP_CONNECTION: "mock" }), /Missing value for --connection/);
  assert.throws(() => describe([], { OBD2MCP_MOCK_SCENARIO: "unknown" }), /Unknown mock scenario/);
});
