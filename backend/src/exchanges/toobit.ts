import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface ToobitBookTicker {
  s: string;
  b: string;
  bq?: string;
  a: string;
  aq?: string;
}

export class ToobitAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'toobit',
      name: 'Toobit',
      baseUrl: 'https://api.toobit.com',
      requestsPerSecond: 3,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<ToobitBookTicker[]>('/quote/v1/ticker/bookTicker');
    const out: TickerSnapshot[] = [];
    for (const t of data || []) {
      const s = snap(this.id, t.s, { bid: t.b, ask: t.a });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ b: string[][]; a: string[][] }>(
      `/quote/v1/depth?symbol=${encodeURIComponent(exchangeSymbol)}&limit=${Math.min(depth, 50)}`,
    );
    return parseArrayBook(data.a, data.b);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'Toobit spot fee' };
  }
}
