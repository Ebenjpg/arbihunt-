import { Decimal, toDec, num } from './decimal';
import { fillAsks, fillBids, sortAsks, sortBids, sanitizeLevels } from './orderbook';
import type { Level, OpportunityBreakdownItem } from '../types';

export interface ArbitrageSimParams {
  capital: Decimal.Value;
  asks: Level[];
  bids: Level[];
  buyFeeRate: number;
  sellFeeRate: number;
  withdrawalFeeAsset?: Decimal.Value;
  /** true when the source explicitly provides the withdrawal fee (even 0) */
  withdrawalFeeKnown?: boolean;
  minWithdrawal?: Decimal.Value;
}

export type ExecutableFlag =
  | 'EXECUTABLE'
  | 'INSUFFICIENT BUY LIQUIDITY'
  | 'INSUFFICIENT SELL LIQUIDITY'
  | 'WITHDRAWAL FEE EXCEEDS POSITION'
  | 'BELOW MIN WITHDRAWAL'
  | 'NEGATIVE PROFIT';

export interface ArbitrageSimResult {
  executable: boolean;
  executableFlag: ExecutableFlag;
  buySpend: Decimal;
  buyFeeUsd: Decimal;
  tokensReceived: Decimal;
  avgBuyPrice: Decimal;
  withdrawalFeeAsset: Decimal;
  withdrawalFeeUsd: Decimal;
  withdrawalFeeKnown: boolean;
  tokensArriving: Decimal;
  sellGross: Decimal;
  avgSellPrice: Decimal;
  sellFeeUsd: Decimal;
  sellNet: Decimal;
  finalCapital: Decimal;
  netProfitUsd: Decimal;
  netProfitPct: Decimal;
  grossSpreadPct: Decimal;
  effectiveSpreadPct: Decimal;
  slippageUsd: Decimal;
  slippagePct: Decimal;
  maxExecutableCapital: Decimal;
  buyLiquidityUsd: Decimal;
  sellLiquidityUsd: Decimal;
  unsoldTokens: Decimal;
  minWithdrawal: Decimal;
  breakdown: OpportunityBreakdownItem[];
}

/**
 * The single source of truth for the cross-exchange arbitrage simulation.
 *
 * START CAPITAL
 *   -> spend = capital / (1 + buyFee) fills the ask side of the buy book
 *   -> buy fee charged on spent notional (total outflow == capital)
 *   -> withdrawal/network fee deducted in asset units
 *   -> remaining tokens sold through the bid side of the sell book
 *   -> sell fee charged on gross proceeds
 *   -> FINAL CAPITAL = gross proceeds - sell fee
 *
 * NET PROFIT = FINAL CAPITAL - START CAPITAL
 */
