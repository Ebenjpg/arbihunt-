import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface BybitTicker {
  symbol: string;
  bid1Price: string;
  ask1Price: string;
  lastPrice?: string;
  volume24h?: string;
}

export class BybitAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'bybit',
      name: 'Bybit',
      baseUrl: 'https://api.bybit.com',
      requestsPerSecond: 6,
    });
    this.wsCapable = true;
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<{ result: { list: BybitTicker[] } }>('/v5/market/tickers?category=spot');
    const out: TickerSnapshot[] = [];
    for (const t of data.result.list || []) {
      const s = snap(this.id, t.symbol, { bid: t.bid1Price, ask: t.ask1Price, last: t.lastPrice, volume24h: t.volume24h });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ result: { b: string[][]; a: string[][] } }>(
      `/v5/market/orderbook?category=spot&symbol=${encodeURIComponent(exchangeSymbol)}&limit=${Math.min(depth, 200)}`,
    );
    return parseArrayBook(data.result.a, data.result.b);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'Standard spot fee' };
  }
}
