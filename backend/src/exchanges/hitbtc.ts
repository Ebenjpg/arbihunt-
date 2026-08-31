import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface HitbtcTicker {
  symbol?: string;
  ask?: string;
  bid?: string;
  last?: string;
  volume?: string;
  volume_quote?: string;
}

export class HitbtcAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'hitbtc',
      name: 'HitBTC',
      baseUrl: 'https://api.hitbtc.com',
      requestsPerSecond: 3,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<HitbtcTicker[] | Record<string, HitbtcTicker>>('/api/3/public/ticker');
    const out: TickerSnapshot[] = [];
    if (Array.isArray(data)) {
      for (const t of data) {
        const s = snap(this.id, t.symbol ?? '', { bid: t.bid, ask: t.ask, last: t.last, volume24h: t.volume_quote });
        if (s) out.push(s);
      }
    } else {
      for (const [symbol, t] of Object.entries(data || {})) {
        const s = snap(this.id, symbol, { bid: t.bid, ask: t.ask, last: t.last, volume24h: t.volume_quote });
        if (s) out.push(s);
      }
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ ask: [string, string][]; bid: [string, string][] }>(
      `/api/3/public/orderbook/${encodeURIComponent(exchangeSymbol)}?limit=${Math.min(depth, 50)}`,
    );
    return parseArrayBook(data.ask, data.bid);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'HitBTC spot fee' };
  }
}
