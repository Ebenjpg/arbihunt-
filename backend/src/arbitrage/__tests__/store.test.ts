import { describe, it, expect } from 'vitest';
import type { Opportunity } from '@arbihunt/shared';
import { OpportunityStore } from '../store';

function makeOpp(id: string, overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id,
    symbol: 'BTC/USDT',
    base: 'BTC',
    quote: 'USDT',
    buyExchange: 'binance',
    sellExchange: 'okx',
    buyPrice: 60000,
    sellPrice: 60100,
    buyTopAsk: 60000,
    sellTopBid: 60100,
    grossSpreadPct: 0.17,
    effectiveSpreadPct: 0.12,
    buyFeePct: 0.1,
    sellFeePct: 0.1,
    buyFeeSource: 'fallback',
    sellFeeSource: 'fallback',
    network: 'BTC',
    networkChain: 'Bitcoin',
    networkMatch: 'yes',
    withdrawalFeeAsset: '0.0001',
    withdrawalFeeUsd: 6,
    withdrawalFeeKnown: true,
    depositStatus: 'open',
    withdrawalStatus: 'open',
    buyLiquidityUsd: 5000,
    sellLiquidityUsd: 5000,
    slippageUsd: 0.5,
    slippagePct: 0.5,
    capital: 100,
    finalValue: 101.2,
    netProfitUsd: 1.2,
    netProfitPct: 1.2,
    transferStatus: 'READY',
    transferTimeEstimate: '~10-60 min',
    dataAgeMs: 1000,
    confidence: 'HIGH',
    confidenceReasons: [],
    assetVerified: true,
    maxExecutable: 5000,
    avgBuyPrice: 60000,
    avgSellPrice: 60100,
    breakdown: [],
    createdAt: Date.now(),
    lastUpdatedAt: Date.now(),
    ...overrides,
  };
}

describe('OpportunityStore', () => {
  it('sets and retrieves by id', () => {
    const store = new OpportunityStore();
    const opp = makeOpp('a');
    store.set(opp);
    expect(store.get('a')).toBe(opp);
  });

  it('updates an existing opportunity in place', () => {
    const store = new OpportunityStore();
    store.set(makeOpp('a', { netProfitPct: 1.2 }));
    const next = store.getOrUpdate('a', (existing) => ({ ...existing!, netProfitPct: 2.5 }));
    expect(next.netProfitPct).toBe(2.5);
    expect(store.get('a')!.netProfitPct).toBe(2.5);
  });

  it('prunes stale opportunities older than maxAgeMs', () => {
    const store = new OpportunityStore();
    const now = Date.now();
    store.set(makeOpp('fresh', { lastUpdatedAt: now }));
    store.set(makeOpp('stale', { lastUpdatedAt: now - 60_000 }));
    const removed = store.prune(30_000);
    expect(removed).toEqual(['stale']);
    expect(store.get('fresh')).toBeDefined();
    expect(store.get('stale')).toBeUndefined();
  });

  it('clears all opportunities', () => {
    const store = new OpportunityStore();
    store.set(makeOpp('a'));
    store.set(makeOpp('b'));
    store.clear();
    expect(store.size()).toBe(0);
  });
});
