import { Decimal, toDec, num } from './decimal';
import type { Level } from '../types';

export interface FillResult {
  filledQty: Decimal;
  notional: Decimal;
  avgPrice: Decimal;
  fullyFilled: boolean;
}

export interface BookStats {
  totalAskQty: Decimal;
  totalBidQty: Decimal;
  totalAskNotional: Decimal;
  totalBidNotional: Decimal;
  topAsk: Decimal | null;
  topBid: Decimal | null;
}

export function sortAsks(asks: Level[]): Level[] {
  return [...asks].sort((a, b) => toDec(a.price).cmp(b.price));
}

export function sortBids(bids: Level[]): Level[] {
  return [...bids].sort((a, b) => toDec(b.price).cmp(a.price));
}

export function sanitizeLevels(levels: Level[], maxCount = 50): Level[] {
  const clean: Level[] = [];
  for (const l of levels) {
    const price = toDec(l.price);
    const qty = toDec(l.quantity);
    if (price.isPositive() && qty.isPositive() && price.isFinite() && qty.isFinite()) {
      clean.push({ price: price.toString(), quantity: qty.toString() });
    }
    if (clean.length >= maxCount) break;
  }
  return clean;
}

/**
 * Walk the ask side of the book spending up to `spendNotional` (quote currency).
 * Returns quantity bought, notional spent and average price.
 */
export function fillAsks(asks: Level[], spendNotional: Decimal.Value): FillResult {
  const budget = toDec(spendNotional);
  let remaining = budget;
  let qty = new Decimal(0);
  let notional = new Decimal(0);
  const ordered = sortAsks(asks);

  for (const l of ordered) {
    if (remaining.lte(0)) break;
    const price = toDec(l.price);
    const available = toDec(l.quantity);
    const affordable = remaining.div(price);
    const buyQty = Decimal.min(available, affordable);
    qty = qty.plus(buyQty);
    const spend = buyQty.times(price);
    notional = notional.plus(spend);
    remaining = remaining.minus(spend);
  }

  const fullyFilled = remaining.lte(0) && qty.isPositive();
  const avgPrice = qty.isPositive() ? notional.div(qty) : new Decimal(0);
  return { filledQty: qty, notional, avgPrice, fullyFilled };
}

/**
 * Walk the bid side of the book selling `qty` tokens.
 * Returns quote currency received, average price and whether fully filled.
 */
export function fillBids(bids: Level[], qty: Decimal.Value): FillResult {
  const total = toDec(qty);
  let remaining = total;
  let received = new Decimal(0);
  let filled = new Decimal(0);
  const ordered = sortBids(bids);

  for (const l of ordered) {
    if (remaining.lte(0)) break;
    const price = toDec(l.price);
    const available = toDec(l.quantity);
    const sellQty = Decimal.min(available, remaining);
    filled = filled.plus(sellQty);
    received = received.plus(sellQty.times(price));
    remaining = remaining.minus(sellQty);
  }

  const fullyFilled = remaining.lte(0) && filled.isPositive();
  const avgPrice = filled.isPositive() ? received.div(filled) : new Decimal(0);
  return { filledQty: filled, notional: received, avgPrice, fullyFilled };
}

export function bookStats(asks: Level[], bids: Level[]): BookStats {
  let totalAskQty = new Decimal(0);
  let totalBidQty = new Decimal(0);
  let totalAskNotional = new Decimal(0);
  let totalBidNotional = new Decimal(0);
  for (const l of asks) {
    const p = toDec(l.price);
    const q = toDec(l.quantity);
    totalAskQty = totalAskQty.plus(q);
    totalAskNotional = totalAskNotional.plus(p.times(q));
  }
  for (const l of bids) {
    const p = toDec(l.price);
    const q = toDec(l.quantity);
    totalBidQty = totalBidQty.plus(q);
    totalBidNotional = totalBidNotional.plus(p.times(q));
  }
  const sortedAsks = sortAsks(asks);
  const sortedBids = sortBids(bids);
  return {
    totalAskQty,
    totalBidQty,
    totalAskNotional,
    totalBidNotional,
    topAsk: sortedAsks.length ? toDec(sortedAsks[0].price) : null,
    topBid: sortedBids.length ? toDec(sortedBids[0].price) : null,
  };
}

/**
 * Price impact (slippage) in USD for a market order, computed from the book.
 * Returns the difference between the volume-weighted average fill price and
 * the top-of-book price, expressed in quote currency and in percent.
 */
export function impactUsd(levels: Level[], qty: Decimal.Value, side: 'buy' | 'sell'): { usd: Decimal; pct: Decimal } {
  const fill = side === 'buy' ? fillAsks(levels, new Decimal(qty).times(topOr(levels, side))) : null;
  if (side === 'buy' && fill) {
    const top = topOr(levels, 'buy');
    const diff = fill.avgPrice.minus(top).times(fill.filledQty);
    const pct = fill.avgPrice.isPositive() ? fill.avgPrice.minus(top).div(fill.avgPrice).times(100) : new Decimal(0);
    return { usd: num(diff) >= 0 ? diff : new Decimal(0), pct };
  }
  const fillSell = fillBids(levels, qty);
  const topBid = topOr(levels, 'sell');
  const diff = topBid.minus(fillSell.avgPrice).times(fillSell.filledQty);
  const pct = topBid.isPositive() ? topBid.minus(fillSell.avgPrice).div(topBid).times(100) : new Decimal(0);
  return { usd: num(diff) >= 0 ? diff : new Decimal(0), pct };
}

function topOr(levels: Level[], side: 'buy' | 'sell'): Decimal {
  const sorted = side === 'buy' ? sortAsks(levels) : sortBids(levels);
  return sorted.length ? toDec(sorted[0].price) : new Decimal(0);
}
