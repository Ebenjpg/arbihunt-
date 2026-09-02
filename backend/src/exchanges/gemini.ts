import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseObjectBook } from './utils';

interface GeminiPriceFeedEntry {
  pair: string; // e.g. "BTCUSD"
  price: string;
  percentChange24h?: string;
}

export class GeminiAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'gemini',
      name: 'Gemini',
      baseUrl: 'https://api.gemini.com',
      requestsPerSecond: 2,
      maxConcurrent: 4,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    // Gemini's v2 bulk ticker endpoint is unavailable in some regions (404);
    // v1/pricefeed works everywhere, giving the last price for every symbol.
    // Best bid/ask are filled afterwards by the ticker service's quote
    // fallback loop via /v1/book/{symbol} (see NEEDS_QUOTE_FALLBACK).
    const { data } = await this.http.get<GeminiPriceFeedEntry[]>('/v1/pricefeed');
    const out: TickerSnapshot[] = [];
    for (const t of data || []) {
      const s = snap(this.id, t.pair, { last: t.price });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const sym = exchangeSymbol.toLowerCase();
    const { data } = await this.http.get<{ bids: { price: string; amount: string }[]; asks: { price: string; amount: string }[] }>(
      `/v1/book/${encodeURIComponent(sym)}?limit_bids=${Math.min(depth, 500)}&limit_asks=${Math.min(depth, 500)}`,
    );
    return parseObjectBook(data);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.0035, maker: 0.002, source: 'fallback', note: 'Gemini spot standard fee' };
  }
}