export function simulateArbitrage(params: ArbitrageSimParams): ArbitrageSimResult {
  const capital = toDec(params.capital);
  const asks = sanitizeLevels(params.asks);
  const bids = sanitizeLevels(params.bids);
  const buyFeeRate = toDec(params.buyFeeRate || 0);
  const sellFeeRate = toDec(params.sellFeeRate || 0);
  const withdrawalFeeAsset = toDec(params.withdrawalFeeAsset ?? 0);
  const withdrawalFeeKnown = params.withdrawalFeeKnown !== false;
  const minWithdrawal = toDec(params.minWithdrawal ?? 0);

  const sortedAsks = sortAsks(asks);
  const sortedBids = sortBids(bids);
  const topAsk = sortedAsks.length ? toDec(sortedAsks[0].price) : null;
  const topBid = sortedBids.length ? toDec(sortedBids[0].price) : null;

  const buyLiquidityUsd = sortedAsks.reduce((acc, l) => acc.plus(toDec(l.price).times(toDec(l.quantity))), new Decimal(0));
  const sellTokenLiquidity = sortedBids.reduce((acc, l) => acc.plus(toDec(l.quantity)), new Decimal(0));
  const sellLiquidityUsd = sortedBids.reduce((acc, l) => acc.plus(toDec(l.price).times(toDec(l.quantity))), new Decimal(0));

  // Notional spent on the token itself so that spend + fee == capital exactly.
  const spendTarget = capital.div(new Decimal(1).plus(buyFeeRate));
  const buy = fillAsks(sortedAsks, spendTarget);
  const tokensReceived = buy.filledQty;
  const avgBuyPrice = buy.avgPrice;
  const buyFeeUsd = buy.notional.times(buyFeeRate);

  let executable = true;
  let executableFlag: ExecutableFlag = 'EXECUTABLE';

  if (tokensReceived.lte(0)) {
    return buildResult({
      params, capital, sortedAsks, sortedBids, topAsk, topBid,
      buy, buyFeeUsd, withdrawalFeeAsset, withdrawalFeeKnown, minWithdrawal,
      buyLiquidityUsd, sellLiquidityUsd, sellTokenLiquidity,
      executable: false,
      executableFlag: 'INSUFFICIENT BUY LIQUIDITY',
    });
  }

  const withdrawalFeeUsd = withdrawalFeeAsset.times(avgBuyPrice);
  const tokensArriving = tokensReceived.minus(withdrawalFeeAsset);

  if (tokensArriving.lte(0)) {
    return buildResult({
      params, capital, sortedAsks, sortedBids, topAsk, topBid,
      buy, buyFeeUsd, withdrawalFeeAsset, withdrawalFeeKnown, minWithdrawal,
      buyLiquidityUsd, sellLiquidityUsd, sellTokenLiquidity,
      executable: false,
      executableFlag: 'WITHDRAWAL FEE EXCEEDS POSITION',
    });
  }

  if (minWithdrawal.isPositive() && tokensReceived.lt(minWithdrawal)) {
    return buildResult({
      params, capital, sortedAsks, sortedBids, topAsk, topBid,
      buy, buyFeeUsd, withdrawalFeeAsset, withdrawalFeeKnown, minWithdrawal,
      buyLiquidityUsd, sellLiquidityUsd, sellTokenLiquidity,
      executable: false,
      executableFlag: 'BELOW MIN WITHDRAWAL',
    });
  }

  const sell = fillBids(sortedBids, tokensArriving);
  const sellGross = sell.notional;
  const avgSellPrice = sell.avgPrice;
  const sellFeeUsd = sellGross.times(sellFeeRate);
  const sellNet = sellGross.minus(sellFeeUsd);
  const unsoldTokens = tokensArriving.minus(sell.filledQty);

  let effExecutable: boolean = executable;
  let effFlag: ExecutableFlag = executableFlag;
  if (!buy.fullyFilled) {
    effExecutable = false;
    effFlag = 'INSUFFICIENT BUY LIQUIDITY';
  } else if (!sell.fullyFilled) {
    effExecutable = false;
    effFlag = 'INSUFFICIENT SELL LIQUIDITY';
  }

  const finalCapital = sellNet;
  const netProfitUsd = finalCapital.minus(capital);
  const netProfitPct = capital.isPositive() ? netProfitUsd.div(capital).times(100) : new Decimal(0);

  const grossSpreadPct = topAsk && topAsk.isPositive() && topBid
    ? topBid.minus(topAsk).div(topAsk).times(100)
    : new Decimal(0);

  const effectiveSpreadPct = avgBuyPrice.isPositive() && avgSellPrice.isPositive()
    ? avgSellPrice.minus(avgBuyPrice).div(avgBuyPrice).times(100)
    : new Decimal(0);

  // Slippage: difference between avg fill price and top-of-book, in USD.
  const buySlippage = avgBuyPrice.isPositive() && topAsk ? avgBuyPrice.minus(topAsk).times(tokensReceived) : new Decimal(0);
  const sellSlippage = topBid ? topBid.minus(avgSellPrice).times(sell.filledQty) : new Decimal(0);
  const slippageUsd = Decimal.max(0, buySlippage).plus(Decimal.max(0, sellSlippage));
  const slippagePct = capital.isPositive() ? slippageUsd.div(capital).times(100) : new Decimal(0);

  // Maximum executable capital: the most we could deploy given both books.
  const maxByBuy = buyLiquidityUsd;
  const maxBySell = avgBuyPrice.isPositive() ? sellTokenLiquidity.times(avgBuyPrice) : sellLiquidityUsd;
  const maxExecutableCapital = Decimal.max(0, Decimal.min(maxByBuy, maxBySell));

  if (effExecutable && netProfitUsd.lte(0)) {
    effExecutable = false;
    effFlag = 'NEGATIVE PROFIT';
  }

  return buildResult({
    params, capital, sortedAsks, sortedBids, topAsk, topBid,
    buy, buyFeeUsd, withdrawalFeeAsset, withdrawalFeeKnown, minWithdrawal,
    buyLiquidityUsd, sellLiquidityUsd, sellTokenLiquidity,
    tokensReceived, avgBuyPrice, withdrawalFeeUsd, tokensArriving,
    sell, sellGross, avgSellPrice, sellFeeUsd, sellNet, unsoldTokens,
    finalCapital, netProfitUsd, netProfitPct, grossSpreadPct,
    effectiveSpreadPct, slippageUsd, slippagePct, maxExecutableCapital,
    executable: effExecutable,
    executableFlag: effFlag,
  });
}

