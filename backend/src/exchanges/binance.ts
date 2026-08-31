import { BaseAdapter } from './base';
import type { FeeInfo } from '@arbihunt/shared';
import type { TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface BinanceBookTicker {
  symbol: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
}

export class BinanceAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'binance',
      name: 'Binance',
      baseUrl: 'https://api.binance.com',
      requestsPerSecond: 8,
    });
    this.wsCapable = true;
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<BinanceBookTicker[]>('/api/v3/ticker/bookTicker', { headers: { 'x-mbx-used-weight-1s': '' } });
    const out: TickerSnapshot[] = [];
    for (const t of data) {
      if (!/^(USD|EUR|BTC|ETH)$/.test(t.symbol)) {
        const s = snap(this.id, t.symbol, { bid: t.bidPrice, ask: t.askPrice });
        if (s) out.push(s);
      }
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ bids: string[][]; asks: string[][] }>(
      `/api/v3/depth?symbol=${encodeURIComponent(exchangeSymbol)}&limit=${Math.min(depth, 1000)}`,
    );
    return parseArrayBook(data.asks, data.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'Standard 0.10% spot fee' };
  }
}
