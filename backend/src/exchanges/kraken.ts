import { BaseAdapter } from './base';
import type { FeeInfo, TickerSnapshot, Level } from '@arbihunt/shared';
import { snap, parseArrayBook } from './utils';

interface KrakenAssetPair {
  altname: string;
  wsname: string;
  base: string;
  quote: string;
}

interface KrakenTicker {
  a?: string[]; // ask [price, wholeLotQty, lotQty]
  b?: string[]; // bid
  c?: string[]; // last trade [price, lotVolume]
  v?: string[]; // volume [today, last 24h]
}

interface KrakenDepthResult {
  asks: [string, string, number][];
  bids: [string, string, number][];
}

/** Kraken uses some legacy asset codes (XBT for BTC, XDG for DOGE). */
const KRAKEN_ASSET_MAP: Record<string, string> = { XBT: 'BTC', XDG: 'DOGE' };

export class KrakenAdapter extends BaseAdapter {
  private canonByResponseKey = new Map<string, string>(); // ticker/depth response key OR altname -> canonical
  private pairKeyByCanon = new Map<string, string>(); // canonical -> Kraken pair key (for depth requests)
  private pairsLoaded: Promise<void> | null = null;

  constructor() {
    super({
      id: 'kraken',
      name: 'Kraken',
      baseUrl: 'https://api.kraken.com',
      requestsPerSecond: 1,
      maxConcurrent: 2,
    });
  }

  private ensurePairs(): Promise<void> {
    if (!this.pairsLoaded) {
      this.pairsLoaded = this.loadPairs();
    }
    return this.pairsLoaded;
  }

  private async loadPairs(): Promise<void> {
    const { data } = await this.http.get<{ result: Record<string, KrakenAssetPair> }>('/0/public/AssetPairs');
    for (const [key, p] of Object.entries(data.result || {})) {
      if (key.includes('.')) continue; // skip dark-pool / .P variants
      const wsBase = p.wsname?.includes('/') ? p.wsname.split('/')[0] : p.base;
      const wsQuote = p.wsname?.includes('/') ? p.wsname.split('/')[1] : p.quote;
      const base = KRAKEN_ASSET_MAP[wsBase] ?? wsBase;
      const quote = KRAKEN_ASSET_MAP[wsQuote] ?? wsQuote;
      if (!base || !quote) continue;
      const canonical = `${base}/${quote}`;
      this.pairKeyByCanon.set(canonical, key);
      this.canonByResponseKey.set(key, canonical);
      if (p.altname) this.canonByResponseKey.set(p.altname, canonical);
    }
  }

  protected async requestTickers(): Promise<TickerSnapshot[]> {
    await this.ensurePairs();
    const { data } = await this.http.get<{ result: Record<string, KrakenTicker> }>('/0/public/Ticker');
    const out: TickerSnapshot[] = [];
    for (const [key, t] of Object.entries(data.result || {})) {
      const canonical = this.canonByResponseKey.get(key);
      if (!canonical) continue;
      const s = snap(this.id, canonical, {
        bid: t.b?.[0],
        ask: t.a?.[0],
        last: t.c?.[0],
        volume24h: t.v?.[1],
      });
      if (s) out.push(s);
    }
    return out;
  }

  protected async requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }> {
    const pair = this.pairKeyByCanon.get(exchangeSymbol);
    if (!pair) throw new Error(`unknown kraken symbol: ${exchangeSymbol}`);
    const { data } = await this.http.get<{ result: Record<string, KrakenDepthResult> }>(
      `/0/public/depth?pair=${encodeURIComponent(pair)}&count=${Math.min(depth, 500)}`,
    );
    const first = Object.values(data.result || {})[0];
    if (!first) return { asks: [], bids: [] };
    return parseArrayBook(first.asks, first.bids);
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0.0026, maker: 0.0016, source: 'fallback', note: 'Kraken spot starter fee' };
  }
}
