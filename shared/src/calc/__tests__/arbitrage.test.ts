import { describe, it, expect } from 'vitest';
import { simulateArbitrage } from '../arbitrage';
import { matchNetworks } from '../networks';
import { num } from '../decimal';

function book(asks: [string, string][], bids: [string, string][]) {
  return {
    asks: asks.map(([price, quantity]) => ({ price, quantity })),
    bids: bids.map(([price, quantity]) => ({ price, quantity })),
  };
}

describe('arbitrage simulation', () => {
  it('computes the exact $100 / buy 10 / sell 10.50 / 0.1% / 0.01 token fee example', () => {
    const { asks, bids } = book(
      [
        ['10.00', '100'],
      ],
      [
        ['10.50', '100'],
      ],
    );
    const r = simulateArbitrage({
      capital: 100,
      asks,
      bids,
      buyFeeRate: 0.001,
      sellFeeRate: 0.001,
      withdrawalFeeAsset: 0.01,
    });

    // spend = 100 / 1.001 = 99.9001
    expect(num(r.buySpend)).toBeCloseTo(99.9001, 4);
    // buy fee = 99.9001 * 0.001 = 0.0999
    expect(num(r.buyFeeUsd)).toBeCloseTo(0.0999, 4);
    // tokens = 99.9001 / 10 = 9.99001
    expect(num(r.tokensReceived)).toBeCloseTo(9.99001, 5);
    // withdrawal fee in USD = 0.01 * 10 = 0.10
    expect(num(r.withdrawalFeeUsd)).toBeCloseTo(0.10, 2);
    // tokens arriving = 9.98001
    expect(num(r.tokensArriving)).toBeCloseTo(9.98001, 5);
    // sell gross = 9.98001 * 10.50 = 104.7901
    expect(num(r.sellGross)).toBeCloseTo(104.7901, 3);
    // sell fee = 0.10479
    expect(num(r.sellFeeUsd)).toBeCloseTo(0.1048, 4);
    // final = 104.685
    expect(num(r.finalCapital)).toBeCloseTo(104.6853, 3);
    expect(num(r.netProfitUsd)).toBeCloseTo(4.6853, 3);
    expect(num(r.netProfitPct)).toBeCloseTo(4.6853, 3);
    expect(r.executable).toBe(true);
  });

  it('$100 example at parity with fees produces negative profit (unexecutable)', () => {
    const { asks, bids } = book(
      [
        ['100', '10'],
      ],
      [
        ['100', '10'],
      ],
    );
    const r = simulateArbitrage({
      capital: 100,
      asks,
      bids,
      buyFeeRate: 0.001,
      sellFeeRate: 0.001,
      withdrawalFeeAsset: 0.001,
    });
    expect(r.executable).toBe(false);
    expect(r.executableFlag).toBe('NEGATIVE PROFIT');
    expect(num(r.netProfitUsd)).toBeLessThan(0);
  });

  it('$1,000 calculation with deep book', () => {
    const { asks, bids } = book(
      [
        ['0.50', '5000'],
      ],
      [
        ['0.505', '5000'],
      ],
    );
    const r = simulateArbitrage({
      capital: 1000,
      asks,
      bids,
      buyFeeRate: 0.001,
      sellFeeRate: 0.001,
      withdrawalFeeAsset: 0.5,
    });
    expect(r.executable).toBe(true);
    expect(num(r.sellNet)).toBeGreaterThan(1000);
    expect(num(r.netProfitPct)).toBeGreaterThan(0);
  });

  it('insufficient buy liquidity marks opportunity non-executable', () => {
    const { asks, bids } = book(
      [
        ['1', '1'],
      ],
      [
        ['1.1', '1000'],
      ],
    );
    const r = simulateArbitrage({ capital: 100, asks, bids, buyFeeRate: 0.001, sellFeeRate: 0.001, withdrawalFeeAsset: 0.01 });
    expect(r.executable).toBe(false);
    expect(['INSUFFICIENT BUY LIQUIDITY']).toContain(r.executableFlag);
  });

  it('insufficient sell liquidity marks opportunity non-executable', () => {
    const { asks, bids } = book(
      [
        ['1', '1000'],
      ],
      [
        ['1.1', '1'],
      ],
    );
    const r = simulateArbitrage({ capital: 100, asks, bids, buyFeeRate: 0.001, sellFeeRate: 0.001, withdrawalFeeAsset: 0.01 });
    expect(r.executable).toBe(false);
    expect(['INSUFFICIENT SELL LIQUIDITY']).toContain(r.executableFlag);
  });

  it('withdrawal fee consuming the whole position blocks the trade', () => {
    const { asks, bids } = book(
      [
        ['1', '1000'],
      ],
      [
        ['1.1', '1000'],
      ],
    );
    const r = simulateArbitrage({ capital: 100, asks, bids, buyFeeRate: 0.001, sellFeeRate: 0.001, withdrawalFeeAsset: 500 });
    expect(r.executable).toBe(false);
    expect(r.executableFlag).toBe('WITHDRAWAL FEE EXCEEDS POSITION');
  });

  it('applies slippage correctly when the book is thin', () => {
    const { asks, bids } = book(
      [
        ['1', '50'],
        ['1.01', '50'],
      ],
      [
        ['1.05', '40'],
        ['1.04', '60'],
      ],
    );
    const r = simulateArbitrage({ capital: 100, asks, bids, buyFeeRate: 0.001, sellFeeRate: 0.001, withdrawalFeeAsset: 0 });
    // Avg buy price must be higher than the top ask because second level is used
    expect(num(r.avgBuyPrice)).toBeGreaterThan(1);
    expect(num(r.avgSellPrice)).toBeLessThan(1.05);
    expect(num(r.slippageUsd)).toBeGreaterThan(0);
  });

  it('breakdown is internally consistent: start = buy + buy fee', () => {
    const { asks, bids } = book(
      [
        ['10', '100'],
      ],
      [
        ['10.4', '100'],
      ],
    );
    const r = simulateArbitrage({ capital: 100, asks, bids, buyFeeRate: 0.001, sellFeeRate: 0.001, withdrawalFeeAsset: 0.01 });
    expect(num(r.buySpend) + num(r.buyFeeUsd)).toBeCloseTo(100, 6);
  });

  it('unknown withdrawal fee is flagged (not treated as zero-fee)', () => {
    const { asks, bids } = book([['10', '100']], [['10.4', '100']]);
    const known = simulateArbitrage({ capital: 100, asks, bids, buyFeeRate: 0.001, sellFeeRate: 0.001, withdrawalFeeAsset: 0.01, withdrawalFeeKnown: true });
    const unknown = simulateArbitrage({ capital: 100, asks, bids, buyFeeRate: 0.001, sellFeeRate: 0.001, withdrawalFeeAsset: 0.01, withdrawalFeeKnown: false });
    expect(known.withdrawalFeeKnown).toBe(true);
    expect(unknown.withdrawalFeeKnown).toBe(false);
    // In the unknown case the fee amount is not silently dropped into a 0-cost line item.
    const unknownWithdrawal = unknown.breakdown.find((b) => b.label === 'WITHDRAWAL');
    expect(unknownWithdrawal?.usd).toBe('UNKNOWN');
  });

  it('withdrawal fee defaults to known when the flag is omitted (backward compatible)', () => {
    const { asks, bids } = book([['10', '100']], [['10.4', '100']]);
    const r = simulateArbitrage({ capital: 100, asks, bids, buyFeeRate: 0.001, sellFeeRate: 0.001, withdrawalFeeAsset: 0 });
    expect(r.withdrawalFeeKnown).toBe(true);
  });

  it('large withdrawal fee reduces net profit and can make it negative', () => {
    const { asks, bids } = book([['10', '100']], [['10.6', '100']]);
    const r = simulateArbitrage({ capital: 100, asks, bids, buyFeeRate: 0.001, sellFeeRate: 0.001, withdrawalFeeAsset: 8 });
    // 8 tokens * ~$10 buy price = ~$80 fee, far exceeding a slim gross
    expect(num(r.netProfitUsd)).toBeLessThan(0);
    expect(r.executable).toBe(false);
    expect(r.executableFlag).toContain('NEGATIVE');
  });

  it('verified zero withdrawal fee stays $0.00 and does not inflate', () => {
    const { asks, bids } = book([['10', '100']], [['10.4', '100']]);
    const r = simulateArbitrage({ capital: 100, asks, bids, buyFeeRate: 0.001, sellFeeRate: 0.001, withdrawalFeeAsset: 0, withdrawalFeeKnown: true });
    expect(r.withdrawalFeeKnown).toBe(true);
    expect(num(r.withdrawalFeeUsd)).toBe(0);
    // Withdrawal fee zero is shown as a normal signed line item (not UNKNOWN).
    expect(r.breakdown.find((b) => b.label === 'WITHDRAWAL')?.usd).toBe('-$0.00');
  });

  it('connects selected network fee -> reduced transferred quantity -> lower net profit', () => {
    // Build two exchanges: buy has TRC20/ERC20/BEP20 withdrawal; sell has TRC20/BEP20 deposit.
    const net = (id: string, fee: string) => ({
      id, chain: id, withdrawalFee: fee,
      depositEnabled: 'open' as const, withdrawalEnabled: 'open' as const, source: 'default' as const,
    });
    const from = [net('TRC20', '1'), net('ERC20', '5'), net('BEP20', '0.5')];
    const to = [net('TRC20', '1'), net('BEP20', '0.5')];
    const match = matchNetworks({ from, to, price: 1 });
    expect(match.status).toBe('ok');
    expect(match.recommended?.id).toBe('BEP20'); // cheapest valid route

    const { asks, bids } = book([['10', '100']], [['10.4', '100']]);
    const r = simulateArbitrage({
      capital: 100,
      asks,
      bids,
      buyFeeRate: 0.001,
      sellFeeRate: 0.001,
      withdrawalFeeAsset: match.recommended?.withdrawalFee,
      withdrawalFeeKnown: true,
    });

    // 0.5 BEP20 fee * ~$10 buy price = ~$5 reduced from gross.
    expect(num(r.withdrawalFeeUsd)).toBeCloseTo(5, 0);
    // Without the fee the arrive amount would equal tokensReceived; with it, lower.
    expect(num(r.tokensArriving)).toBeLessThan(num(r.tokensReceived));
    expect(r.breakdown.find((b) => b.label === 'WITHDRAWAL')?.usd).not.toBe('UNKNOWN');
  });
});
