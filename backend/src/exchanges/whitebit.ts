import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface WhitebitTicker {
  bid: string;
  ask: string;
  last: string;
  baseVolume?: string;
}

export class WhitebitAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'whitebit',
      name: 'WhiteBIT',
      baseUrl: 'https://whitebit.com',
      requestsPerSecond: 4,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<Record<string, WhitebitTicker>>('/api/v4/public/ticker');
    const out: TickerSnapshot[] = [];
    for (const [symbol, t] of Object.entries(data || {})) {
      const s = snap(this.id, symbol, { bid: t.bid, ask: t.ask, last: t.last, volume24h: t.baseVolume });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ asks: [string, string][]; bids: [string, string][] }>(
      `/api/v4/public/depth?market=${encodeURIComponent(exchangeSymbol)}&limit=${Math.min(depth, 50)}`,
    );
    return parseArrayBook(data.asks, data.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'WhiteBIT spot fee' };
  }
}
