import test from 'node:test';
import assert from 'node:assert/strict';
import { PID_BY_CODE, PIDS } from '../dist/pids.js';

const hexBytes = (hex) => hex.trim().split(/\s+/).map((b) => parseInt(b, 16));

test('parse converts explicit Mode 01 byte fixtures accurately', () => {
  const cases = [
    ['0C', 'rpm', '1A F8', 1726],
    ['05', 'coolant_temp', '7B', 83],
    ['06', 'stft_b1', '80', 0],
    ['0E', 'timing_advance', '80', 0],
    ['10', 'maf', '01 F4', 5],
    ['42', 'module_voltage', '30 D4', 12.5],
    ['3C', 'catalyst_temp_b1s1', '11 94', 410],
    ['14', 'o2_b1s1_voltage', '5A FF', 0.45],
    ['05', 'coolant_temp', '00', -40],
    ['06', 'stft_b1', '00', -100],
    ['04', 'engine_load', 'FF', 100],
    ['15', 'o2_b1s2_voltage', '5A FF', 0.45],
  ];

  for (const [code, name, bytesHex, expected] of cases) {
    const def = PID_BY_CODE.get(code);
    assert.ok(def, `Missing PID ${code}`);
    assert.equal(def.name, name);
    const actual = def.parse(hexBytes(bytesHex));
    assert.ok(
      Math.abs(actual - expected) <= 1e-9,
      `${name} (${code}) [${bytesHex}]: expected ${expected}, got ${actual}`,
    );
  }
});

test('every PID encode stays in 0-255 and round-trips within one resolution step', () => {
  const samplesByCode = {
    '04': { step: 100 / 255, values: [0, 23.5, 100] },
    '05': { step: 1, values: [-40, 0, 89, 215] },
    '06': { step: 100 / 128, values: [-100, 0, 1.6, 50] },
    '07': { step: 100 / 128, values: [-100, 0, 3.1, 50] },
    '08': { step: 100 / 128, values: [-100, 0, 0.8, 50] },
    '09': { step: 100 / 128, values: [-100, 0, 2.3, 50] },
    '0B': { step: 1, values: [0, 32, 255] },
    '0C': { step: 0.25, values: [0, 748, 2210, 8000] },
    '0D': { step: 1, values: [0, 98, 255] },
    '0E': { step: 0.5, values: [-64, 0, 12, 63.5] },
    '0F': { step: 1, values: [-40, 25, 120] },
    '10': { step: 0.01, values: [0, 3.1, 150.25, 655.35] },
    '11': { step: 100 / 255, values: [0, 14.9, 100] },
    '14': { step: 0.005, values: [0, 0.45, 1.275] },
    '15': { step: 0.005, values: [0, 0.66, 1.275] },
    '2F': { step: 100 / 255, values: [0, 62, 100] },
    '33': { step: 1, values: [0, 100, 255] },
    '3C': { step: 0.1, values: [-40, 0, 421, 1000] },
    '42': { step: 0.001, values: [0, 12.5, 14.32, 65.535] },
    '46': { step: 1, values: [-40, 26, 80] },
    '5C': { step: 1, values: [-40, 96, 150] },
  };

  for (const def of PIDS) {
    const spec = samplesByCode[def.pid];
    assert.ok(spec, `Missing round-trip test specification for PID ${def.pid} (${def.name})`);
    for (const value of spec.values) {
      const encoded = def.encode(value);
      assert.equal(encoded.length, def.bytes, `${def.name}: byte length`);
      for (const byte of encoded) {
        assert.ok(
          Number.isInteger(byte) && byte >= 0 && byte <= 255,
          `${def.name}: byte ${byte} out of 0..255 for value ${value}`,
        );
      }
      const decoded = def.parse(encoded);
      assert.ok(
        Math.abs(decoded - value) <= spec.step + 1e-9,
        `${def.name}: round-trip(${value}) = ${decoded}, exceeds step ${spec.step}`,
      );
    }
  }
});
