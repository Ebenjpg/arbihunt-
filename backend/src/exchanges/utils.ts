import type { Level, TickerSnapshot } from '@arbihunt/shared';
import { normalizeSymbol } from '@arbihunt/shared';

export function snap(
  exchange: string,
  exchangeSymbol: string,
  fields: { bid?: unknown; ask?: unknown; last?: unknown; volume24h?: unknown },
  ts = Date.now(),
): TickerSnapshot | null {
  const parsed = normalizeSymbol(exchangeSymbol);
  if (!parsed) return null;
  const toStr = (v: unknown): string | undefined => {
    if (v === null || v === undefined || v === '') return undefined;
    const s = String(v).trim();
    if (s === '' || Number.isNaN(Number(s))) return undefined;
    return s;
  };
  return {
    exchange,
    exchangeSymbol,
    base: parsed.base,
    quote: parsed.quote,
    bid: toStr(fields.bid),
    ask: toStr(fields.ask),
    last: toStr(fields.last),
    volume24h: toStr(fields.volume24h),
    ts,
  };
}

/** Generic parser for the common [[price, qty], ...] order book shape. */
export function parseArrayBook(asksRaw: unknown, bidsRaw: unknown): { asks: Level[]; bids: Level[] } {
  return {
    asks: parsePairs(asksRaw),
    bids: parsePairs(bidsRaw),
  };
}

function parsePairs(raw: unknown): Level[] {
  if (!Array.isArray(raw)) return [];
  const levels: Level[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const price = String(row[0]);
    const quantity = String(row[1]);
    if (Number.isNaN(Number(price)) || Number.isNaN(Number(quantity))) continue;
    levels.push({ price, quantity });
  }
  return levels;
}

/** Parser for the [{price, amount}, ...] shape (BitMart style). */
export function parseObjectBook(raw: unknown): { asks: Level[]; bids: Level[] } {
  const parse = (list: unknown): Level[] => {
    if (!Array.isArray(list)) return [];
    const levels: Level[] = [];
    for (const item of list) {
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const price = o.price ?? o.p ?? o[0];
        const qty = o.amount ?? o.quantity ?? o.q ?? o[1];
        if (price !== undefined && qty !== undefined) {
          levels.push({ price: String(price), quantity: String(qty) });
        }
      }
    }
    return levels;
  };
  const asArr = raw as unknown;
  if (Array.isArray(asArr)) {
    return {
      asks: parse(asArr),
      bids: [],
    };
  }
  const o = (raw || {}) as Record<string, unknown>;
  return { asks: parse(o.asks), bids: parse(o.bids) };
}

/** Parses a first-level order book into a single best bid/ask quote. */
export function bookToQuote(exchange: string, symbol: string, asks: Level[], bids: Level[]): TickerSnapshot | null {
  const parsed = normalizeSymbol(symbol);
  if (!parsed) return null;
  const bestAsk = [...asks].sort((a, b) => Number(a.price) - Number(b.price))[0];
  const bestBid = [...bids].sort((a, b) => Number(b.price) - Number(a.price))[0];
  return {
    exchange,
    exchangeSymbol: symbol,
    base: parsed.base,
    quote: parsed.quote,
    bid: bestBid?.price,
    ask: bestAsk?.price,
    ts: Date.now(),
  };
}
