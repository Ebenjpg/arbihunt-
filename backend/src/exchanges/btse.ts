import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface BtseMarket {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  active?: boolean;
}

export class BtseAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'btse',
      name: 'BTSE',
      baseUrl: 'https://api.btse.com/public-api/market/v1',
      requestsPerSecond: 3,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    // Level-1 best bid/ask is provided by the quote fallback service via depth=1.
    const { data } = await this.http.get<{ data: { symbols: BtseMarket[] } }>('/markets');
    const out: TickerSnapshot[] = [];
    for (const m of data.data?.symbols || []) {
      if (m.active === false) continue;
      const s = snap(this.id, m.symbol, {});
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ data: { asks: string[][]; bids: string[][] } }>(
      `/orderbook?symbol=${encodeURIComponent(exchangeSymbol)}&depth=${Math.min(depth, 50)}`,
    );
    const book = data.data;
    if (!book) return { asks: [], bids: [] };
    return parseArrayBook(book.asks, book.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'BTSE spot fee' };
  }
}
