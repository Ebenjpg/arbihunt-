import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface BitgetTicker {
  symbol: string;
  bidPr?: string;
  askPr?: string;
  bestBid?: string;
  bestAsk?: string;
  lastPr?: string;
  quoteVol?: string;
}

export class BitgetAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'bitget',
      name: 'Bitget',
      baseUrl: 'https://api.bitget.com',
      requestsPerSecond: 4,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<{ data: BitgetTicker[] }>('/api/v2/spot/market/tickers');
    const out: TickerSnapshot[] = [];
    for (const t of data.data || []) {
      const bid = t.bestBid ?? t.bidPr;
      const ask = t.bestAsk ?? t.askPr;
      const s = snap(this.id, t.symbol, { bid, ask, last: t.lastPr, volume24h: t.quoteVol });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ data: { asks: string[][]; bids: string[][] } }>(
      `/api/v2/spot/market/orderbook?symbol=${encodeURIComponent(exchangeSymbol)}&type=step0&limit=${Math.min(depth, 150)}`,
    );
    const book = data.data;
    if (!book) return { asks: [], bids: [] };
    return parseArrayBook(book.asks, book.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.001, maker: 0.001, source: 'fallback', note: 'Standard spot fee' };
  }
}