interface BuildOpts {
  params: ArbitrageSimParams;
  capital: Decimal;
  sortedAsks: Level[];
  sortedBids: Level[];
  topAsk: Decimal | null;
  topBid: Decimal | null;
  buy: ReturnType<typeof fillAsks>;
  buyFeeUsd: Decimal;
  withdrawalFeeAsset: Decimal;
  withdrawalFeeKnown: boolean;
  minWithdrawal: Decimal;
  buyLiquidityUsd: Decimal;
  sellLiquidityUsd: Decimal;
  sellTokenLiquidity: Decimal;
  tokensReceived?: Decimal;
  avgBuyPrice?: Decimal;
  withdrawalFeeUsd?: Decimal;
  tokensArriving?: Decimal;
  sell?: ReturnType<typeof fillBids>;
  sellGross?: Decimal;
  avgSellPrice?: Decimal;
  sellFeeUsd?: Decimal;
  sellNet?: Decimal;
  unsoldTokens?: Decimal;
  finalCapital?: Decimal;
  netProfitUsd?: Decimal;
  netProfitPct?: Decimal;
  grossSpreadPct?: Decimal;
  effectiveSpreadPct?: Decimal;
  slippageUsd?: Decimal;
  slippagePct?: Decimal;
  maxExecutableCapital?: Decimal;
  executable: boolean;
  executableFlag: ExecutableFlag;
}

function buildResult(o: BuildOpts): ArbitrageSimResult {
  const {
    params, capital, topAsk, topBid, buy, buyFeeUsd, withdrawalFeeAsset,
    withdrawalFeeKnown, minWithdrawal,
    buyLiquidityUsd, sellLiquidityUsd, sellTokenLiquidity,
  } = o;
  const tokensReceived = o.tokensReceived ?? buy.filledQty;
  const avgBuyPrice = o.avgBuyPrice ?? buy.avgPrice;
  const withdrawalFeeUsd = o.withdrawalFeeUsd ?? withdrawalFeeAsset.times(avgBuyPrice);
  const tokensArriving = o.tokensArriving ?? tokensReceived.minus(withdrawalFeeAsset);
  const sell = o.sell ?? { filledQty: new Decimal(0), notional: new Decimal(0), avgPrice: new Decimal(0), fullyFilled: false };
  const sellGross = o.sellGross ?? sell.notional;
  const avgSellPrice = o.avgSellPrice ?? sell.avgPrice;
  const sellFeeUsd = o.sellFeeUsd ?? sellGross.times(toDec(params.sellFeeRate || 0));
  const sellNet = o.sellNet ?? sellGross.minus(sellFeeUsd);
  const unsoldTokens = o.unsoldTokens ?? tokensArriving.minus(sell.filledQty);
  const finalCapital = o.finalCapital ?? sellNet;
  const netProfitUsd = o.netProfitUsd ?? finalCapital.minus(capital);
  const netProfitPct = o.netProfitPct ?? (capital.isPositive() ? netProfitUsd.div(capital).times(100) : new Decimal(0));
  const grossSpreadPct = o.grossSpreadPct ?? (topAsk && topAsk.isPositive() && topBid ? topBid.minus(topAsk).div(topAsk).times(100) : new Decimal(0));
  const effectiveSpreadPct = o.effectiveSpreadPct ?? (avgBuyPrice.isPositive() && avgSellPrice.isPositive() ? avgSellPrice.minus(avgBuyPrice).div(avgBuyPrice).times(100) : new Decimal(0));
  const slippageUsd = o.slippageUsd ?? new Decimal(0);
  const slippagePct = o.slippagePct ?? (capital.isPositive() ? slippageUsd.div(capital).times(100) : new Decimal(0));
  const maxExecutableCapital = o.maxExecutableCapital ?? Decimal.min(buyLiquidityUsd, sellTokenLiquidity.times(avgBuyPrice));

  const breakdown: OpportunityBreakdownItem[] = [
    { label: 'START', usd: fmtUsd(capital) },
    { label: 'BUY', usd: fmtSigned(buy.notional) },
    { label: 'BUY FEE', usd: fmtSigned(buyFeeUsd.neg()) },
    { label: 'WITHDRAWAL', usd: withdrawalFeeKnown ? fmtSigned(withdrawalFeeUsd.neg()) : 'UNKNOWN' },
    { label: 'SLIPPAGE', usd: fmtSigned(slippageUsd.neg()) },
    { label: 'SELL FEE', usd: fmtSigned(sellFeeUsd.neg()) },
    { label: 'FINAL VALUE', usd: fmtUsd(finalCapital) },
    { label: 'NET PROFIT', usd: fmtSigned(netProfitUsd) },
  ];

  return {
    executable: o.executable,
    executableFlag: o.executableFlag,
    buySpend: buy.notional,
    buyFeeUsd,
    tokensReceived,
    avgBuyPrice,
    withdrawalFeeAsset,
    withdrawalFeeUsd,
    withdrawalFeeKnown,
    tokensArriving,
    sellGross,
    avgSellPrice,
    sellFeeUsd,
    sellNet,
    finalCapital,
    netProfitUsd,
    netProfitPct,
    grossSpreadPct,
    effectiveSpreadPct,
    slippageUsd,
    slippagePct,
    maxExecutableCapital,
    buyLiquidityUsd,
    sellLiquidityUsd,
    unsoldTokens,
    minWithdrawal,
    breakdown,
  };
}

