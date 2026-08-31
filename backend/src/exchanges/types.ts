import type { FeeInfo, NetworkDescriptor, OrderBookSnapshot, TickerSnapshot, ExchangeStatus } from '@arbihunt/shared';

export interface ExchangeAdapter {
  readonly id: string;
  readonly name: string;
  /** symbols this adapter can stream over WebSocket (bookTicker style) */
  wsCapable: boolean;

  fetchTickers(): Promise<TickerSnapshot[]>;
  fetchOrderBook(exchangeSymbol: string, depth?: number): Promise<OrderBookSnapshot>;
  getDefaultFees(): FeeInfo;
  getNetworkInfo?(asset: string): NetworkDescriptor[] | null;
  getStatus(): ExchangeStatus;
  recordError(err: unknown): void;
  recordLatency(ms: number): void;
  markConnected(): void;
  markRested(): void;
  setConnection(state: ExchangeStatus['connection']): void;
  setWs(state: ExchangeStatus['ws']): void;
}
