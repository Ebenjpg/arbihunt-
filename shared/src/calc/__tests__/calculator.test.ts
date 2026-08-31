import { describe, it, expect } from 'vitest';
import { calculateSimple } from '../arbitrage';

describe('simple calculator (shared engine)', () => {
  it('matches the required $100 worked example', () => {
    const r = calculateSimple({
      capital: 100,
      buyPrice: 0.1,
      sellPrice: 0.105,
      buyFeePct: 0.1,
      sellFeePct: 0.1,
      withdrawalFeeAsset: 0.5,
      slippagePct: 0.2,
    });
    expect(r.tokenQuantity).toBeCloseTo(999.001, 2); // buy spend 99.9001 / 0.1
    expect(r.finalValue).toBeGreaterThan(0);
    expect(r.netProfitPct).toBeGreaterThan(0);
  });

  it('produces negative profit when spread is too small', () => {
    const r = calculateSimple({
      capital: 100,
      buyPrice: 10,
      sellPrice: 10.0,
      buyFeePct: 0.1,
      sellFeePct: 0.1,
      withdrawalFeeAsset: 0.01,
      slippagePct: 0.1,
    });
    expect(r.netProfit).toBeLessThan(0);
    expect(r.netProfitPct).toBeLessThan(0);
  });

  it('breakdown is consistent (start = buy cost + buy fee)', () => {
    const r = calculateSimple({
      capital: 100,
      buyPrice: 1,
      sellPrice: 1.02,
      buyFeePct: 0.1,
      sellFeePct: 0.1,
      withdrawalFeeAsset: 0.1,
      slippagePct: 0.1,
    });
    expect(r.buyCost + r.buyFeeUsd).toBeCloseTo(100, 6);
    expect(r.breakdown).toHaveLength(8);
  });
});