function fmtUsd(v: Decimal): string {
  return v.isNegative() ? `-$${v.abs().toFixed(2)}` : `$${v.toFixed(2)}`;
}
function fmtSigned(v: Decimal): string {
  return v.isNegative() ? `-$${v.abs().toFixed(2)}` : `+$${v.toFixed(2)}`;
}

export interface CalculatorSimParams {
  capital: number;
  buyPrice: number;
  sellPrice: number;
  buyFeePct: number;
  sellFeePct: number;
  withdrawalFeeAsset: number;
  slippagePct: number;
  withdrawalFeeKnown?: boolean;
}

export interface CalculatorSimResult {
  tokenQuantity: number;
  grossProfit: number;
  totalFees: number;
  finalValue: number;
  netProfit: number;
  netProfitPct: number;
  buyCost: number;
  buyFeeUsd: number;
  withdrawalFeeUsd: number;
  sellGross: number;
  sellFeeUsd: number;
  slippageUsd: number;
  breakdown: OpportunityBreakdownItem[];
}

/**
 * Simple single-price calculator used by the UI calculator page. It mirrors
 * the same formula chain as simulateArbitrage (no order book), so frontend
 * and backend never duplicate formulas.
 */
export function calculateSimple(p: CalculatorSimParams): CalculatorSimResult {
  const capital = toDec(p.capital);
  const buyPrice = toDec(p.buyPrice);
  const sellPrice = toDec(p.sellPrice);
  const buyFeeRate = toDec(p.buyFeePct).div(100);
  const sellFeeRate = toDec(p.sellFeePct).div(100);
  const slippagePct = toDec(p.slippagePct).div(100);

  const buySpend = capital.div(new Decimal(1).plus(buyFeeRate));
  const tokenQuantity = buyPrice.isPositive() ? buySpend.div(buyPrice) : new Decimal(0);
  const buyFeeUsd = buySpend.times(buyFeeRate);
  const withdrawalFeeAsset = toDec(p.withdrawalFeeAsset);
  const withdrawalFeeUsd = withdrawalFeeAsset.times(buyPrice);
  const tokensArriving = tokenQuantity.minus(withdrawalFeeAsset);
  const adjustedSellPrice = sellPrice.times(new Decimal(1).minus(slippagePct));
  const sellGross = tokensArriving.times(adjustedSellPrice);
  const sellFeeUsd = sellGross.times(sellFeeRate);
  const sellNet = sellGross.minus(sellFeeUsd);
  const slippageUsd = tokensArriving.times(sellPrice).times(slippagePct);
  const finalValue = sellNet;
  const netProfit = finalValue.minus(capital);
  const netProfitPct = capital.isPositive() ? netProfit.div(capital).times(100) : new Decimal(0);
  const totalFees = buyFeeUsd.plus(withdrawalFeeUsd).plus(sellFeeUsd).plus(slippageUsd);

  const breakdown: OpportunityBreakdownItem[] = [
    { label: 'START', usd: fmtUsd(capital) },
    { label: 'BUY', usd: fmtSigned(buySpend.neg()) },
    { label: 'BUY FEE', usd: fmtSigned(buyFeeUsd.neg()) },
    { label: 'WITHDRAWAL', usd: fmtSigned(withdrawalFeeUsd.neg()) },
    { label: 'SLIPPAGE', usd: fmtSigned(slippageUsd.neg()) },
    { label: 'SELL FEE', usd: fmtSigned(sellFeeUsd.neg()) },
    { label: 'FINAL VALUE', usd: fmtUsd(finalValue) },
    { label: 'NET PROFIT', usd: fmtSigned(netProfit) },
  ];

  return {
    tokenQuantity: num(tokenQuantity),
    grossProfit: num(sellGross.minus(buySpend)),
    totalFees: num(totalFees),
    finalValue: num(finalValue),
    netProfit: num(netProfit),
    netProfitPct: num(netProfitPct),
    buyCost: num(buySpend),
    buyFeeUsd: num(buyFeeUsd),
    withdrawalFeeUsd: num(withdrawalFeeUsd),
    sellGross: num(sellGross),
    sellFeeUsd: num(sellFeeUsd),
    slippageUsd: num(slippageUsd),
    breakdown,
  };
}
