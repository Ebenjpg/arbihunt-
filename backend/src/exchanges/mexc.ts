import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface MexcBookTicker {
  symbol: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
}

export class MexcAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'mexc',
      name: 'MEXC',
      baseUrl: 'https://api.mexc.com',
      requestsPerSecond: 5,
      maxConcurrent: 4,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<MexcBookTicker[]>('/api/v3/ticker/bookTicker');
    const out: TickerSnapshot[] = [];
    for (const t of data || []) {
      const s = snap(this.id, t.symbol, { bid: t.bidPrice, ask: t.askPrice });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ asks: string[][]; bids: string[][] }>(
      `/api/v3/depth?symbol=${encodeURIComponent(exchangeSymbol)}&limit=${Math.min(depth, 1000)}`,
    );
    return parseArrayBook(data.asks, data.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'MEXC spot fee' };
  }
}
