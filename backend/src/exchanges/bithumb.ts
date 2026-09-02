import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseObjectBook } from './utils';

interface BithumbAllTickerResponse {
  status: string;
  data: Record<string, BithumbTickerEntry | string>;
}

interface BithumbTickerEntry {
  opening_price: string;
  closing_price: string;
  min_price: string;
  max_price: string;
  average_price: string;
  units_traded: string;
  volume_1day: string;
  buy_price: string; // best bid
  sell_price: string; // best ask
  acc_trade_value: string;
  prev_closing_price: string;
}

export class BithumbAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'bithumb',
      name: 'Bithumb',
      baseUrl: 'https://api.bithumb.com',
      requestsPerSecond: 2,
      maxConcurrent: 4,
    });
  }

  private async fetchAll(payment: string): Promise<TickerSnapshot[]> {
    const { data } = await this.http.get<BithumbAllTickerResponse>(`/public/ticker/ALL_${payment}`);
    if (!data || data.status !== '0000') return [];
    const out: TickerSnapshot[] = [];
    for (const [currency, entry] of Object.entries(data.data || {})) {
      if (currency === 'date') continue;
      const t = entry as BithumbTickerEntry;
      if (!t || typeof t !== 'object') continue;
      // exchangeSymbol uses the underscore form ("BTC_KRW") which the shared
      // normalizer maps to canonical BTC/KRW.
      const s = snap(this.id, `${currency}_${payment}`, {
        bid: t.buy_price,
        ask: t.sell_price,
        last: t.closing_price,
        volume24h: t.volume_1day,
      });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    // Bithumb quotes KRW for most markets and USDT for a smaller set; both are
    // fetched independently so one failing doesn't break the other.
    const results = await Promise.allSettled([this.fetchAll('KRW'), this.fetchAll('USDT')]);
    const out: TickerSnapshot[] = [];
    for (const r of results) if (r.status === 'fulfilled') out.push(...r.value);
    if (out.length === 0) throw new Error('bithumb: no ticker data returned');
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const { data } = await this.http.get<{ status: string; data: { bids: { price: string; quantity: string }[]; asks: { price: string; quantity: string }[] } }>(
      `/public/orderbook/${encodeURIComponent(exchangeSymbol)}?count=${Math.min(depth, 100)}`,
    );
    if (data.status !== '0000') throw new Error(`bithumb orderbook error: ${data.status}`);
    return parseObjectBook(data.data);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.0004, maker: 0.0004, source: 'fallback', note: 'Bithumb flat spot fee' };
  }
}
