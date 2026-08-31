import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface HtxTicker {
  symbol: string;
  bid: string;
  ask: string;
  last?: string;
  vol?: string;
}

export class HtxAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'htx',
      name: 'HTX',
      baseUrl: 'https://api.huobi.pro',
      requestsPerSecond: 5,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<{ data: HtxTicker[] }>('/market/tickers');
    const out: TickerSnapshot[] = [];
    for (const t of data.data || []) {
      const s = snap(this.id, t.symbol, { bid: t.bid, ask: t.ask, last: t.last, volume24h: t.vol });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ tick: { asks: string[][]; bids: string[][] } }>(
      `/market/depth?symbol=${encodeURIComponent(exchangeSymbol)}&depth=${Math.min(depth, 150)}&type=step0`,
    );
    const book = data.tick;
    if (!book) return { asks: [], bids: [] };
    return parseArrayBook(book.asks, book.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'Standard spot fee' };
  }
}
