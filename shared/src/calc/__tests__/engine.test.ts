import { describe, it, expect } from 'vitest';
import { fillAsks, fillBids, bookStats } from '../orderbook';
import { num } from '../decimal';
import { computeConfidence } from '../confidence';
import { freshnessLabel } from '../formatters';

function levels(pairs: [string, string][]) {
  return pairs.map(([price, quantity]) => ({ price, quantity }));
}

describe('order book simulation', () => {
  it('walks the ask side and computes volume weighted average price', () => {
    const res = fillAsks(levels([['1', '10'], ['1.1', '10']]), 15);
    expect(num(res.notional)).toBeCloseTo(15, 9);
    expect(num(res.filledQty)).toBeCloseTo(14.5454, 3);
    expect(num(res.avgPrice)).toBeCloseTo(1.03125, 5);
    expect(res.fullyFilled).toBe(true);
  });

  it('walks the bid side', () => {
    const res = fillBids(levels([['10', '5'], ['9.5', '5']]), 7);
    expect(num(res.filledQty)).toBe(7);
    expect(num(res.notional)).toBeCloseTo(69, 9);
    expect(res.fullyFilled).toBe(true);
  });

  it('reports partial fill when book runs out', () => {
    const res = fillBids(levels([['10', '2']]), 7);
    expect(res.fullyFilled).toBe(false);
    expect(num(res.filledQty)).toBe(2);
  });

  it('book stats compute liquidity', () => {
    const stats = bookStats(levels([['1', '100']]), levels([['2', '50']]));
    expect(num(stats.totalAskNotional)).toBe(100);
    expect(num(stats.totalBidNotional)).toBe(100);
    expect(num(stats.topAsk)).toBe(1);
    expect(num(stats.topBid)).toBe(2);
  });
});

describe('confidence score', () => {
  const base = {
    networkStatus: 'ok' as const,
    assetVerified: true,
    buyFeeSource: 'fallback' as const,
    sellFeeSource: 'fallback' as const,
    slippagePct: 0.3,
    executable: true,
    liquidityOk: true,
    freshMaxMs: 5000,
    staleMaxMs: 15000,
  };

  it('fresh verified executable opportunity is HIGH confidence', () => {
    const res = computeConfidence({ ...base, dataAgeMs: 1000 });
    expect(res.level).toBe('HIGH');
  });

  it('stale data downgrades confidence', () => {
    const res = computeConfidence({ ...base, dataAgeMs: 60000 });
    expect(res.level).toBe('LOW');
  });

  it('off-market quote downgrades confidence', () => {
    const res = computeConfidence({ ...base, dataAgeMs: 1000, offMarket: true });
    expect(res.level).toBe('MEDIUM');
    expect(res.reasons.join(' ')).toContain('median');
  });

  it('blocked transfer heavily reduces confidence', () => {
    const res = computeConfidence({ ...base, dataAgeMs: 1000, networkStatus: 'blocked', executable: false });
    expect(res.level).toBe('LOW');
  });

  it('freshness labels', () => {
    expect(freshnessLabel(1000, 5000, 15000)).toBe('FRESH');
    expect(freshnessLabel(8000, 5000, 15000)).toBe('AGING');
    expect(freshnessLabel(20000, 5000, 15000)).toBe('STALE');
  });
});
