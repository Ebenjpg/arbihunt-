import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseObjectBook } from './utils';

interface LatokenTicker {
  symbol: string;
  lastPrice?: string;
  bid?: string;
  ask?: string;
  volume?: string;
  /** Exchange-reported quote time (ms) — LATOKEN caches quotes for hours on
   *  dormant markets, so trusting our fetch time hides that the price is stale. */
  updateTimestamp?: string | number;
}

export class LatokenAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'latoken',
      name: 'LATOKEN',
      baseUrl: 'https://api.latoken.com',
      requestsPerSecond: 3,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<LatokenTicker[]>('/api/v2/ticker');
    const out: TickerSnapshot[] = [];
    for (const t of data || []) {
      const tsRaw = Number(t.updateTimestamp);
      const ts = Number.isFinite(tsRaw) && tsRaw > 0 ? tsRaw : Date.now();
      const s = snap(this.id, t.symbol, { bid: t.bid, ask: t.ask, last: t.lastPrice, volume24h: t.volume }, ts);
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    // LATOKEN's book endpoint requires the raw slash ("ACH/USDT") — an
    // percent-encoded "ACH%2FUSDT" is rejected with HTTP 400. Splitting on the
    // base/quote boundary keeps the path safe while leaving the slash intact.
    const safe = exchangeSymbol.includes('/')
      ? exchangeSymbol.split('/').map((p) => encodeURIComponent(p)).join('/')
      : exchangeSymbol;
    const { data } = await this.http.get<Record<string, unknown>>(
      `/api/v2/book/${safe}?limit=${Math.min(depth, 50)}`,
    );
    if (!data) return { asks: [], bids: [] };
    // LATOKEN returns top-level { ask: [{price, quantity, ...}], bid: [...] }.
    const book = { asks: data.ask, bids: data.bid };
    return parseObjectBook(book);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'LATOKEN spot fee' };
  }
}
