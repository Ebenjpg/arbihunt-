import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface BitstampPairInfo {
  name: string; // "BTC/USD"
  url_symbol: string; // "btcusd"
  trading: string; // "Enabled"
}

interface BitstampTicker {
  pair?: string;
  bid: string;
  ask: string;
  last: string;
  volume?: string;
}

export class BitstampAdapter extends BaseAdapter {
  private nameByUrl = new Map<string, string>(); // url_symbol (lower) -> pair name "BTC/USD"

  constructor() {
    super({
      id: 'bitstamp',
      name: 'Bitstamp',
      baseUrl: 'https://www.bitstamp.net',
      requestsPerSecond: 2,
      maxConcurrent: 4,
    });
  }

  private async ensurePairs(): Promise<void> {
    if (this.nameByUrl.size > 0) return;
    const { data } = await this.http.get<{ data: BitstampPairInfo[] }>('/api/v2/trading-pairs-info/');
    for (const p of data.data || []) {
      if (p.trading && p.trading !== 'Enabled') continue;
      this.nameByUrl.set(p.url_symbol.toLowerCase(), p.name);
    }
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    await this.ensurePairs();
    const { data } = await this.http.get<BitstampTicker[]>('/api/v2/ticker/');
    const out: TickerSnapshot[] = [];
    for (const t of data || []) {
      // Bitstamp's bulk ticker reports the pair in a slightly different shape
      // than trading-pairs-info, so try both url-symbol and name lookups.
      const raw = t.pair ?? '';
      const name = this.nameByUrl.get(raw.toLowerCase()) ?? raw;
      const s = snap(this.id, name, { bid: t.bid, ask: t.ask, last: t.last, volume24h: t.volume });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    // exchangeSymbol is the pair name "BTC/USD" -> url symbol "btcusd"
    const url = [...this.nameByUrl.entries()].find(([, name]) => name === exchangeSymbol)?.[0];
    if (!url) throw new Error(`unknown bitstamp symbol: ${exchangeSymbol}`);
    const { data } = await this.http.get<{ asks: string[][]; bids: string[][] }>(
      `/api/v2/order_book/${encodeURIComponent(url)}/?limit=${Math.min(depth, 1000)}`,
    );
    return parseArrayBook(data.asks, data.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.0035, maker: 0.0015, source: 'fallback', note: 'Bitstamp spot fee' };
  }
}
