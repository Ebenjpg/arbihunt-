import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface DigifinexTicker {
  symbol: string;
  buy: string;
  sell: string;
  last?: string;
  base_vol?: string;
}

export class DigifinexAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'digifinex',
      name: 'DigiFinex',
      baseUrl: 'https://api.digifinex.com',
      requestsPerSecond: 3,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<{ ticker: DigifinexTicker[] }>('/v3/ticker');
    const out: TickerSnapshot[] = [];
    for (const t of data.ticker || []) {
      const s = snap(this.id, t.symbol.toUpperCase(), {
        bid: t.buy,
        ask: t.sell,
        last: t.last,
        volume24h: t.base_vol,
      });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ asks: string[][]; bids: string[][] }>(
      `/v3/order_book?symbol=${encodeURIComponent(exchangeSymbol.toLowerCase())}&limit=${Math.min(depth, 50)}`,
    );
    return parseArrayBook(data.asks, data.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'DigiFinex spot fee' };
  }
}
