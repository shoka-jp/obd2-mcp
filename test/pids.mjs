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
    ['1F', 'run_time', '02 80', 640],
    ['21', 'distance_with_mil', '00 80', 128],
    ['30', 'warmups_since_clear', '12', 18],
    ['31', 'distance_since_clear', '01 5E', 350],
    ['0A', 'fuel_pressure', '64', 300],
    ['23', 'fuel_rail_pressure', '01 F4', 5000],
    ['2C', 'commanded_egr', 'FF', 100],
    ['2E', 'evap_purge', '00', 0],
    ['43', 'absolute_load', '00 FF', 100],
    ['44', 'commanded_lambda', '80 00', 1],
    ['45', 'relative_throttle', 'FF', 100],
    ['49', 'accelerator_pedal', '00', 0],
    ['4D', 'time_with_mil', '00 5F', 95],
    ['4E', 'time_since_clear', '04 9C', 1180],
    ['5B', 'hybrid_battery_remaining', 'FF', 100],
    ['5E', 'fuel_rate', '00 0F', 0.75],
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
    '1F': { step: 1, values: [0, 640, 65535] },
    '21': { step: 1, values: [0, 128, 65535] },
    '2F': { step: 100 / 255, values: [0, 62, 100] },
    '30': { step: 1, values: [0, 18, 255] },
    '31': { step: 1, values: [0, 350, 65535] },
    '33': { step: 1, values: [0, 100, 255] },
    '3C': { step: 0.1, values: [-40, 0, 421, 1000] },
    '42': { step: 0.001, values: [0, 12.5, 14.32, 65.535] },
    '46': { step: 1, values: [-40, 26, 80] },
    '5C': { step: 1, values: [-40, 96, 150] },
    '0A': { step: 3, values: [0, 300, 765] },
    '23': { step: 10, values: [0, 5000, 655350] },
    '2C': { step: 100 / 255, values: [0, 12, 100] },
    '2E': { step: 100 / 255, values: [0, 12.2, 100] },
    '43': { step: 100 / 255, values: [0, 21.2, 25700] },
    '44': { step: 2 / 65536, values: [0, 0.8, 1, 1.999] },
    '45': { step: 100 / 255, values: [0, 3.1, 100] },
    '49': { step: 100 / 255, values: [0, 18, 100] },
    '4D': { step: 1, values: [0, 95, 65535] },
    '4E': { step: 1, values: [0, 1180, 65535] },
    '5B': { step: 100 / 255, values: [0, 57, 100] },
    '5E': { step: 0.05, values: [0, 0.75, 3276.75] },
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
