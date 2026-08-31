import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface BingxTicker {
  symbol: string;
  lastPrice?: string;
  bidPrice?: string;
  askPrice?: string;
  volume?: string;
}

export class BingxAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'bingx',
      name: 'BingX',
      baseUrl: 'https://open-api.bingx.com',
      requestsPerSecond: 3,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<{ data: BingxTicker[] }>('/openApi/spot/v1/ticker/24hr');
    const out: TickerSnapshot[] = [];
    for (const t of data.data || []) {
      const s = snap(this.id, t.symbol, {
        bid: t.bidPrice,
        ask: t.askPrice,
        last: t.lastPrice,
        volume24h: t.volume,
      });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ data: { asks: string[][]; bids: string[][] } }>(
      `/openApi/spot/v1/market/depth?symbol=${encodeURIComponent(exchangeSymbol)}&limit=${Math.min(depth, 100)}`,
    );
    const book = data.data;
    if (!book) return { asks: [], bids: [] };
    return parseArrayBook(book.asks, book.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'BingX spot fee' };
  }
}
