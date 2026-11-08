"""Exercise the real TCP and serial transports with a simulated ELM327.

Run on a POSIX host after ``npm run build``. No vehicle or adapter is used.
"""

import json
import os
import pty
import select
import socket
import subprocess
import threading
import time
import tty

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIN = '1HGFC2F59GA000042'  # Synthetic test data.


def answer(command):
    known = {
        'ATZ': 'ELM327 v1.5', 'ATI': 'ELM327 v1.5', 'ATRV': '12.6V',
        '0100': '41 00 98 18 80 01', '0120': '41 20 00 00 00 01',
        '0140': '41 40 00 00 00 00', '0101': '41 01 81 07 E5 04',
        '03': '43 01 04 20', '07': '47 00', '010C': '41 0C 0B B0',
        '0105': '41 05 81', '020200': '42 02 00 04 20',
        '020500': '42 05 00 81',
    }
    if command in ['ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0']:
        return 'OK'
    if command == '0902':
        data = bytes([0x49, 0x02, 0x01]) + VIN.encode('ascii')
        frames = ['%X: %s' % (i, chunk.hex(' ').upper())
                  for i, chunk in enumerate(data[j:j + 7] for j in range(0, len(data), 7))]
        return '%03X\r%s' % (len(data), '\r'.join(frames))
    return known.get(command, 'NO DATA')


def run(kind):
    stop = threading.Event()
    commands = []
    if kind == 'tcp':
        listener = socket.socket()
        listener.bind(('127.0.0.1', 0))
        listener.listen(1)
        listener.settimeout(10)
        connection = 'tcp:127.0.0.1:%s' % listener.getsockname()[1]
    else:
        master, slave = pty.openpty()
        tty.setraw(slave)
        connection = 'serial:' + os.ttyname(slave)

    def emulate():
        sock = None
        try:
            if kind == 'tcp':
                sock, _ = listener.accept()
                fd = sock.fileno()
            else:
                fd = master
            buffer = b''
            while not stop.is_set():
                if not select.select([fd], [], [], 0.1)[0]:
                    continue
                data = os.read(fd, 4096)
                if not data:
                    break
                buffer += data
                while b'\r' in buffer:
                    raw, buffer = buffer.split(b'\r', 1)
                    command = raw.decode('ascii').strip().upper()
                    if not command:
                        continue
                    commands.append(command)
                    response = (answer(command) + '\r>').encode('ascii')
                    # Deliver responses in separate chunks, like a byte stream.
                    midpoint = max(1, len(response) // 2)
                    os.write(fd, response[:midpoint])
                    time.sleep(0.001)
                    os.write(fd, response[midpoint:])
        except (OSError, socket.timeout):
            if not stop.is_set():
                raise
        finally:
            if sock:
                sock.close()

    worker = threading.Thread(target=emulate, daemon=True)
    worker.start()
    env = dict(os.environ, OBD2MCP_CONNECTION=connection)
    env.pop('OBD2MCP_ENABLE_CLEAR', None)
    child = subprocess.Popen(['node', 'dist/index.js'], cwd=ROOT, env=env,
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE)
    buffer = b''
    sequence = 0

    def request(method, params):
        nonlocal buffer, sequence
        sequence += 1
        message = {'jsonrpc': '2.0', 'id': sequence, 'method': method, 'params': params}
        child.stdin.write((json.dumps(message) + '\n').encode())
        child.stdin.flush()
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if b'\n' in buffer:
                line, buffer = buffer.split(b'\n', 1)
                result = json.loads(line)
                if result.get('id') == sequence:
                    assert 'error' not in result, result
                    return result['result']
            if select.select([child.stdout], [], [], 0.1)[0]:
                data = os.read(child.stdout.fileno(), 8192)
                if not data:
                    raise RuntimeError('MCP server exited unexpectedly')
                buffer += data
        raise TimeoutError(method)

    def tool(name, args=None):
        result = request('tools/call', {'name': name, 'arguments': args or {}})
        assert not result.get('isError'), (name, result)
        return json.loads(result['content'][0]['text'])

    try:
        request('initialize', {'protocolVersion': '2024-11-05', 'capabilities': {},
                               'clientInfo': {'name': 'transport-check', 'version': '1'}})
        child.stdin.write(b'{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n')
        child.stdin.flush()
        assert tool('connection_status')['vehicle_communication'] == 'not_checked'
        assert 'rpm' in tool('read_supported_pids')['supported_sensor_names']
        assert tool('read_dtcs')['stored_dtcs'] == ['P0420']
        assert tool('read_freeze_frame')['freeze_frame']['dtc'] == 'P0420'
        assert tool('read_live_data', {'pids': ['rpm']})['live_data']['rpm']['value'] == 748
        assert tool('read_readiness')['readiness_monitors']['catalyst'] == 'complete'
        assert tool('read_vin')['vin'] == VIN
        report_start = len(commands)
        report = tool('read_diagnostic_report', {'pids': ['rpm']})
        assert report['sections']['read_dtcs']['data']['stored_dtcs'] == ['P0420']
        assert '0902' not in commands[report_start:] and '04' not in commands[report_start:]
        denied = request('tools/call', {'name': 'clear_dtcs', 'arguments': {'confirm': True}})
        assert denied.get('isError') is True and '04' not in commands
        print('%s: simulated ELM327 over OS transport; 8 read tools passed, clearing blocked' % kind)
    finally:
        stop.set()
        if child.poll() is None:
            child.terminate()
        child.wait(timeout=5)
        if kind == 'tcp':
            listener.close()
        else:
            os.close(master)
            os.close(slave)
        worker.join(timeout=2)


run('tcp')
run('serial')
