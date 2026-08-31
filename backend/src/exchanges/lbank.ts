import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

// LBank has no bulk ticker endpoint. We discover the full pair universe from
// /v2/currencyPairs.do, then register each symbol so the quote-fallback service
// can fill level-1 bid/ask for the intersecting subset (including long-tail
// assets like INDEX).
export class LbankAdapter extends BaseAdapter {
  private symbolsCache: { symbols: string[]; ts: number } = { symbols: [], ts: 0 };
  private readonly symbolsTtlMs = 30 * 60 * 1000;

  constructor() {
    super({
      id: 'lbank',
      name: 'LBank',
      baseUrl: 'https://api.lbank.info',
      requestsPerSecond: 6,
    });
  }

  private async getSymbols(): Promise<string[]> {
    if (this.symbolsCache.symbols.length && Date.now() - this.symbolsCache.ts < this.symbolsTtlMs) {
      return this.symbolsCache.symbols;
    }
    const { data } = await this.http.get<{ data?: string[] }>('/v2/currencyPairs.do');
    const list = Array.isArray(data?.data) ? data.data.filter((s) => typeof s === 'string') : [];
    this.symbolsCache = { symbols: list, ts: Date.now() };
    return list;
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    // Register the ENTIRE pair universe (1,350+) so long-tail assets like INDEX
    // are discoverable. LBank's bulk ticker lacks bid/ask; the quote-fallback
    // service fills level-1 quotes for the intersecting subset via depth(1).
    // Registering a symbol here (even without a price) is what makes it eligible
    // for that fallback and for cross-exchange intersection.
    const symbols = await this.getSymbols();
    const out: TickerSnapshot[] = [];
    for (const symbol of symbols) {
      const s = snap(this.id, symbol, {});
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ data: { asks: string[][]; bids: string[][] } }>(
      `/v2/depth.do?symbol=${encodeURIComponent(exchangeSymbol)}&size=${Math.min(depth, 60)}`,
    );
    const book = data.data;
    if (!book) return { asks: [], bids: [] };
    return parseArrayBook(book.asks, book.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'LBank spot fee' };
  }
}
