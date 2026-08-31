import type { FeeInfo, NetworkDescriptor, OrderBookSnapshot, TickerSnapshot, ExchangeStatus, ConnectionState, Level } from '@arbihunt/shared';
import { normalizeSymbol } from '@arbihunt/shared';
import { HttpClient } from '../httpClient';
import { logger } from '../logger';
import type { ExchangeAdapter } from './types';

export interface BaseAdapterOptions {
  id: string;
  name: string;
  baseUrl: string;
  takerFee?: number;
  makerFee?: number;
  requestsPerSecond?: number;
  maxConcurrent?: number;
  headers?: Record<string, string>;
}

export abstract class BaseAdapter implements ExchangeAdapter {
  readonly id: string;
  readonly name: string;
  wsCapable = false;

  protected http: HttpClient;
  protected status: ExchangeStatus;
  private marketsCache = new Map<string, { base: string; quote: string }>();
  private errors: string[] = [];

  constructor(options: BaseAdapterOptions) {
    this.id = options.id;
    this.name = options.name;
    this.http = new HttpClient({
      baseUrl: options.baseUrl,
      requestsPerSecond: options.requestsPerSecond ?? 5,
      maxConcurrent: options.maxConcurrent ?? 8,
      headers: options.headers,
      name: options.name,
    });
    this.status = {
      exchange: options.id,
      name: options.name,
      connection: 'offline',
      markets: 0,
      ws: 'none',
      rest: 'error',
      errorCount: 0,
    };
  }

  protected abstract requestTickers(): Promise<TickerSnapshot[]>;
  protected abstract requestOrderBook(exchangeSymbol: string, depth: number): Promise<{ asks: Level[]; bids: Level[] }>;

  protected parseSymbol(raw: string): { base: string; quote: string; canonical: string } | null {
    const cached = this.marketsCache.get(raw);
    if (cached) return { ...cached, canonical: `${cached.base}/${cached.quote}` };
    const n = normalizeSymbol(raw);
    if (!n) return null;
    this.marketsCache.set(raw, { base: n.base, quote: n.quote });
    return n;
  }

  protected pushError(message: string): void {
    this.errors.push(message);
    if (this.errors.length > 50) this.errors.shift();
  }

  async fetchTickers(): Promise<TickerSnapshot[]> {
    const start = Date.now();
    try {
      const tickers = await this.requestTickers();
      this.recordLatency(Date.now() - start);
      this.markConnected();
      this.markRested();
      this.status.markets = tickers.length;
      this.status.lastUpdate = Date.now();
      return tickers;
    } catch (err) {
      this.recordError(err);
      throw err;
    }
  }

  async fetchOrderBook(exchangeSymbol: string, depth = 20): Promise<OrderBookSnapshot> {
    const start = Date.now();
    try {
      const book = await this.requestOrderBook(exchangeSymbol, depth);
      this.recordLatency(Date.now() - start);
      this.markConnected();
      this.markRested();
      return {
        exchange: this.id,
        symbol: exchangeSymbol,
        asks: book.asks,
        bids: book.bids,
        ts: Date.now(),
        depth,
      };
    } catch (err) {
      this.recordError(err);
      throw err;
    }
  }

  getDefaultFees(): FeeInfo {
    return { taker: 0, maker: 0, source: 'fallback' };
  }

  getNetworkInfo(_asset: string): NetworkDescriptor[] | null {
    return null;
  }

  getStatus(): ExchangeStatus {
    const age = this.status.lastUpdate ? Date.now() - this.status.lastUpdate : undefined;
    return {
      ...this.status,
      lastUpdateAgeMs: age,
    };
  }

  recordError(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    this.status.errorCount += 1;
    this.status.connection = 'error';
    this.pushError(msg);
    logger.error(this.name, 'API', 'request failed', err);
  }

  recordLatency(ms: number): void {
    this.status.latencyMs = ms;
  }

  markConnected(): void {
    if (this.status.connection === 'error') {
      this.status.connection = 'connected';
      this.status.errorCount = 0;
    } else if (this.status.connection === 'offline') {
      this.status.connection = 'connected';
    }
  }

  markRested(): void {
    this.status.rest = 'ok';
  }

  setConnection(state: ConnectionState): void {
    this.status.connection = state;
  }

  setWs(state: ExchangeStatus['ws']): void {
    this.status.ws = state;
  }

  recentErrors(): string[] {
    return [...this.errors];
  }
}
