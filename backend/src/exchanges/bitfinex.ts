import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap } from './utils';

function bitfinexSymbolToStandard(raw: string): string {
  let s = raw.replace(/^t/, '');
  if (s.endsWith('UST')) return s.replace(/UST$/, 'USDT');
  if (s.endsWith('USD')) return s;
  if (s.endsWith('EUR')) return s;
  return s;
}

export class BitfinexAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'bitfinex',
      name: 'Bitfinex',
      baseUrl: 'https://api-pub.bitfinex.com',
      requestsPerSecond: 4,
    });
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<(string | number)[][]>('/v2/tickers?symbols=ALL');
    const out: TickerSnapshot[] = [];
    for (const row of data || []) {
      const symbol = String(row[0]);
      const bid = row[1];
      const ask = row[3];
      const last = row[7];
      const volQuote = row[8];
      const s = snap(this.id, bitfinexSymbolToStandard(symbol), { bid, ask, last, volume24h: volQuote });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<(number[] | string)[]>(
      `/v2/book/${encodeURIComponent(exchangeSymbol)}/P0?len=${Math.min(depth, 100)}`,
    );
    const asks: Level[] = [];
    const bids: Level[] = [];
    for (const row of data || []) {
      if (!Array.isArray(row) || row.length < 3) continue;
      const price = String(row[0]);
      const amount = Number(row[2]);
      if (amount === 0) continue;
      if (amount < 0) asks.push({ price, quantity: String(Math.abs(amount)) });
      else bids.push({ price, quantity: String(amount) });
    }
    return { asks, bids };
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.002, maker: 0.001, source: 'fallback', note: 'Bitfinex base fee' };
  }
}
