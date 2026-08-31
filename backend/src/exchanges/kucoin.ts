import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface KucoinTicker {
  symbol: string;
  buy: string;
  sell: string;
  last?: string;
  volValue?: string;
}

export class KucoinAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'kucoin',
      name: 'KuCoin',
      baseUrl: 'https://api.kucoin.com',
      requestsPerSecond: 4,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<{ data: { ticker: KucoinTicker[] } }>('/api/v1/market/allTickers');
    const out: TickerSnapshot[] = [];
    for (const t of data.data?.ticker || []) {
      const s = snap(this.id, t.symbol.replace(/-/g, '/'), { bid: t.buy, ask: t.sell, last: t.last, volume24h: t.volValue });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ data: { asks: string[][]; bids: string[][] } }>(
      `/api/v1/market/orderbook/level2_100?symbol=${encodeURIComponent(exchangeSymbol)}`,
    );
    const book = data.data;
    if (!book) return { asks: [], bids: [] };
    return parseArrayBook(book.asks, book.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'Standard spot fee' };
  }
}
