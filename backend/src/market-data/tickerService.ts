import type { TickerSnapshot } from '@arbihunt/shared';
import { config } from '../config';
import { logger } from '../logger';
import { getAdapters, getAdapter } from '../exchanges/registry';
import { bookToQuote } from '../exchanges/utils';

interface ExchangeState {
  bySymbol: Map<string, TickerSnapshot>;
  lastUpdate: number;
  quoteFallback: boolean;
  /** symbol -> last time a depth fetch for it failed, so we back off from
   * repeatedly hammering persistently-invalid symbols (e.g. LATOKEN's 400s). */
  failAt: Map<string, number>;
}

const NEEDS_QUOTE_FALLBACK = new Set(['lbank', 'xt', 'gemini']);

/** Skip re-fetching a symbol whose last depth attempt failed within this window
 * instead of wasting a request on a deterministic failure every full pass. */
const FALLBACK_FAIL_COOLDOWN_MS = 5 * 60 * 1000;
const FALLBACK_CONCURRENCY = 16;

export class TickerService {
  private states = new Map<string, ExchangeState>();
  private polling = false;
  private lastSuccess = new Map<string, number>();
  private lastAttempt = new Map<string, number>();

  getExchanges(): string[] {
    return [...this.states.keys()];
  }

  getSnapshot(exchange: string, exchangeSymbol: string): TickerSnapshot | undefined {
    return this.states.get(exchange)?.bySymbol.get(exchangeSymbol);
  }

  getAll(): TickerSnapshot[] {
    const out: TickerSnapshot[] = [];
    for (const state of this.states.values()) {
      for (const t of state.bySymbol.values()) out.push(t);
    }
    return out;
  }

  getByCanonical(canonical: string): TickerSnapshot[] {
    const out: TickerSnapshot[] = [];
    for (const [exchange, state] of this.states) {
      for (const t of state.bySymbol.values()) {
        if (t.base + '/' + t.quote === canonical && t.bid && t.ask) {
          out.push({ ...t, exchange });
        }
      }
    }
    return out;
  }

  getCanonicalSymbols(): Set<string> {
    const set = new Set<string>();
    for (const state of this.states.values()) {
      for (const t of state.bySymbol.values()) set.add(`${t.base}/${t.quote}`);
    }
    return set;
  }

  /** canonical symbols present on at least 2 exchanges (any bid/ask availability) */
  getIntersectingSymbols(): { canonical: string; exchanges: string[] }[] {
    const map = new Map<string, Set<string>>();
    for (const [exchange, state] of this.states) {
      for (const t of state.bySymbol.values()) {
        const key = `${t.base}/${t.quote}`;
        let set = map.get(key);
        if (!set) {
          set = new Set();
          map.set(key, set);
        }
        set.add(exchange);
      }
    }
    const out: { canonical: string; exchanges: string[] }[] = [];
    for (const [canonical, exchanges] of map) {
      if (exchanges.size >= 2) out.push({ canonical, exchanges: [...exchanges] });
    }
    return out;
  }

  updateFromWs(snapshot: TickerSnapshot): void {
    const state = this.states.get(snapshot.exchange);
    if (!state) return;
    state.bySymbol.set(snapshot.exchangeSymbol, snapshot);
    state.lastUpdate = Math.max(state.lastUpdate, snapshot.ts);
  }

  lastUpdate(exchange: string): number | undefined {
    // Most recent activity (successful fetch or WS tick), falling back to any
    // recent attempt so a transient failure still counts as "attempting".
    return this.lastSuccess.get(exchange) ?? this.states.get(exchange)?.lastUpdate;
  }

  marketsCount(exchange: string): number {
    return this.states.get(exchange)?.bySymbol.size ?? 0;
  }

  async start(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    const adapters = getAdapters();
    for (const a of adapters) {
      this.states.set(a.id, { bySymbol: new Map(), lastUpdate: 0, quoteFallback: NEEDS_QUOTE_FALLBACK.has(a.id), failAt: new Map() });
    }
    // One INDEPENDENT poll loop per exchange, with exponential backoff. A slow
    // or rate-limited exchange can never stall the others: each exchange keeps
    // its own schedule and connection state.
    for (const a of adapters) void this.pollLoop(a.id);
    void this.quoteFallbackLoop();
  }

  private async pollLoop(exchangeId: string): Promise<void> {
    const adapter = getAdapter(exchangeId);
    if (!adapter) return;
    let backoffMs = 1000;
    while (true) {
      const start = Date.now();
      const ok = await this.pollOnce(exchangeId);
      if (!ok) {
        // exponential backoff on failure, capped at 30s; keep lastUpdate fresh
        // enough that the exchange stays visible (as "reconnecting") instead of
        // silently dropping from the ACTIVE EXCHANGES count.
        await sleep(backoffMs);
        backoffMs = Math.min(30000, backoffMs * 2);
        continue;
      }
      backoffMs = 1000;
      const elapsed = Date.now() - start;
      const wait = Math.max(1000, config.tickerPollMs - elapsed);
      await sleep(wait);
    }
  }

