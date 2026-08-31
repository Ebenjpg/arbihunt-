import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface OkxTicker {
  instId: string;
  bidPx: string;
  askPx: string;
  last?: string;
  vol24h?: string;
}

export class OkxAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'okx',
      name: 'OKX',
      baseUrl: 'https://www.okx.com',
      requestsPerSecond: 6,
    });
    this.wsCapable = true;
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<{ data: OkxTicker[] }>('/api/v5/market/tickers?instType=SPOT');
    const out: TickerSnapshot[] = [];
    for (const t of data.data || []) {
      const s = snap(this.id, t.instId, { bid: t.bidPx, ask: t.askPx, last: t.last, volume24h: t.vol24h });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ data: { asks: string[][]; bids: string[][] }[] }>(
      `/api/v5/market/books?instId=${encodeURIComponent(exchangeSymbol)}&sz=${Math.min(depth, 400)}`,
    );
    const book = data.data?.[0];
    if (!book) return { asks: [], bids: [] };
    return parseArrayBook(book.asks, book.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.0008, source: 'fallback', note: 'OKX spot taker fee' };
  }
}
