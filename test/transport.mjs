import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import net from "node:net";
import test, { mock } from "node:test";
import { SerialTransport, TcpTransport, serialOpenError } from "../dist/transport.js";

/** A socket that never connects, standing in for an unreachable WiFi adapter. */
function silentSocket() {
  const socket = new EventEmitter();
  socket.destroyed = false;
  socket.setEncoding = () => socket;
  socket.write = () => true;
  socket.destroy = () => {
    socket.destroyed = true;
    queueMicrotask(() => socket.emit("close"));
    return socket;
  };
  return socket;
}

test("an unreachable tcp adapter times out instead of waiting for the OS", async t => {
  const socket = silentSocket();
  t.after(() => mock.restoreAll());
  mock.method(net, "createConnection", () => socket);
  const transport = new TcpTransport("192.168.0.10", 35000, 20);
  await assert.rejects(transport.open(), /Timed out after 20 ms connecting to the adapter at tcp:192\.168\.0\.10:35000/);
  assert.equal(socket.destroyed, true);
  // The socket "close" that follows must not hide the original cause.
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(transport.sendRaw("ATI"), /unusable.*Timed out/);
});

test("a refused tcp connection still fails immediately with the socket error", async () => {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  const { port } = listener.address();
  await new Promise(resolve => listener.close(resolve));
  const transport = new TcpTransport("127.0.0.1", port, 5000);
  const started = Date.now();
  await assert.rejects(transport.open(), /ECONNREFUSED/);
  assert.ok(Date.now() - started < 5000, "refusal is reported before the connect timeout");
  await transport.close();
});

test("a connected tcp adapter is not affected by the connect timeout", async () => {
  const listener = net.createServer(socket => socket.on("data", () => socket.write("ELM327 v1.5\r\r>")));
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  const transport = new TcpTransport("127.0.0.1", listener.address().port, 30);
  try {
    await transport.open();
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.match(await transport.sendRaw("ATI"), /ELM327/);
  } finally {
    await transport.close();
    await new Promise(resolve => listener.close(resolve));
  }
});

/** A fake serialport module whose constructor fails like the real one does. */
function failingSerialPort(message) {
  return async () => ({
    SerialPort: class {
      constructor(_options, callback) {
        queueMicrotask(() => callback(new Error(message)));
      }
      setEncoding() {}
      on() {}
    },
  });
}

test("serial open errors keep the original text and add a next step", async () => {
  const cases = [
    ["Error: Permission denied, cannot open /dev/ttyUSB0", /dialout/],
    ["Opening COM3: Access denied", /Another program may be using the port/],
    ["Error: Resource busy, cannot open /dev/ttyUSB0", /Another program may be using the port/],
    ["Error: No such file or directory, cannot open /dev/tty.nope", /--list-ports/],
  ];
  for (const [message, hint] of cases) {
    const transport = new SerialTransport("/dev/ttyUSB0", 38400, failingSerialPort(message));
    await assert.rejects(transport.open(), error => {
      assert.match(error.message, /^Could not open serial:\/dev\/ttyUSB0: /);
      assert.ok(error.message.includes(message), "original error text is kept");
      assert.match(error.message, hint);
      assert.match(error.message, /docs\/troubleshooting\.md/);
      return true;
    });
  }
  assert.match(serialOpenError("COM9", new Error("File not found")).message, /--list-ports/);
});

test("a missing serialport package is still reported clearly", async () => {
  const transport = new SerialTransport("COM3", 38400, async () => { throw new Error("Cannot find package 'serialport'"); });
  await assert.rejects(transport.open(), /"serialport" package is not installed/);
});
