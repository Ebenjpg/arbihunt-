import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { normalizeSymbol } from '@arbihunt/shared';
import { snap } from './utils';

interface PhemexSpotTicker {
  symbol: string;
  lastEp: number;
  bidEp: number;
  askEp: number;
  volumeEv?: number;
}

const SCALE = 10 ** 8;

export class PhemexAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'phemex',
      name: 'Phemex',
      baseUrl: 'https://api.phemex.com',
      requestsPerSecond: 3,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<{ result: PhemexSpotTicker[] }>('/md/spot/ticker/24hr/all');
    const out: TickerSnapshot[] = [];
    for (const t of data.result || []) {
      const s = snap(this.id, t.symbol, {
        bid: String(t.bidEp / SCALE),
        ask: String(t.askEp / SCALE),
        last: String(t.lastEp / SCALE),
        volume24h: t.volumeEv !== undefined ? String(t.volumeEv / SCALE) : undefined,
      });
      if (!s) continue;
      // Phemex prefixes spot symbols with "s" (e.g. sBTCUSDT); keep it as the
      // exchange symbol but normalize base/quote from the stripped form.
      const norm = normalizeSymbol(t.symbol.replace(/^s/i, ''));
      if (!norm) continue;
      out.push({ ...s, base: norm.base, quote: norm.quote });
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ result: { book: { asks: number[][]; bids: number[][] } } }>(
      `/md/orderbook?symbol=${encodeURIComponent(exchangeSymbol)}&depth=${Math.min(depth, 50)}`,
    );
    const book = data.result?.book;
    if (!book) return { asks: [], bids: [] };
    const toLevels = (rows: number[][]): Level[] =>
      rows.map(([price, qty]) => ({ price: String(price / SCALE), quantity: String(qty) }));
    return { asks: toLevels(book.asks), bids: toLevels(book.bids) };
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'Phemex spot fee' };
  }
}
