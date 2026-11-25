import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import net from "node:net";
import test, { mock } from "node:test";
import { TcpTransport } from "../dist/transport.js";

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
