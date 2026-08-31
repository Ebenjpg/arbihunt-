import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

// v3 tickers returns rows as arrays:
// [symbol, last_price, volume_24h, turnover_24h, open_24h, high_24h,
//  low_24h, change_24h, bid_px, bid_sz, ask_px, ask_sz, timestamp]
export class BitmartAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'bitmart',
      name: 'BitMart',
      baseUrl: 'https://api-cloud.bitmart.com',
      requestsPerSecond: 3,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<{ data: unknown[][] }>('/spot/quotation/v3/tickers');
    const out: TickerSnapshot[] = [];
    for (const row of data.data || []) {
      if (!Array.isArray(row) || row.length < 11) continue;
      const symbol = String(row[0]);
      const s = snap(this.id, symbol, {
        bid: row[8],
        ask: row[10],
        last: row[1],
        volume24h: row[2],
      });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ data: { asks: [string, string][]; bids: [string, string][] } }>(
      `/spot/quotation/v3/books?symbol=${encodeURIComponent(exchangeSymbol)}&limit=${Math.min(depth, 50)}`,
    );
    const book = data.data;
    if (!book) return { asks: [], bids: [] };
    return parseArrayBook(book.asks, book.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.0025, maker: 0.0025, source: 'fallback', note: 'BitMart spot fee' };
  }
}
