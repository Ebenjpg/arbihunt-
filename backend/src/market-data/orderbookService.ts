import type { OrderBookSnapshot } from '@arbihunt/shared';
import { config } from '../config';
import { logger } from '../logger';
import { getAdapter } from '../exchanges/registry';
import { TtlCache } from '../cache';

export class OrderBookService {
  private cache = new TtlCache<string, OrderBookSnapshot>(config.orderbookPollMs * 3, config.orderBookCacheCapacity);

  async get(exchangeId: string, exchangeSymbol: string, depth?: number): Promise<OrderBookSnapshot> {
    const key = `${exchangeId}:${exchangeSymbol}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const adapter = getAdapter(exchangeId);
    if (!adapter) throw new Error(`Unknown exchange ${exchangeId}`);
    const book = await adapter.fetchOrderBook(exchangeSymbol, depth ?? config.orderBookDepth);
    this.cache.set(key, book, config.orderbookPollMs * 3);
    return book;
  }

  async getMany(exchangeId: string, symbols: string[], depth?: number): Promise<OrderBookSnapshot[]> {
    const out: OrderBookSnapshot[] = [];
    for (const symbol of symbols) {
      try {
        out.push(await this.get(exchangeId, symbol, depth));
      } catch (err) {
        logger.debug(exchangeId, 'ORDERBOOK', `skip ${symbol}`, { error: String(err) });
      }
    }
    return out;
  }

  clear(): void {
    this.cache.clear();
  }
}

export const orderBookService = new OrderBookService();
