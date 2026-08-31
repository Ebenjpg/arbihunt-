import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface BitrueTicker {
  symbol: string;
  bidPrice?: string;
  askPrice?: string;
  lastPrice?: string;
  volume?: string;
}

export class BitrueAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'bitrue',
      name: 'Bitrue',
      baseUrl: 'https://www.bitrue.com',
      requestsPerSecond: 3,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<BitrueTicker[]>('/api/v1/ticker/24hr');
    const out: TickerSnapshot[] = [];
    for (const t of data || []) {
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
    const { data } = await this.http.get<{ asks: string[][]; bids: string[][] }>(
      `/api/v1/depth?symbol=${encodeURIComponent(exchangeSymbol)}&limit=${Math.min(depth, 50)}`,
    );
    return parseArrayBook(data.asks, data.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'Bitrue spot fee' };
  }
}
