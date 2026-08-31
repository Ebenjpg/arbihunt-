import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface CryptoComTicker {
  i: string;
  b: string;
  k: string;
  a?: string;
  v?: string;
}

export class CryptoComAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'cryptocom',
      name: 'Crypto.com',
      baseUrl: 'https://api.crypto.com',
      requestsPerSecond: 4,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<{ result: { data: CryptoComTicker[] } }>('/exchange/v1/public/get-tickers');
    const out: TickerSnapshot[] = [];
    for (const t of data.result?.data || []) {
      const s = snap(this.id, t.i, { bid: t.b, ask: t.k, last: t.a, volume24h: t.v });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ result: { data: { asks: [string, string][]; bids: [string, string][] }[] } }>(
      `/exchange/v1/public/get-book?instrument_name=${encodeURIComponent(exchangeSymbol)}&depth=${Math.min(depth, 50)}`,
    );
    const book = data.result?.data?.[0];
    if (!book) return { asks: [], bids: [] };
    return parseArrayBook(book.asks, book.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.004, maker: 0.004, source: 'fallback', note: 'Base fee before volume tiers' };
  }
}
