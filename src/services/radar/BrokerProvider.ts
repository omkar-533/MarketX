/**
 * BrokerProvider — READ-ONLY architecture placeholder.
 * DO NOT claim any broker is connected. No passwords/OTPs here.
 */
export type BrokerId = 'zerodha' | 'angelone' | 'upstox' | 'fyers';

export interface BrokerProvider {
  readonly id: BrokerId;
  readonly label: string;
  readonly connected: boolean;
  authorize(): Promise<{ ok: false; reason: string }>;
  getHoldings?(): Promise<never>;
}

export class UnconnectedBrokerAdapter implements BrokerProvider {
  constructor(
    readonly id: BrokerId,
    readonly label: string,
  ) {}

  readonly connected = false;

  async authorize() {
    return {
      ok: false as const,
      reason: 'Broker integration not enabled. Architecture only — no live connection.',
    };
  }
}

export const brokerAdapters: BrokerProvider[] = [
  new UnconnectedBrokerAdapter('zerodha', 'Zerodha'),
  new UnconnectedBrokerAdapter('angelone', 'Angel One'),
  new UnconnectedBrokerAdapter('upstox', 'Upstox'),
  new UnconnectedBrokerAdapter('fyers', 'Fyers'),
];
