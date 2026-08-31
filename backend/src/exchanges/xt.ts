import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface XtTicker {
  s: string;
  c?: string;
  o?: string;
  b?: string;
  a?: string;
  v?: string;
}

export class XtAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'xt',
      name: 'XT.com',
      baseUrl: 'https://sapi.xt.com',
      requestsPerSecond: 3,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<{ result: XtTicker[] }>('/v4/public/ticker');
    const out: TickerSnapshot[] = [];
    for (const t of data.result || []) {
      const s = snap(this.id, t.s.toUpperCase(), { bid: t.b, ask: t.a, last: t.c, volume24h: t.v });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ result: { asks: string[][]; bids: string[][] } }>(
      `/v4/public/depth?symbol=${encodeURIComponent(exchangeSymbol)}&limit=${Math.min(depth, 50)}`,
    );
    const book = data.result;
    if (!book) return { asks: [], bids: [] };
    return parseArrayBook(book.asks, book.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'XT.com spot fee' };
  }
}
