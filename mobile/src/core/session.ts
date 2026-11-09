import { Elm327 } from './vendor/elm327';
import { decodeDtcPair, parseDtcPayload } from './vendor/dtc';
import type { Transport } from './vendor/transport';
import { RestrictedTransport } from './transport';

export type Observations = {
  simulated: boolean;
  collectedAt: string;
  milOn: boolean | null;
  reportedCount: number | null;
  stored: string[] | null;
  pending: string[] | null;
  rpm: number | null;
  coolant: number | null;
  freezeCode: string | null;
  freezeRpm: number | null;
  freezeCoolant: number | null;
  incomplete: boolean;
};

/** Read-only phone experience. Missing or inconsistent results stay unknown. */
export class PhoneSession {
  private readonly elm: Elm327;
  private reading = false;
  constructor(transport: Transport, private readonly simulated: boolean) {
    this.elm = new Elm327(new RestrictedTransport(transport));
  }

  async connect(): Promise<void> {
    const identity = await this.elm.at('ATI');
    if (!identity || /^(\?|ERROR|NO DATA|STOPPED|UNABLE TO CONNECT)$/i.test(identity)) {
      await this.close();
      throw new Error('Adapter did not provide a usable identity.');
    }
  }

  async read(): Promise<Observations> {
    if (this.reading) throw new Error('A read is already in progress.');
    this.reading = true;
    try {
    let incomplete = false;
    const optional = async <T,>(read: () => Promise<T>): Promise<T | null> => {
      try { return await read(); }
      catch { incomplete = true; return null; }
    };
    const bytes = async (request: string, prefix: string, min: number) => {
      const result = await this.elm.obd(request, prefix);
      if (result.length < min) throw new Error('Incomplete response.');
      return result;
    };
    const status = await optional(() => bytes('0101', '4101', 4));
    const reportedCount = status ? status[0] & 0x7f : null;
    const milOn = status ? (status[0] & 0x80) !== 0 : null;
    const codes = async (request: string, prefix: string) => {
      const payload = await this.elm.obd(request, prefix);
      // A bare response prefix does not establish an empty code list.
      if (payload.length === 0) throw new Error('Incomplete code response.');
      return parseDtcPayload(payload);
    };
    let stored = await optional(() => codes('03', '43'));
    const pending = await optional(() => codes('07', '47'));
    if (reportedCount !== null && reportedCount > 0 && (!stored || stored.length < reportedCount)) {
      stored = null;
      incomplete = true;
    }
    const rpmBytes = await optional(() => bytes('010C', '410C', 2));
    const coolantBytes = await optional(() => bytes('0105', '4105', 1));
    const freeze = await optional(() => bytes('020200', '420200', 2));
    const freezeCode = freeze ? decodeDtcPair(freeze[0], freeze[1]) : null;
    const freezeRpmBytes = freezeCode ? await optional(() => bytes('020C00', '420C00', 2)) : null;
    const freezeCoolantBytes = freezeCode ? await optional(() => bytes('020500', '420500', 1)) : null;
    return {
      simulated: this.simulated, collectedAt: new Date().toISOString(),
      milOn, reportedCount, stored, pending,
      rpm: rpmBytes ? (rpmBytes[0] * 256 + rpmBytes[1]) / 4 : null,
      coolant: coolantBytes ? coolantBytes[0] - 40 : null,
      freezeCode,
      freezeRpm: freezeRpmBytes ? (freezeRpmBytes[0] * 256 + freezeRpmBytes[1]) / 4 : null,
      freezeCoolant: freezeCoolantBytes ? freezeCoolantBytes[0] - 40 : null,
      incomplete,
    };
    } finally {
      this.reading = false;
    }
  }

  close() { return this.elm.close(); }
}
