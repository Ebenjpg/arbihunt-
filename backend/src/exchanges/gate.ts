import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface GateTicker {
  currency_pair: string;
  highest_bid: string;
  lowest_ask: string;
  last?: string;
  quote_volume?: string;
}

export class GateAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'gate',
      name: 'Gate.io',
      baseUrl: 'https://api.gateio.ws',
      requestsPerSecond: 6,
      maxConcurrent: 4,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<GateTicker[]>('/api/v4/spot/tickers');
    const out: TickerSnapshot[] = [];
    for (const t of data || []) {
      const s = snap(this.id, t.currency_pair, { bid: t.highest_bid, ask: t.lowest_ask, last: t.last, volume24h: t.quote_volume });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ asks: string[][]; bids: string[][] }>(
      `/api/v4/spot/order_book?currency_pair=${encodeURIComponent(exchangeSymbol)}&limit=${Math.min(depth, 100)}`,
    );
    return parseArrayBook(data.asks, data.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'Spot fee with GT deduction may differ' };
  }
}
