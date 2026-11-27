// Browser/mobile-safe subset of the server transport interface.
export interface Transport {
  open(): Promise<void>;
  sendRaw(cmd: string, timeoutMs?: number): Promise<string>;
  close(): Promise<void>;
  describe(): string;
}
