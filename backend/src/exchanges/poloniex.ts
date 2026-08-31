import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface PoloniexTicker {
  symbol: string;
  highestBid?: string;
  lowestAsk?: string;
  lastTrade?: string;
  quoteVolume?: string;
}

export class PoloniexAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'poloniex',
      name: 'Poloniex',
      baseUrl: 'https://api.poloniex.com',
      requestsPerSecond: 3,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<PoloniexTicker[]>('/markets/ticker24h');
    const out: TickerSnapshot[] = [];
    for (const t of data || []) {
      const s = snap(this.id, t.symbol, { bid: t.highestBid, ask: t.lowestAsk, last: t.lastTrade, volume24h: t.quoteVolume });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ asks: [string, string][]; bids: [string, string][] }>(
      `/markets/${encodeURIComponent(exchangeSymbol)}/orderBook?limit=${Math.min(depth, 50)}`,
    );
    return parseArrayBook(data.asks, data.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'Poloniex spot fee' };
  }
}