  private async pollOnce(exchangeId: string): Promise<boolean> {
    const adapter = getAdapter(exchangeId);
    if (!adapter) return false;
    try {
      const tickers = await adapter.fetchTickers();
      const state = this.states.get(exchangeId);
      if (!state) return true;
      // MERGE, don't replace: some exchanges (lbank/xt/latoken/btse) expose a
      // bulk symbol list without bid/ask; their level-1 quotes are filled by
      // the slow quote-fallback loop. A full replace here would silently wipe
      // those filled quotes every poll and make those legs never surface.
      // Preserve any existing bid/ask when the fresh ticker lacks them.
      const map = new Map<string, TickerSnapshot>();
      for (const t of tickers) {
        if (!t.bid || !t.ask) {
          const existing = state.bySymbol.get(t.exchangeSymbol);
          if (existing && (existing.bid || existing.ask)) {
            map.set(t.exchangeSymbol, { ...t, bid: existing.bid, ask: existing.ask });
            continue;
          }
        }
        map.set(t.exchangeSymbol, t);
      }
      state.bySymbol = map;
      state.lastUpdate = Date.now();
      this.lastSuccess.set(exchangeId, Date.now());
      logger.debug(exchangeId, 'TICKERS', `polled ${tickers.length} symbols`, { status: 'SUCCESS' });
      return true;
    } catch (err) {
      logger.error(exchangeId, 'TICKERS', 'poll failed', err);
      return false;
    }
  }

  /**
   * Exchanges whose bulk ticker endpoint does not include bid/ask (LBank, XT,
   * LATOKEN, BTSE) get their best quotes by fetching depth(1) for EVERY symbol
   * that appears on at least one other exchange — a FULL pass each cycle, batched
   * in parallel — instead of a rotating cursor. The old cursor only visited 100
   * symbols per cycle and reset to 0 on every restart, leaving most symbols with
   * stale (or no) quotes for many cycles. A full pass guarantees the entire
   * intersecting universe is refreshed every cycle regardless of restarts.
   */
  private async quoteFallbackLoop(): Promise<void> {
    const fallbackExchanges = [...NEEDS_QUOTE_FALLBACK];
    while (true) {
      const intersecting = new Set(this.getIntersectingSymbols().map((i) => i.canonical));
      await Promise.all(
        fallbackExchanges.map((exchangeId) => this.quoteFallbackFullPass(exchangeId, intersecting)),
      );
      await sleep(5000);
    }
  }

  private async quoteFallbackFullPass(exchangeId: string, intersecting: Set<string>): Promise<void> {
    const adapter = getAdapter(exchangeId);
    const state = this.states.get(exchangeId);
    if (!adapter || !state) return;
    const now = Date.now();
    const relevant = [...state.bySymbol.entries()].filter(
      ([symbol, t]) =>
        t && intersecting.has(`${t.base}/${t.quote}`) && !((state.failAt.get(symbol) ?? 0) > now - FALLBACK_FAIL_COOLDOWN_MS),
    );
    if (relevant.length === 0) return;
    const started = Date.now();
    let filled = 0;
    await mapWithConcurrency(
      relevant,
      async ([symbol]) => {
        try {
          const book = await adapter.fetchOrderBook(symbol, 1);
          const quote = bookToQuote(exchangeId, symbol, book.asks, book.bids);
          if (quote && quote.bid && quote.ask) {
            const existing = state.bySymbol.get(symbol);
            if (existing) {
              state.bySymbol.set(symbol, { ...existing, bid: quote.bid, ask: quote.ask, ts: quote.ts });
              filled++;
            }
          }
          state.failAt.delete(symbol);
        } catch {
          state.failAt.set(symbol, Date.now());
        }
      },
      FALLBACK_CONCURRENCY,
    );
    logger.info(undefined, 'QUOTEFB', `${exchangeId} full pass ${relevant.length} symbols in ${Date.now() - started}ms, ${filled} quoted`);
  }

  prune(maxAgeMs = 90000): void {
    const now = Date.now();
    for (const [exchange, state] of this.states) {
      for (const [symbol, t] of state.bySymbol) {
        if (now - t.ts > maxAgeMs) state.bySymbol.delete(symbol);
      }
      if (state.bySymbol.size === 0 && now - state.lastUpdate > maxAgeMs) {
        this.states.delete(exchange);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export const tickerService = new TickerService();
