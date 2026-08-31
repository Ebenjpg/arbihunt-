import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface AscendexTicker {
  symbol: string;
  close: string;
  ask?: [string, string];
  bid?: [string, string];
  volume?: string;
}

export class AscendexAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'ascendex',
      name: 'AscendEX',
      baseUrl: 'https://ascendex.com',
      requestsPerSecond: 3,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<{ data: AscendexTicker[] }>('/api/pro/v1/spot/ticker');
    const out: TickerSnapshot[] = [];
    for (const t of data.data || []) {
      const s = snap(this.id, t.symbol, {
        bid: t.bid?.[0],
        ask: t.ask?.[0],
        last: t.close,
        volume24h: t.volume,
      });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ data: { asks: string[][]; bids: string[][] } }>(
      `/api/pro/v1/depth?symbol=${encodeURIComponent(exchangeSymbol)}&n=${Math.min(depth, 50)}`,
    );
    const book = data.data;
    if (!book) return { asks: [], bids: [] };
    return parseArrayBook(book.asks, book.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'AscendEX spot fee' };
  }
}
