import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeDtcPair, encodeDtc } from '../dist/dtc.js';

test('known DTC byte pairs encode and decode for each code family', () => {
  const cases = [
    ['P0420', [0x04, 0x20]],
    ['C1234', [0x52, 0x34]],
    ['B1234', [0x92, 0x34]],
    ['U1234', [0xd2, 0x34]],
  ];
  for (const [code, bytes] of cases) {
    assert.deepEqual(encodeDtc(code), bytes, code);
    assert.equal(decodeDtcPair(...bytes), code);
  }
});

test('encoding accepts case and surrounding whitespace but rejects invalid codes', () => {
  assert.deepEqual(encodeDtc('  p0420\t'), [0x04, 0x20]);
  for (const invalid of ['', 'P4420', 'P04G0', 'P042', 'X1234']) {
    assert.throws(() => encodeDtc(invalid), /Invalid DTC/);
  }
});

test('zero byte pair is filler, not a diagnostic code', () => {
  assert.equal(decodeDtcPair(0x00, 0x00), null);
});
