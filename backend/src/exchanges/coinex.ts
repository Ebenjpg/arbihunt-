import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface CoinexTicker {
  last: string;
  buy: string;
  sell: string;
  vol?: string;
}

export class CoinexAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'coinex',
      name: 'CoinEx',
      baseUrl: 'https://api.coinex.com',
      requestsPerSecond: 3,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<{ data: { ticker: Record<string, CoinexTicker> } }>('/v1/market/ticker/all');
    const out: TickerSnapshot[] = [];
    for (const [symbol, t] of Object.entries(data.data?.ticker || {})) {
      const s = snap(this.id, symbol, { bid: t.buy, ask: t.sell, last: t.last, volume24h: t.vol });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ data: { depth: { asks: string[][]; bids: string[][] } } }>(
      `/v2/spot/depth?market=${encodeURIComponent(exchangeSymbol)}&limit=${Math.min(depth, 50)}&interval=0`,
    );
    const book = data.data?.depth;
    if (!book) return { asks: [], bids: [] };
    return parseArrayBook(book.asks, book.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'CoinEx spot fee' };
  }
}
